// Opt-in shared-body approvals. Disabled unless ROMAN_SHARED_REVIEW_ENABLED=true.
// Install alongside the updated Code.gs OR RomanApproval.gs, never both.
// No tokens, no avatar generation, no changes to existing rows during installation.
const RomanSharedReview = (function() {
  const spreadsheetId = '1DZVjhxTOlFZnVynDgeIUS5nXjVxxmZpsDZYeBiZ0XN0';
  const prefix = 'ROMAN_SHARED_REVIEW:';
  const topicPrefix = 'ROMAN_TOPIC_ONLY_REVIEW:';
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
  function validateTopic(p) {
    exactKeys(p, ['schemaVersion', 'topicId', 'topicText', 'revision', 'analysis', 'statistics', 'referenceUrl']);
    if (p.schemaVersion !== '1.0.0' || typeof p.topicId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(p.topicId) ||
        !Number.isSafeInteger(p.revision) || p.revision < 1) throw Error('Invalid topic-only packet');
    ['topicText', 'analysis', 'statistics', 'referenceUrl'].forEach(function(k) { text(p[k]); });
    if (!/^https:\/\/[^\s]+$/.test(p.referenceUrl)) throw Error('Invalid public reference');
    return p;
  }
  function topicConfigs() {
    const all = props().getProperties();
    const result = Object.keys(all).filter(function(k) { return k.indexOf(topicPrefix) === 0; }).map(function(k) {
      const c = JSON.parse(all[k]); validateTopic(c.packet);
      if (k !== topicPrefix + c.packet.topicId || c.packetHash !== digest(c.packet) ||
          !Number.isSafeInteger(c.firstRow) || c.firstRow < 2 || !Number.isSafeInteger(c.sheetId)) throw Error('Invalid topic-only binding');
      return c;
    });
    if (result.length > 90) throw Error('Topic-only registry exceeds bound');
    return result;
  }
  function topicHash(p) { return digest(['shared-review-v1', p.topicId, p.revision, 'topic', p.topicText]); }
  function topicMatches(c) {
    const range = sheetFor(c).getRange(c.firstRow, 1, 1, 4), row = range.getValues()[0];
    return !range.getFormulas()[0].some(Boolean) && row[0] === c.packet.topicText && row[2] === '' && row[3] === '';
  }
  function topicReceiptKey(c) { return 'ROMAN_TOPIC_ONLY_RECEIPT:' + c.packet.topicId; }
  function topicReceipt(c, approvers) {
    if (!topicMatches(c) || sheetFor(c).getRange(c.firstRow, 2).getValues()[0][0] !== approved) return null;
    try {
      const r = JSON.parse(props().getProperty(topicReceiptKey(c)) || 'null');
      if (!r || r.topicId !== c.packet.topicId || r.part !== 'topic' || r.hash !== topicHash(c.packet) ||
          approvers.indexOf(r.approvedBy) < 0 || typeof r.approvedAt !== 'string' ||
          !Number.isFinite(Date.parse(r.approvedAt)) || Date.parse(r.approvedAt) > Date.now()) return null;
      return r;
    } catch (error) { return null; }
  }
  function revokeTopic(c, clear) {
    props().deleteProperty(topicReceiptKey(c));
    const cell = sheetFor(c).getRange(c.firstRow, 2);
    if (clear && cell.getValues()[0][0] === approved) cell.setValue('');
  }
  function editTopics(e, approvers, email) {
    topicConfigs().forEach(function(c) {
      if (c.sheetId !== e.range.getSheet().getSheetId() || e.range.getRow() > c.firstRow || e.range.getLastRow() < c.firstRow) return;
      if (!topicMatches(c)) { revokeTopic(c, true); return; }
      const first = e.range.getColumn(), last = first + e.range.getNumColumns() - 1;
      if (first > 4 || last < 2) return;
      if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1 || first !== 2) {
        if (first <= 2 && last >= 2) revokeTopic(c, true);
        return;
      }
      const decision = e.range.getValues()[0][0];
      if (decision !== approved || !email || approvers.indexOf(email) < 0) { revokeTopic(c, decision === approved); return; }
      props().setProperty(topicReceiptKey(c), JSON.stringify({topicId: c.packet.topicId, part: 'topic',
        hash: topicHash(c.packet), approvedBy: email, approvedAt: new Date().toISOString()}));
    });
  }
  // Self-approval through a web app deployment that executes AS THE VISITOR. In consumer Google accounts an
  // installable edit trigger owned by the operator receives an empty e.user for other editors, so the sheet
  // dropdown alone can never prove who chose. Here Google itself authenticates the visitor: the caller passes
  // Session active + effective user, both must be the same allowlisted address (the script runs as that person).
  function selfIdentity(active, effective, approvers) {
    const email = String(active || '').trim().toLowerCase();
    if (!enabled() || !email || email !== String(effective || '').trim().toLowerCase() || approvers.indexOf(email) < 0) return '';
    return email;
  }
  function selfTopicChoices(active, effective, approvers) {
    if (!selfIdentity(active, effective, approvers)) return [];
    return topicConfigs().filter(function(c) { return topicMatches(c) && !topicReceipt(c, approvers); }).map(function(c) {
      return {topicId: c.packet.topicId, revision: c.packet.revision, title: c.packet.topicText.slice(0, 300),
        row: c.firstRow, topicHash: topicHash(c.packet)};
    });
  }
  function selfApproveTopic(active, effective, approvers, topicId, revision, hash, withLock) {
    const email = selfIdentity(active, effective, approvers);
    if (!email) return {ok: false, error: 'Approver identity not confirmed by Google'};
    return withLock(function() {
      const c = topicConfigs().filter(function(x) { return x.packet.topicId === topicId; })[0];
      if (!c || c.packet.revision !== revision || topicHash(c.packet) !== hash || !topicMatches(c)) return {ok: false, error: 'Topic changed; reload the page'};
      // Script writes do not fire the edit trigger, so the receipt below is not revoked by it.
      sheetFor(c).getRange(c.firstRow, 2).setValue(approved);
      props().setProperty(topicReceiptKey(c), JSON.stringify({topicId: c.packet.topicId, part: 'topic',
        hash: topicHash(c.packet), approvedBy: email, approvedAt: new Date().toISOString()}));
      SpreadsheetApp.flush();
      return {ok: true, topicId: c.packet.topicId, revision: c.packet.revision, row: c.firstRow, productionAllowed: false};
    });
  }
  function registerTopic(packet, withLock) {
    if (!enabled()) throw Error('Shared review disabled');
    validateTopic(packet);
    if (Utilities.newBlob(JSON.stringify(packet)).getBytes().length > 8000) throw Error('Topic exceeds Script Property limit');
    return withLock(function() {
      const current = topicConfigs(), old = current.filter(function(c) { return c.packet.topicId === packet.topicId; })[0];
      if (old) {
        if (old.packetHash === digest(packet)) {
          if (!topicMatches(old)) throw Error('Topic registration incomplete or edited');
          return {ok: true, added: false, firstRow: old.firstRow, approvalGranted: false};
        }
        if (packet.revision <= old.packet.revision) throw Error('Changed topic packet requires higher revision');
      } else if (current.length >= 90) throw Error('Topic-only registry exceeds bound');
      // Do not retrofit existing full-script approvals as topic-only choices.
      if (!old && configs().some(function(c) { return c.packet.topicId === packet.topicId; })) throw Error('Existing shared topic requires explicit migration');
      const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('Темы и хуки');
      if (!sheet) throw Error('Review sheet unavailable');
      const firstRow = Math.max(2, sheet.getLastRow() + 1);
      const c = {packet: packet, packetHash: digest(packet), firstRow: firstRow, sheetId: sheet.getSheetId()};
      props().setProperty(topicPrefix + packet.topicId, JSON.stringify(c));
      revokeTopic(c, false);
      sheet.getRange(firstRow, 1, 1, 7).setValues([[packet.topicText, '', '', '', packet.analysis, packet.statistics, packet.referenceUrl]]);
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(['Утверждено', 'Не утверждено'], true).setAllowInvalid(false).build();
      sheet.getRange(firstRow, 2).setDataValidation(rule);
      sheet.getRange(firstRow, 1, 1, 7).setWrap(true);
      SpreadsheetApp.flush();
      return {ok: true, added: true, firstRow: firstRow, rows: 1, approvalGranted: false};
    });
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
      editTopics(e, approvers, email);
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
  function register(packet, withLock, approvers) {
    if (!enabled()) throw Error('Shared review disabled');
    validate(packet);
    const json = JSON.stringify(packet);
    if (Utilities.newBlob(json).getBytes().length > 8000) throw Error('Packet exceeds Script Property limit');
    return withLock(function() {
      const topicConfig = topicConfigs().filter(function(c) { return c.packet.topicId === packet.topicId; })[0];
      const selectedTopic = topicConfig ? topicReceipt(topicConfig, approvers || []) : null;
      if (topicConfig && (!selectedTopic || topicConfig.packet.topicText !== packet.topicText ||
          topicConfig.packet.revision !== packet.revision || selectedTopic.hash !== components(packet).topic)) throw Error('Current exact topic selection required');
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
      if (selectedTopic) {
        // Preserve only the verified approval of the exact same topic/revision.
        // Speech and hooks remain pending; never create a new topic hash/timestamp.
        sheet.getRange(firstRow, 2).setValue(approved);
        props().setProperty(receiptKey(c, 'topic'), JSON.stringify(selectedTopic));
      }
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(['Утверждено', 'Не утверждено'], true).setAllowInvalid(false).build();
      sheet.getRange(firstRow, 2).setDataValidation(rule);
      sheet.getRange(firstRow, 4, 4, 1).setDataValidation(rule);
      sheet.getRange(firstRow, 1, 4, 7).setWrap(true);
      SpreadsheetApp.flush();
      return {ok: true, added: true, firstRow: firstRow, rows: 4, approvalGranted: false};
    });
  }
  // Read-only topic selection; does not approve speech or change cells/receipts.
  function topicSnapshot(approvers, withLock) {
    return withLock(function() {
      const capturedAt = new Date().toISOString(), topics = [];
      const standaloneTopics = enabled() ? topicConfigs() : [];
      if (enabled()) standaloneTopics.forEach(function(c) {
        const receipt = topicReceipt(c, approvers);
        if (!receipt) return;
        topics.push({topicId: c.packet.topicId, topicText: c.packet.topicText,
          reviewRevision: c.packet.revision, topicHash: receipt.hash, approvedBy: receipt.approvedBy,
          approvedAt: receipt.approvedAt, status: 'selected_for_research'});
      });
      if (enabled()) configs().forEach(function(c) {
        if (standaloneTopics.some(function(t) { return t.packet.topicId === c.packet.topicId; })) return;
        if (!matches(c)) return;
        const receipt = receipts(c, approvers).topic;
        if (!receipt || Date.parse(receipt.approvedAt) > Date.parse(capturedAt)) return;
        topics.push({topicId: c.packet.topicId, topicText: c.packet.topicText,
          reviewRevision: c.packet.revision, topicHash: receipt.hash,
          approvedBy: receipt.approvedBy, approvedAt: receipt.approvedAt,
          status: 'selected_for_research'});
      });
      if (topics.length > 90) throw Error('Topic snapshot exceeds bound');
      if (new Set(topics.map(function(t) { return t.topicId; })).size !== topics.length) throw Error('Ambiguous topic snapshot');
      topics.sort(function(a, b) { return a.topicId.localeCompare(b.topicId); });
      return {ok: true, snapshotVersion: '1.0.0', source: 'apps_script_shared_review',
        capturedAt: capturedAt, enabled: enabled(), topics: topics,
        scriptApprovalGranted: false, productionAllowed: false};
    });
  }
  // Display-only metadata. Never a production approval manifest; no speech,
  // identities, receipts, hashes, row locations or Script Properties exported.
  function reviewStatusSnapshot(approvers, withLock) {
    return withLock(function() {
      const capturedAt = new Date().toISOString(), currentEnabled = enabled();
      const result = {ok: true, snapshotVersion: '1.0.0', source: 'apps_script_review_status',
        capturedAt: capturedAt, enabled: currentEnabled, topics: [], approvalWrites: false, productionAllowed: false};
      if (!currentEnabled) return result;
      const standalone = topicConfigs(), shared = configs(), ids = new Set();
      standalone.concat(shared).forEach(function(c) { ids.add(c.packet.topicId); });
      if (ids.size > 90) throw Error('Review status exceeds bound');
      function decisionStatus(decision, receipt) {
        if (decision === '') return 'pending';
        // Negative dropdowns are reported as table decisions, not verified
        // rejection by a named approver (there is no rejection receipt).
        if (decision === 'Не утверждено') return 'not_approved';
        if (decision !== approved || !receipt || Date.parse(receipt.approvedAt) > Date.parse(capturedAt)) return 'unverified';
        return 'approved';
      }
      function title(c) { return c.packet.topicText.slice(0, 160).replace(/[\u0000-\u001f]/g, ' '); }
      function standaloneStatus(c) {
        if (!topicMatches(c)) return 'binding_changed';
        return decisionStatus(sheetFor(c).getRange(c.firstRow, 2).getValues()[0][0], topicReceipt(c, approvers));
      }
      Array.from(ids).sort().forEach(function(id) {
        const t = standalone.filter(function(c) { return c.packet.topicId === id; })[0];
        const c = shared.filter(function(c) { return c.packet.topicId === id; })[0];
        if (!c || (t && t.packet.revision > c.packet.revision)) {
          result.topics.push({topicId: id, title: title(t), reviewRevision: t.packet.revision, kind: 'topic_only',
            components: {topic: standaloneStatus(t), body: 'not_created', hook1: 'not_created', hook2: 'not_created', hook3: 'not_created'}});
          return;
        }
        const states = {}, parts = ['topic', 'body', 'hook1', 'hook2', 'hook3'];
        const before = sheetFor(c).getRange(c.firstRow, 1, 4, 4).getValues();
        if (!matches(c)) parts.forEach(function(part) { states[part] = 'binding_changed'; });
        else {
          const r = receipts(c, approvers);
          parts.forEach(function(part) {
            const decision = part === 'topic' ? before[0][1] : before[part === 'body' ? 0 : Number(part.slice(4))][3];
            states[part] = decisionStatus(decision, r[part]);
          });
          if (t) {
            const selected = standaloneStatus(t);
            if (t.packet.revision !== c.packet.revision || topicHash(t.packet) !== components(c.packet).topic) states.topic = 'binding_changed';
            else if (selected !== 'approved') states.topic = selected;
          }
          // A concurrent cell edit must not yield an apparently consistent panel.
          const after = sheetFor(c).getRange(c.firstRow, 1, 4, 4).getValues();
          if (JSON.stringify(before) !== JSON.stringify(after)) parts.forEach(function(part) { states[part] = 'binding_changed'; });
        }
        result.topics.push({topicId: id, title: title(c), reviewRevision: c.packet.revision, kind: 'shared', components: states});
      });
      if (Utilities.newBlob(JSON.stringify(result)).getBytes().length > 200000) throw Error('Review status bytes exceed bound');
      return result;
    });
  }
  function queue(legacy, approvers) {
    const current = configs(), managed = new Set();
    const standaloneTopics = topicConfigs();
    standaloneTopics.forEach(function(c) {
      managed.add(c.packet.topicId);
      managed.add(c.packet.topicId + '-instagram');
      managed.add(c.packet.topicId + '-tiktok');
    });
    current.forEach(function(c) {
      managed.add(c.packet.topicId);
      c.packet.endings.forEach(function(e) { managed.add(c.packet.topicId + '-' + e.platform); });
    });
    // A legacy whole-script receipt cannot bypass revocation in the new simple view.
    const result = legacy.filter(function(item) { return !managed.has(item.topic_id); });
    if (!enabled()) return result; // Disabling pauses managed topics; never restores stale legacy approvals.
    current.forEach(function(c) {
      if (!matches(c)) return;
      const selectedConfig = standaloneTopics.filter(function(t) { return t.packet.topicId === c.packet.topicId; })[0];
      if (selectedConfig) {
        const selected = topicReceipt(selectedConfig, approvers);
        if (!selected || selected.hash !== components(c.packet).topic) return;
      }
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
  return {enabled: enabled, handles: handles, edit: edit, register: register, registerTopic: registerTopic, queue: queue, topicSnapshot: topicSnapshot, reviewStatusSnapshot: reviewStatusSnapshot,
    selfTopicChoices: selfTopicChoices, selfApproveTopic: selfApproveTopic};
})();
