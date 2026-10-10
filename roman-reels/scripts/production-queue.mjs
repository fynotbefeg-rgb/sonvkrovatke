// Durable local queue shared by manual-upload and future Windows-browser providers.
// No networking, avatar generation, rendering or approval writes.
import {DatabaseSync} from 'node:sqlite';
import {createHash, randomUUID} from 'node:crypto';
import {validateManifest} from './approval-manifest.mjs';
import {intakeName} from './plan-manual-intake.mjs';

const providers = {
  manual_upload: 'waiting_for_manual_upload',
  windows_browser: 'waiting_for_windows_worker',
};
function providerState(provider) {
  if (!Object.hasOwn(providers, provider)) throw Error('Unsupported avatar provider');
  return providers[provider];
}
function actorId(id) {
  if (typeof id !== 'string' || !/^[1-9][0-9]{0,15}$/.test(id)) throw Error('Invalid operator ID');
  return id;
}
export function productionKey(item) {
  return createHash('sha256').update(JSON.stringify([
    item.version_id, item.script_revision, item.script_hash,
  ])).digest('hex');
}
function approvedItems(snapshot) {
  return new Map(validateManifest(snapshot).filter(x => x.status === 'approved').map(x => [x.version_id, x]));
}

export class ProductionQueue {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, expires_at INTEGER NOT NULL, selection TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (
        production_key TEXT PRIMARY KEY, provider TEXT NOT NULL, state TEXT NOT NULL,
        snapshot TEXT NOT NULL, expected_name TEXT NOT NULL, requested_by TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS callbacks (
        id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, actor_id TEXT NOT NULL, response TEXT NOT NULL);`);
  }
  close() { this.db.close(); }

  // Call on the trusted server after reading current authenticated approvals.
  // Ticket freezes the selected versions/hashes; callback contains no text or commands.
  createTicket(snapshot, versionIds, operatorId, {now = Date.now(), ttlMs = 900000} = {}) {
    actorId(operatorId);
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 1800000) throw Error('Invalid ticket lifetime');
    const approved = approvedItems(snapshot);
    if (!Array.isArray(versionIds) || !versionIds.length || versionIds.length > 90 || new Set(versionIds).size !== versionIds.length) throw Error('Invalid selection');
    const selection = versionIds.map(id => {
      const item = approved.get(id);
      if (!item) throw Error('Selected version is not approved');
      return {version_id: id, production_key: productionKey(item)};
    });
    const id = randomUUID();
    this.db.prepare('INSERT INTO tickets VALUES (?, ?, ?, ?)').run(id, operatorId, now + ttlMs, JSON.stringify(selection));
    return {ticket_id: id, callback_data: `start:${id}`, expires_at: now + ttlMs};
  }

  // Current snapshot MUST come from authenticated server read, never callback JSON.
  startTicket(ticketId, callbackId, operatorId, currentSnapshot, {provider = 'manual_upload', now = Date.now()} = {}) {
    actorId(operatorId);
    const state = providerState(provider);
    if (typeof callbackId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(callbackId)) throw Error('Invalid callback ID');
    if (!Number.isSafeInteger(now)) throw Error('Invalid current time');
    const approved = approvedItems(currentSnapshot);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const ticket = this.db.prepare('SELECT * FROM tickets WHERE id=?').get(ticketId);
      if (!ticket || ticket.actor_id !== operatorId || ticket.expires_at <= now) throw Error('Invalid or expired ticket');
      const selection = JSON.parse(ticket.selection);
      const items = selection.map(entry => {
        const item = approved.get(entry.version_id);
        if (!item || productionKey(item) !== entry.production_key) throw Error('Approval changed or revoked; refresh review');
        return item;
      });
      const replay = this.db.prepare('SELECT * FROM callbacks WHERE id=?').get(callbackId);
      if (replay && (replay.ticket_id !== ticketId || replay.actor_id !== operatorId)) throw Error('Callback ID collision');
      if (replay) {
        const response = JSON.parse(replay.response);
        // Reply with current waiting-provider state, not the state before migration.
        const jobs = response.jobs.map(job => this.getJob(job.production_key));
        this.db.exec('COMMIT');
        return {...response, jobs, replayed: true, created: 0};
      }
      let created = 0;
      const jobs = items.map(item => {
        const key = productionKey(item);
        const result = this.db.prepare('INSERT OR IGNORE INTO jobs VALUES (?, ?, ?, ?, ?, ?)')
          .run(key, provider, state, JSON.stringify(item), intakeName(item), operatorId);
        created += Number(result.changes);
        return this.getJob(key);
      });
      const response = {jobs, created, replayed: false, generation_started: false, render_allowed: false};
      this.db.prepare('INSERT INTO callbacks VALUES (?, ?, ?, ?)').run(callbackId, ticketId, operatorId, JSON.stringify(response));
      this.db.exec('COMMIT');
      return response;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getJob(key) {
    const row = this.db.prepare('SELECT * FROM jobs WHERE production_key=?').get(key);
    if (!row) return null;
    return {production_key: row.production_key, provider: row.provider, state: row.state,
      approval: JSON.parse(row.snapshot), expected_name: row.expected_name,
      requested_by: row.requested_by, generation_started: false, render_allowed: false};
  }
  countJobs() { return this.db.prepare('SELECT count(*) AS count FROM jobs').get().count; }

  // Migrates a WAITING job. It cannot create another generation of the same script.
  // A future worker must recheck live approvals and atomically claim before Generate.
  switchWaitingProvider(key, provider) {
    const state = providerState(provider);
    const result = this.db.prepare(`UPDATE jobs SET provider=?, state=?
      WHERE production_key=? AND state IN ('waiting_for_manual_upload', 'waiting_for_windows_worker')`)
      .run(provider, state, key);
    if (Number(result.changes) !== 1) throw Error('Job unavailable or no longer waiting');
    return this.getJob(key);
  }
}
