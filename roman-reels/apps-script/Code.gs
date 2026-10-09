// Replace the existing Code.gs as a whole. Never paste token values here.
const SPREADSHEET_ID = '1DZVjhxTOlFZnVynDgeIUS5nXjVxxmZpsDZYeBiZ0XN0';
const ROMAN_PENDING = 'На проверке';
const ROMAN_APPROVED = 'Утверждено';
const ROMAN_REJECTED = 'На доработку';
const ROMAN_WAITING = 'Ожидает утверждения';
const ROMAN_READY = 'Готов к производству';

function romanSheet_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Сценарии');
  if (!sheet) throw new Error('Approval sheet unavailable');
  return sheet;
}

function romanLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Busy; retry later');
  try { return fn(); } finally { lock.releaseLock(); }
}

function romanJson_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function romanApprovers_() {
  return (PropertiesService.getScriptProperties().getProperty('ROMAN_APPROVER_EMAILS') || '')
    .split(',').map(function(email) { return email.trim().toLowerCase(); }).filter(Boolean);
}

function romanReceiptKey_(versionId) { return 'ROMAN_APPROVAL:' + versionId; }

function romanScriptHash_(item) {
  const payload = JSON.stringify([item.version_id, item.script_revision, item.hook_text, item.script_text]);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload, Utilities.Charset.UTF_8)
    .map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function romanValidateScript_(item) {
  if (!item || typeof item.topic_id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(item.topic_id)) throw new Error('Invalid topic');
  if ([1, 2, 3].indexOf(item.hook_id) < 0 || item.version_id !== 'R-' + item.topic_id + '-h' + item.hook_id) throw new Error('Invalid version');
  if (!Number.isSafeInteger(item.script_revision) || item.script_revision < 1) throw new Error('Invalid revision');
  ['hook_text', 'script_text'].forEach(function(field) {
    if (typeof item[field] !== 'string' || !item[field].trim() || /^\s*=/.test(item[field])) throw new Error('Invalid text');
  });
  return item;
}

function romanRowItem_(row) {
  return romanValidateScript_({topic_id: row[0], hook_id: Number(row[1]), version_id: row[2],
    script_revision: Number(row[3]), hook_text: row[4], script_text: row[5]});
}

function romanTimestamp_(value) {
  return value instanceof Date ? value.toISOString() : String(value || '');
}

function romanVerifiedReceipt_(row) {
  try {
    const item = romanRowItem_(row);
    if (row[6] !== ROMAN_APPROVED) return null;
    const stored = PropertiesService.getScriptProperties().getProperty(romanReceiptKey_(item.version_id));
    if (!stored) return null;
    const receipt = JSON.parse(stored);
    if (receipt.version_id !== item.version_id || receipt.script_revision !== item.script_revision ||
        receipt.script_hash !== romanScriptHash_(item) || row[9] !== receipt.script_hash ||
        romanTimestamp_(row[7]) !== receipt.approved_at || row[8] !== receipt.approved_by ||
        romanApprovers_().indexOf(receipt.approved_by) < 0) return null;
    return Object.assign(item, {status: 'approved', script_hash: receipt.script_hash,
      approved_at: receipt.approved_at, approved_by: receipt.approved_by});
  } catch (error) { return null; }
}

function romanRevokeRow_(sheet, rowNumber, versionId, decision) {
  if (typeof versionId === 'string' && /^R-[a-z0-9_-]+-h[123]$/.test(versionId)) {
    PropertiesService.getScriptProperties().deleteProperty(romanReceiptKey_(versionId));
  }
  if (decision === ROMAN_APPROVED) sheet.getRange(rowNumber, 7).setValue(ROMAN_PENDING);
  sheet.getRange(rowNumber, 8, 1, 4).setValues([['', '', '', ROMAN_WAITING]]);
}

// Installable edit trigger. e.user is the editor; the trigger owner's identity
// must never be used as a fallback. If Google hides the editor, approval fails closed.
function onRomanApprovalEdit(e) {
  if (!e || !e.range || !e.source || e.source.getId() !== SPREADSHEET_ID || e.range.getSheet().getName() !== 'Сценарии') return;
  const firstRow = Math.max(2, e.range.getRow());
  const lastRow = e.range.getLastRow();
  const firstColumn = e.range.getColumn();
  if (lastRow < 2 || firstColumn > 11) return;
  romanLock_(function() {
    const sheet = e.range.getSheet();
    const rows = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, 11).getValues();
    const email = e.user && typeof e.user.getEmail === 'function' ? String(e.user.getEmail()).trim().toLowerCase() : '';
    const authorized = email && romanApprovers_().indexOf(email) >= 0;
    rows.forEach(function(row, index) {
      const rowNumber = firstRow + index;
      // Only a single edit of column G can grant approval. Bulk pastes, script
      // changes and manual metadata/status edits cannot grant approval.
      const approvalEdit = firstColumn === 7 && e.range.getNumColumns() === 1 && e.range.getNumRows() === 1;
      if (!approvalEdit || row[6] !== ROMAN_APPROVED || !authorized) {
        romanRevokeRow_(sheet, rowNumber, row[2], row[6]);
        if (firstColumn === 3 && e.range.getNumColumns() === 1 && e.range.getNumRows() === 1 && typeof e.oldValue === 'string') {
          PropertiesService.getScriptProperties().deleteProperty(romanReceiptKey_(e.oldValue));
        }
        return;
      }
      try {
        if (sheet.getRange(rowNumber, 1, 1, 11).getFormulas()[0].some(Boolean)) throw new Error('Formula in approval row');
        const item = romanRowItem_(row);
        // Duplicate version IDs make the association ambiguous.
        const versionIds = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getValues();
        if (versionIds.filter(function(id) { return id[0] === item.version_id; }).length !== 1) throw new Error('Duplicate version');
        const receipt = {version_id: item.version_id, script_revision: item.script_revision,
          script_hash: romanScriptHash_(item), approved_at: new Date().toISOString(), approved_by: email};
        PropertiesService.getScriptProperties().setProperty(romanReceiptKey_(item.version_id), JSON.stringify(receipt));
        sheet.getRange(rowNumber, 8, 1, 4).setValues([[receipt.approved_at, email, receipt.script_hash, ROMAN_READY]]);
      } catch (error) {
        romanRevokeRow_(sheet, rowNumber, row[2], row[6]);
      }
    });
    SpreadsheetApp.flush();
  });
}

