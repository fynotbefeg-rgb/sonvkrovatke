import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {validateManifest, scriptHash} from './approval-manifest.mjs';

const sheetId = '1DZVjhxTOlFZnVynDgeIUS5nXjVxxmZpsDZYeBiZ0XN0';
const source = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const draft = () => ({topic_id: 'test-hooks', hook_id: 1, version_id: 'R-test-hooks-h1', script_revision: 1,
  hook_text: 'Первый шаг', script_text: 'Первый шаг должен быть понятным. 👋', status: 'pending_approval'});
const rowOf = item => [item.topic_id, item.hook_id, item.version_id, item.script_revision, item.hook_text,
  item.script_text, 'На проверке', '', '', '', 'Ожидает утверждения'];

function harness() {
  const rows = [Array(11).fill('header'), rowOf(draft())];
  const properties = new Map([['ROMAN_REELS_WEBHOOK_TOKEN', 'local-test-token'], ['ROMAN_APPROVER_EMAILS', 'roman@example.test']]);
  const triggers = [{getHandlerFunction: () => 'checkApprovedScripts'}, {getHandlerFunction: () => 'checkProductionSafety'}];
  let locked = false;
  const sheet = {getName: () => 'Сценарии', getLastRow: () => rows.length,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getSheet: () => sheet, getRow: () => r, getColumn: () => c, getLastRow: () => r + nr - 1,
      getNumRows: () => nr, getNumColumns: () => nc,
      getValues: () => Array.from({length: nr}, (_, i) => Array.from({length: nc}, (_, j) => rows[r + i - 1]?.[c + j - 1] ?? '')),
      getFormulas: () => Array.from({length: nr}, (_, i) => Array.from({length: nc}, (_, j) => {
        const value = rows[r + i - 1]?.[c + j - 1];
        return typeof value === 'string' && value.startsWith('=') ? value : '';
      })),
      setValue(value) { this.setValues([[value]]); },
      setValues(values) {
        for (let i = 0; i < nr; i++) {
          rows[r + i - 1] ??= Array(11).fill('');
          for (let j = 0; j < nc; j++) rows[r + i - 1][c + j - 1] = values[i][j];
        }
      },
    }),
  };
  const context = vm.createContext({
    SpreadsheetApp: {openById: id => { assert.equal(id, sheetId); return {getSheetByName: () => sheet}; }, flush() {}},
    PropertiesService: {getScriptProperties: () => ({getProperty: key => properties.get(key) ?? null,
      setProperty: (key, value) => properties.set(key, value), deleteProperty: key => properties.delete(key)})},
    LockService: {getScriptLock: () => ({tryLock: () => { assert.equal(locked, false, 'nested lock'); locked = true; return true; }, releaseLock: () => { locked = false; }})},
    Utilities: {DigestAlgorithm: {SHA_256: 'sha256'}, Charset: {UTF_8: 'utf8'},
      computeDigest: (algorithm, payload) => [...createHash(algorithm).update(payload).digest()].map(b => b > 127 ? b - 256 : b)},
    ContentService: {MimeType: {JSON: 'json'}, createTextOutput: content => ({content, setMimeType() { return this; }})},
    Logger: {log() {}},
    ScriptApp: {getProjectTriggers: () => triggers, newTrigger: handler => ({forSpreadsheet: () => ({onEdit: () => ({create: () => triggers.push({getHandlerFunction: () => handler})})})})},
  });
  vm.runInContext(source, context);
  const edit = (column, email = 'roman@example.test', options = {}) => context.onRomanApprovalEdit({
    range: sheet.getRange(2, column, options.numRows ?? 1, options.numColumns ?? 1),
    source: {getId: () => options.sheetId ?? sheetId},
    user: email === null ? undefined : {getEmail: () => email}, oldValue: options.oldValue,
  });
  const post = body => JSON.parse(context.doPost({postData: {contents: JSON.stringify(body)}}).content);
  return {context, rows, properties, triggers, edit, post};
}

test('authorized edit creates a receipt and a queue compatible with Node approval validator', () => {
  const h = harness();
  h.rows[1][6] = 'Утверждено';
  h.edit(7);
  const response = h.post({token: 'local-test-token', action: 'get_production_queue'});
  assert.equal(response.ok, true);
  assert.equal(response.items.length, 1);
  validateManifest(response);
  assert.equal(response.items[0].script_hash, scriptHash(response.items[0]));
  assert.equal(response.items[0].approved_by, 'roman@example.test');
  assert.equal(h.rows[1][10], 'Готов к производству');
});

test('missing or unauthorized editor identity cannot approve', () => {
  for (const email of [null, '', 'other@example.test']) {
    const h = harness();
    h.rows[1][6] = 'Утверждено';
    h.edit(7, email);
    assert.equal(h.context.getApprovedProductionQueue().length, 0);
    assert.equal(h.rows[1][6], 'На проверке');
    assert.equal(h.rows[1][10], 'Ожидает утверждения');
    assert.equal(h.properties.has('ROMAN_APPROVAL:R-test-hooks-h1'), false);
  }
});

