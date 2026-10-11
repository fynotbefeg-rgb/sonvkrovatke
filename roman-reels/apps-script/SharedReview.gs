// Opt-in shared-body approvals. Disabled unless ROMAN_SHARED_REVIEW_ENABLED=true.
// Install alongside the updated Code.gs OR RomanApproval.gs, never both.
// No tokens, no avatar generation, no changes to existing rows during installation.
const RomanSharedReview = (function() {
  const spreadsheetId = '1DZVjhxTOlFZnVynDgeIUS5nXjVxxmZpsDZYeBiZ0XN0';
  const prefix = 'ROMAN_SHARED_REVIEW:';
  const approved = 'Утверждено';
  function props() { return PropertiesService.getScriptProperties(); }
  function enabled() { return props().getProperty('ROMAN_SHARED_REVIEW_ENABLED') === 'true'; }
  function digest(value) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value), Utilities.Charset.UTF_8)
      .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  }
  function text(value) {
    if (typeof value !== 'string' || !value.trim() || /^\s*[=+@-]/.test(value)) throw Error('Invalid literal review text');
    return value;
  }
  function exactKeys(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== keys.length || Object.keys(value).some(function(k) { return keys.indexOf(k) < 0; })) throw Error('Unexpected review fields');
  }
  function validate(packet) {
    exactKeys(packet, ['schemaVersion', 'topicId', 'topicText', 'revision', 'bodyText', 'hooks', 'endings']);
    if (!packet || packet.schemaVersion !== '1.0.0' || typeof packet.topicId !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(packet.topicId || '') ||
        !Number.isSafeInteger(packet.revision) || packet.revision < 1) throw Error('Invalid review packet');
    text(packet.topicText); text(packet.bodyText);
    if (!Array.isArray(packet.hooks) || packet.hooks.length !== 3) throw Error('Exactly three hooks required');
    const ids = new Set(); const texts = new Set();
    packet.hooks.forEach(function(h) {
      exactKeys(h, ['id', 'text']);
      if (!h || [1, 2, 3].indexOf(h.id) < 0 || ids.has(h.id)) throw Error('Invalid hook IDs');
      ids.add(h.id); text(h.text);
      const comparable = h.text.trim().replace(/\s+/g, ' ').toLowerCase();
      if (texts.has(comparable)) throw Error('Distinct hooks required');
      texts.add(comparable);
    });
    if (!Array.isArray(packet.endings) || [0, 2].indexOf(packet.endings.length) < 0) throw Error('Zero or two endings required');
    const platforms = new Set();
    packet.endings.forEach(function(e) {
      exactKeys(e, ['platform', 'text']);
      if (!e || ['instagram', 'tiktok'].indexOf(e.platform) < 0 || platforms.has(e.platform)) throw Error('Invalid endings');
      platforms.add(e.platform); text(e.text);
      if (e.platform === 'tiktok' && (/комментар/i.test(e.text) || !/личн/i.test(e.text))) throw Error('TikTok must request DM');
    });
    return packet;
  }
  function bodyDisplay(p) {
    return p.bodyText + p.endings.map(function(e) { return '\n\nОкончание ' + e.platform + ':\n' + e.text; }).join('');
  }
  function components(p) {
    const base = ['shared-review-v1', p.topicId, p.revision];
    const body = bodyDisplay(p);
    const result = {topic: digest(base.concat(['topic', p.topicText])), body: digest(base.concat(['body', body]))};
    p.hooks.forEach(function(h) {
      // Hook receipt also binds the common body/endings: changing them invalidates every variant.
      result['hook' + h.id] = digest(base.concat(['hook', h.id, h.text, result.body]));
    });
    return result;
  }
  function configs() {
    const all = props().getProperties();
    return Object.keys(all).filter(function(k) { return k.indexOf(prefix) === 0; }).map(function(k) {
      const c = JSON.parse(all[k]); validate(c.packet);
      if (k !== prefix + c.packet.topicId || !Number.isSafeInteger(c.firstRow) || c.firstRow < 2 ||
          !Number.isSafeInteger(c.sheetId) || c.packetHash !== digest(c.packet)) throw Error('Invalid review binding');
      return c;
    });
  }
  function sheetFor(c) {
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheets().filter(function(s) { return s.getSheetId() === c.sheetId; })[0];
    if (!sheet || sheet.getName() !== 'Темы и хуки') throw Error('Review sheet binding changed');
    return sheet;
  }
  function expectedRows(p) {
    const hooks = p.hooks.slice().sort(function(a, b) { return a.id - b.id; });
    return [[p.topicText, '', bodyDisplay(p), '', '', '', '']].concat(hooks.map(function(h) {
      return ['', '', h.text, '', '', '', ''];
    }));
  }
  function matches(c) {
    const sheet = sheetFor(c), rows = sheet.getRange(c.firstRow, 1, 4, 4).getValues();
    const expected = expectedRows(c.packet);
    const formulas = sheet.getRange(c.firstRow, 1, 4, 4).getFormulas();
    return !formulas.some(function(r) { return r.some(Boolean); }) &&
      rows.every(function(row, i) { return row[0] === expected[i][0] && row[2] === expected[i][2] && (i === 0 || row[1] === ''); });
  }
  function receiptKey(c, part) { return 'ROMAN_SHARED_RECEIPT:' + c.packet.topicId + ':' + part; }
  function revoke(c, parts, clearUnconfirmed) {
    parts.forEach(function(part) {
      props().deleteProperty(receiptKey(c, part));
      if (clearUnconfirmed) {
        const row = part === 'topic' || part === 'body' ? c.firstRow : c.firstRow + Number(part.slice(4));
        const cell = sheetFor(c).getRange(row, part === 'topic' ? 2 : 4);
        if (cell.getValues()[0][0] === approved) cell.setValue('');
      }
    });
  }
  function receipts(c, approvers) {
    const hashes = components(c.packet), sheet = sheetFor(c);
    const rows = sheet.getRange(c.firstRow, 1, 4, 4).getValues();
    const result = {};
    Object.keys(hashes).forEach(function(part) {
      const decision = part === 'topic' ? rows[0][1] : rows[part === 'body' ? 0 : Number(part.slice(4))][3];
      const raw = props().getProperty(receiptKey(c, part));
      if (!raw || decision !== approved) return;
      try {
        const r = JSON.parse(raw);
        if (r.topicId === c.packet.topicId && r.part === part && r.hash === hashes[part] &&
            approvers.indexOf(r.approvedBy) >= 0 && typeof r.approvedAt === 'string' &&
            /^\d{4}-\d{2}-\d{2}T/.test(r.approvedAt) && !isNaN(Date.parse(r.approvedAt))) result[part] = r;
      } catch (error) { /* Malformed receipt cannot approve. */ }
    });
    return result;
  }
  function handles(e) {
    return enabled() && e && e.source && e.source.getId() === spreadsheetId && e.range &&
      e.range.getSheet().getName() === 'Темы и хуки';
  }
  function edit(e, approvers, withLock) {
    return withLock(function() {
      const email = e.user && typeof e.user.getEmail === 'function' ? String(e.user.getEmail()).trim().toLowerCase() : '';
      configs().forEach(function(c) {
        if (c.sheetId !== e.range.getSheet().getSheetId() || e.range.getLastRow() < c.firstRow || e.range.getRow() > c.firstRow + 3) return;
        const parts = Object.keys(components(c.packet));
        if (!matches(c)) { revoke(c, parts, true); return; }
        const first = e.range.getColumn(), last = first + e.range.getNumColumns() - 1;
        // Analysis/statistics/reference edits do not change speech approval.
        if (first > 4) return;
        const row = e.range.getRow(), single = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
        let part = single && first === 2 && row === c.firstRow ? 'topic' :
          single && first === 4 ? (row === c.firstRow ? 'body' : 'hook' + (row - c.firstRow)) : null;
        if (!part) {
          // Bulk edits touching decisions revoke only the affected receipts; never grant them.
          const affected = parts.filter(function(p) {
            const r = p === 'topic' || p === 'body' ? c.firstRow : c.firstRow + Number(p.slice(4));
            const col = p === 'topic' ? 2 : 4;
            return r >= row && r <= e.range.getLastRow() && col >= first && col <= last;
          });
          revoke(c, affected, true); return;
        }
        const decision = e.range.getValues()[0][0];
        if (decision !== approved || !email || approvers.indexOf(email) < 0) { revoke(c, [part], decision === approved); return; }
        const r = {topicId: c.packet.topicId, part: part, hash: components(c.packet)[part],
          approvedBy: email, approvedAt: new Date().toISOString()};
        props().setProperty(receiptKey(c, part), JSON.stringify(r));
      });
      SpreadsheetApp.flush();
    });
  }
  // Authenticated operator registers exact pending content, never an approval.
  // Append only: preserve earlier rows/decisions/history. No reuse of old row locations.
  function register(packet, withLock) {
    if (!enabled()) throw Error('Shared review disabled');
    validate(packet);
    const json = JSON.stringify(packet);
    if (Utilities.newBlob(json).getBytes().length > 8000) throw Error('Packet exceeds Script Property limit');
    return withLock(function() {
      const old = props().getProperty(prefix + packet.topicId);
      if (old) {
        const c = JSON.parse(old);
        if (c.packetHash === digest(packet)) {
          if (!matches(c)) throw Error('Previous registration incomplete or edited; inspect binding before retry');
          return {ok: true, added: false, firstRow: c.firstRow};
        }
        if (packet.revision <= c.packet.revision) throw Error('Changed text requires higher revision');
      }
      const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('Темы и хуки');
      if (!sheet) throw Error('Review sheet unavailable');
      const firstRow = Math.max(2, sheet.getLastRow() + 1);
      const c = {packet: packet, packetHash: digest(packet), firstRow: firstRow, sheetId: sheet.getSheetId()};
      // Register before writing: a partial failure blocks approval, never auto-retries append.
      props().setProperty(prefix + packet.topicId, JSON.stringify(c));
      revoke(c, Object.keys(components(packet)));
      sheet.getRange(firstRow, 1, 4, 7).setValues(expectedRows(packet));
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(['Утверждено', 'Не утверждено'], true).setAllowInvalid(false).build();
      sheet.getRange(firstRow, 2).setDataValidation(rule);
      sheet.getRange(firstRow, 4, 4, 1).setDataValidation(rule);
      sheet.getRange(firstRow, 1, 4, 7).setWrap(true);
      SpreadsheetApp.flush();
      return {ok: true, added: true, firstRow: firstRow, rows: 4, approvalGranted: false};
    });
  }
  function queue(legacy, approvers) {
    const current = configs(), managed = new Set();
    current.forEach(function(c) {
      managed.add(c.packet.topicId);
      c.packet.endings.forEach(function(e) { managed.add(c.packet.topicId + '-' + e.platform); });
    });
    // A legacy whole-script receipt cannot bypass revocation in the new simple view.
    const result = legacy.filter(function(item) { return !managed.has(item.topic_id); });
    if (!enabled()) return result; // Disabling pauses managed topics; never restores stale legacy approvals.
    current.forEach(function(c) {
      if (!matches(c)) return;
      const r = receipts(c, approvers);
      if (!r.topic || !r.body) return;
      const p = c.packet, endings = p.endings.length ? p.endings : [{platform: null, text: ''}];
      p.hooks.slice().sort(function(a, b) { return a.id - b.id; }).forEach(function(h) {
        if (!r['hook' + h.id]) return;
        endings.forEach(function(e) {
          const topic = p.topicId + (e.platform ? '-' + e.platform : '');
          const item = {topic_id: topic, hook_id: h.id, version_id: 'R-' + topic + '-h' + h.id,
            script_revision: p.revision, hook_text: h.text,
            script_text: h.text + '\n\n' + p.bodyText + (e.text ? '\n\n' + e.text : ''), status: 'approved'};
          item.script_hash = digest([item.version_id, item.script_revision, item.hook_text, item.script_text]);
          const evidence = [r.topic, r.body, r['hook' + h.id]];
          // Preserve the legacy single-approver contract; different approvers fail closed.
          if (!evidence.every(function(x) { return x.approvedBy === r.body.approvedBy; })) return;
          item.approved_by = r.body.approvedBy;
          item.approved_at = evidence.map(function(x) { return x.approvedAt; }).sort().pop();
          item.shared_review = {topicId: p.topicId, revision: p.revision, packetHash: c.packetHash,
            componentHashes: {topic: r.topic.hash, body: r.body.hash, hook: r['hook' + h.id].hash}};
          result.push(item);
        });
      });
    });
    if (new Set(result.map(function(x) { return x.version_id; })).size !== result.length) throw Error('Ambiguous queue versions');
    return result;
  }
  return {enabled: enabled, handles: handles, edit: edit, register: register, queue: queue};
})();