function romanQueue_() {
  const sheet = romanSheet_();
  const count = sheet.getLastRow() - 1;
  if (count < 1) return [];
  const rows = sheet.getRange(2, 1, count, 11).getValues();
  const formulas = sheet.getRange(2, 1, count, 11).getFormulas();
  const counts = {};
  rows.forEach(function(row) { counts[row[2]] = (counts[row[2]] || 0) + 1; });
  const queue = [];
  rows.forEach(function(row, index) {
    if (row[10] !== ROMAN_READY || counts[row[2]] !== 1 || formulas[index].some(Boolean)) return;
    const item = romanVerifiedReceipt_(row);
    if (item) queue.push(item);
  });
  return queue;
}

function getApprovedProductionQueue() { return romanLock_(romanQueue_); }
function getProductionQueueResponse() { return {ok: true, items: getApprovedProductionQueue()}; }

function checkProductionSafety() {
  return romanLock_(function() {
    const sheet = romanSheet_();
    if (sheet.getLastRow() < 2) return;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
    const formulas = sheet.getRange(2, 1, rows.length, 11).getFormulas();
    const counts = {};
    rows.forEach(function(row) { counts[row[2]] = (counts[row[2]] || 0) + 1; });
    rows.forEach(function(row, index) {
      if (!row.some(function(value) { return value !== ''; })) return;
      const valid = counts[row[2]] === 1 && !formulas[index].some(Boolean) && romanVerifiedReceipt_(row);
      if (!valid && (row[6] === ROMAN_APPROVED || row[10] === ROMAN_READY || row[7] || row[8] || row[9])) {
        romanRevokeRow_(sheet, index + 2, row[2], row[6]);
      } else if (valid && row[10] === ROMAN_WAITING) {
        sheet.getRange(index + 2, 11).setValue(ROMAN_READY);
      }
    });
    SpreadsheetApp.flush();
    Logger.log('Approval safety check complete');
  });
}

// Keep handlers of the existing time-driven triggers compatible.
function checkApprovedScripts() { checkProductionSafety(); }
function markApprovedForProduction() { checkProductionSafety(); }
function testConnection() { Logger.log('Connected: ' + romanSheet_().getName()); }

function romanAddDrafts_(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 90) throw new Error('Invalid draft count');
  const seen = {};
  items.forEach(function(item) {
    romanValidateScript_(item);
    if (item.status !== 'pending_approval' || item.approved_by || item.approved_at || item.script_hash || seen[item.version_id]) throw new Error('Invalid pending draft');
    seen[item.version_id] = true;
  });
  return romanLock_(function() {
    const sheet = romanSheet_();
    const existing = new Set(sheet.getLastRow() > 1 ? sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getValues().map(function(row) { return row[0]; }) : []);
    const rows = items.filter(function(item) { return !existing.has(item.version_id); }).map(function(item) {
      return [item.topic_id, item.hook_id, item.version_id, item.script_revision, item.hook_text, item.script_text,
        ROMAN_PENDING, '', '', '', ROMAN_WAITING];
    });
    if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 11).setValues(rows);
    SpreadsheetApp.flush();
    return {ok: true, added: rows.length, skipped: items.length - rows.length};
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string' || e.postData.contents.length > 2000000) return romanJson_({ok: false, error: 'Bad request'});
    const body = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty('ROMAN_REELS_WEBHOOK_TOKEN');
    if (!token || !body || typeof body.token !== 'string' || body.token !== token) return romanJson_({ok: false, error: 'Unauthorized'});
    if (body.action === 'get_production_queue') return romanJson_(getProductionQueueResponse());
    if (body.action && body.action !== 'add_drafts') return romanJson_({ok: false, error: 'Unknown action'});
    return romanJson_(romanAddDrafts_(body.items));
  } catch (error) {
    // Never echo request contents, token values or stack traces to a caller.
    return romanJson_({ok: false, error: 'Request rejected'});
  }
}

function doGet() { return romanJson_({ok: false, error: 'Use authenticated POST'}); }

// Run once after setting ROMAN_APPROVER_EMAILS in Script Properties.
// Retains existing time triggers and does not change sharing or sheet protection.
function setupRomanApproval() {
  if (!romanApprovers_().length) throw new Error('Set ROMAN_APPROVER_EMAILS in Script Properties first');
  const existing = ScriptApp.getProjectTriggers().some(function(trigger) { return trigger.getHandlerFunction() === 'onRomanApprovalEdit'; });
  if (!existing) ScriptApp.newTrigger('onRomanApprovalEdit').forSpreadsheet(SPREADSHEET_ID).onEdit().create();
  testConnection();
  Logger.log('Approval edit trigger ready. Redeploy the web app as a new version separately.');
}