test('a forged approved dropdown, email and correct hash cannot bypass server receipt', () => {
  const h = harness();
  h.rows[1].splice(6, 5, 'Утверждено', '2026-10-09T12:00:00Z', 'roman@example.test', scriptHash(draft()), 'Готов к производству');
  assert.equal(h.context.getApprovedProductionQueue().length, 0);
  h.context.checkProductionSafety();
  assert.equal(h.rows[1][6], 'На проверке');
  assert.equal(h.rows[1][9], '');
});

test('changed text or revision is blocked immediately, before the safety timer', () => {
  for (const [column, value] of [[5, 'Новая речь'], [3, 2]]) {
    const h = harness();
    h.rows[1][6] = 'Утверждено';
    h.edit(7);
    h.rows[1][column] = value;
    assert.equal(h.context.getApprovedProductionQueue().length, 0);
    h.context.checkProductionSafety();
    assert.equal(h.rows[1][6], 'На проверке');
  }
});

test('content edits, metadata edits, bulk approval and rejection revoke a receipt', () => {
  for (const column of [6, 8, 10]) {
    const h = harness();
    h.rows[1][6] = 'Утверждено';
    h.edit(7);
    h.edit(column);
    assert.equal(h.context.getApprovedProductionQueue().length, 0);
    assert.equal(h.properties.has('ROMAN_APPROVAL:R-test-hooks-h1'), false);
  }
  const h = harness();
  h.rows.push(rowOf({...draft(), hook_id: 2, version_id: 'R-test-hooks-h2'}));
  h.rows[1][6] = h.rows[2][6] = 'Утверждено';
  h.edit(7, 'roman@example.test', {numRows: 2});
  assert.equal(h.context.getApprovedProductionQueue().length, 0);
  h.rows[1][6] = 'Утверждено';
  h.edit(7);
  h.rows[1][6] = 'На доработку';
  h.edit(7);
  assert.equal(h.rows[1][6], 'На доработку');
  assert.equal(h.context.getApprovedProductionQueue().length, 0);
});

test('duplicate version IDs and sheet formulas cannot enter the queue', () => {
  const h = harness();
  h.rows[1][6] = 'Утверждено';
  h.edit(7);
  h.rows.push([...h.rows[1]]);
  assert.equal(h.context.getApprovedProductionQueue().length, 0);
  h.rows.pop();
  h.rows[1][5] = '=1+1';
  assert.equal(h.context.getApprovedProductionQueue().length, 0);
});

test('webhook rejects missing token, malformed JSON, unknown action and unauthenticated GET', () => {
  const h = harness();
  assert.equal(h.post({action: 'get_production_queue'}).ok, false);
  assert.equal(h.post({token: 'wrong', items: [draft()]}).ok, false);
  assert.equal(h.post({token: 'local-test-token', action: 'unknown'}).ok, false);
  assert.equal(JSON.parse(h.context.doPost({postData: {contents: '{'}}).content).ok, false);
  assert.equal(JSON.parse(h.context.doGet().content).ok, false);
  assert.equal(h.rows.length, 2);
});

test('draft intake is validated before writes and preserves existing rows', () => {
  const h = harness();
  const changed = {...draft(), script_text: 'Попытка перезаписать'};
  assert.equal(h.post({token: 'local-test-token', items: [changed]}).added, 0);
  assert.equal(h.rows[1][5], draft().script_text);
  const next = {...draft(), hook_id: 2, version_id: 'R-test-hooks-h2'};
  const invalid = {...draft(), hook_id: 3, version_id: 'R-test-hooks-h3', script_text: '=IMPORTXML("test", "//x")'};
  assert.equal(h.post({token: 'local-test-token', items: [next, invalid]}).ok, false);
  assert.equal(h.rows.length, 2);
  assert.equal(h.post({token: 'local-test-token', items: [next]}).added, 1);
  assert.equal(h.rows[2][6], 'На проверке');
  assert.equal(h.rows[2][9], '');
});

test('revoked approver is removed from the queue and setup retains existing triggers', () => {
  const h = harness();
  h.rows[1][6] = 'Утверждено';
  h.edit(7);
  h.properties.set('ROMAN_APPROVER_EMAILS', 'new@example.test');
  assert.equal(h.context.getApprovedProductionQueue().length, 0);
  h.context.setupRomanApproval();
  h.context.setupRomanApproval();
  assert.equal(h.triggers.length, 3);
  h.properties.delete('ROMAN_APPROVER_EMAILS');
  assert.throws(() => h.context.setupRomanApproval(), /ROMAN_APPROVER_EMAILS/);
});
