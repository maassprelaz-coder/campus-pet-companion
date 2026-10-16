import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { BoundaryError, taskTemplates, suggestionPolicy, validateAgentOutput } from './agent-boundary.mjs';

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const SUGGESTION_MS = 10 * 60 * 1000;
// Conservative handling of a few explicit refusal phrases; this is not a general intent classifier.
const explicitRefusal = /只想(?:聊聊|聊天|休息)|不想做任务|不要.{0,8}(?:任务|专注|建议)|别.{0,6}(?:安排|推荐|催)/u;
const hash = text => createHash('sha256').update(text).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const signature = (route, body) => hash(`${route}\n${canonical(body)}`);
const fault = (status, code, message) => { throw new BoundaryError(status, code, message); };
const exact = (body, keys) => body && typeof body === 'object' && !Array.isArray(body) &&
  Object.keys(body).length === keys.length && keys.every(key => Object.hasOwn(body, key));
const empty = body => { if (!exact(body, [])) fault(400, 'INVALID_BODY', '此操作只接受空对象'); };
const iso = ms => new Date(ms).toISOString();

export function publicTask(task) {
  if (!task) return null;
  return { task_id: task.task_id, template_id: task.template_id, status: task.status,
    started_at: iso(task.started_ms), duration_seconds: task.duration_seconds,
    ends_at: iso(task.started_ms + task.duration_seconds * 1000),
    completed_at: task.completed_ms === null ? null : iso(task.completed_ms) };
}

// All writes are short SQLite transactions. No transaction stays open during model/network work.
export class TaskStore {
  constructor({ filename = ':memory:', now = Date.now } = {}) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.now = now;
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS sessions (
        owner_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
        expires_ms INTEGER NOT NULL, proactive INTEGER NOT NULL DEFAULT 1,
        rejected_until_ms INTEGER NOT NULL DEFAULT 0, last_suggested_ms INTEGER,
        revision INTEGER NOT NULL DEFAULT 0
      ) STRICT;
      CREATE TABLE IF NOT EXISTS suggestions (
        suggestion_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES sessions ON DELETE CASCADE,
        template_id TEXT NOT NULL CHECK(template_id = 'focus_25'), expires_ms INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')), task_id TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES sessions ON DELETE CASCADE,
        template_id TEXT NOT NULL CHECK(template_id = 'focus_25'),
        status TEXT NOT NULL CHECK(status IN ('active','completed')),
        started_ms INTEGER NOT NULL, duration_seconds INTEGER NOT NULL CHECK(duration_seconds = 1500),
        completed_ms INTEGER
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_task ON tasks(owner_id) WHERE status = 'active';
      CREATE TABLE IF NOT EXISTS request_keys (
        owner_id TEXT NOT NULL REFERENCES sessions ON DELETE CASCADE, retry_key TEXT NOT NULL,
        signature TEXT NOT NULL, claim TEXT, pending_until_ms INTEGER, result_json TEXT,
        PRIMARY KEY(owner_id, retry_key)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS events (
        owner_id TEXT NOT NULL REFERENCES sessions ON DELETE CASCADE, event_id TEXT NOT NULL,
        signature TEXT NOT NULL, claim TEXT, pending_until_ms INTEGER, result_json TEXT,
        PRIMARY KEY(owner_id, event_id)
      ) STRICT;
    `);
    this.purgeExpired();
  }

  close() { this.db.close(); }
  one(sql, ...args) { return this.db.prepare(sql).get(...args); }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  purgeExpired() { this.run('DELETE FROM sessions WHERE expires_ms <= ?', this.now()); }
  owner(ownerId) {
    const row = this.one('SELECT * FROM sessions WHERE owner_id = ? AND expires_ms > ?', ownerId, this.now());
    if (!row) fault(401, 'SESSION_REQUIRED', '会话已失效，请重新建立会话');
    return row;
  }
  authenticate(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    return this.one('SELECT owner_id FROM sessions WHERE token_hash = ? AND expires_ms > ?', hash(token), this.now())?.owner_id ?? null;
  }
  createSession(body) {
    empty(body);
    this.purgeExpired();
    const token = randomBytes(32).toString('hex');
    const ownerId = randomUUID();
    this.run('INSERT INTO sessions(owner_id, token_hash, expires_ms) VALUES (?, ?, ?)', ownerId, hash(token), this.now() + SESSION_MS);
    return { token, ownerId, maxAge: SESSION_MS / 1000 };
  }
  activeTask(ownerId) { return this.one("SELECT * FROM tasks WHERE owner_id = ? AND status = 'active'", ownerId) ?? null; }
  task(ownerId, taskId) {
    const task = this.one('SELECT * FROM tasks WHERE owner_id = ? AND task_id = ?', ownerId, taskId);
    if (!task) fault(404, 'TASK_NOT_FOUND', '任务不存在');
    return task;
  }
  state(ownerId) {
    const owner = this.owner(ownerId);
    const last = this.one("SELECT * FROM tasks WHERE owner_id = ? AND status = 'completed' ORDER BY completed_ms DESC LIMIT 1", ownerId);
    return { preferences: { proactive: !!owner.proactive, remember: false },
      active_task: publicTask(this.activeTask(ownerId)), last_completed_task: publicTask(last),
      expires_at: iso(owner.expires_ms) };
  }
  trusted(ownerId, event, availableTemplates, retrievedSources = []) {
    const owner = this.owner(ownerId);
    return { session_id: ownerId, preferences: { proactive: !!owner.proactive, remember: false },
      now_ms: this.now(), active_task: this.activeTask(ownerId),
      completed_task: event.event_type === 'task_completed' ? this.task(ownerId, event.task_id) : null,
      available_templates: [...availableTemplates], retrieved_sources: structuredClone(retrievedSources),
      rejected_until_ms: owner.rejected_until_ms, last_suggested_at_ms: owner.last_suggested_ms,
      revision: owner.revision };
  }
  retry(ownerId, key, route, body) {
    if (typeof key !== 'string' || !/^[\x21-\x7e]{1,100}$/.test(key))
      fault(400, 'IDEMPOTENCY_REQUIRED', '修改请求需提供1—100字符的 Idempotency-Key');
    const digest = signature(route, body);
    const row = this.one('SELECT * FROM request_keys WHERE owner_id = ? AND retry_key = ?', ownerId, key);
    if (row && row.signature !== digest) fault(409, 'KEY_REUSED', '同一重试键的请求内容或接口不一致');
    return { digest, row };
  }
  saveResult(ownerId, key, digest, value) {
    this.run(`INSERT INTO request_keys(owner_id, retry_key, signature, result_json) VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_id, retry_key) DO UPDATE SET result_json = excluded.result_json, claim = NULL, pending_until_ms = NULL`,
    ownerId, key, digest, JSON.stringify(value));
  }
  mutate(ownerId, key, route, body, action) {
    return this.transaction(() => {
      this.owner(ownerId);
      const { digest, row } = this.retry(ownerId, key, route, body);
      if (row?.result_json) return JSON.parse(row.result_json);
      if (row?.claim) fault(409, 'REQUEST_IN_PROGRESS', '相同请求正在处理，请稍后重试');
      const value = { server_time: iso(this.now()), ...action() };
      this.saveResult(ownerId, key, digest, value);
      return value;
    });
  }

  accept(ownerId, key, body, mode) {
    return this.mutate(ownerId, key, 'POST /api/v1/tasks/accept', body, () => {
      if (!exact(body, ['suggestion_id']) || typeof body.suggestion_id !== 'string')
        fault(400, 'INVALID_ACCEPT', '只能提交 suggestion_id');
      const suggestion = this.one('SELECT * FROM suggestions WHERE owner_id = ? AND suggestion_id = ?', ownerId, body.suggestion_id);
      if (!suggestion) fault(404, 'SUGGESTION_NOT_FOUND', '建议不存在');
      if (suggestion.status === 'accepted') return { mode, task: publicTask(this.task(ownerId, suggestion.task_id)) };
      if (suggestion.status === 'rejected') fault(409, 'SUGGESTION_REJECTED', '该建议已拒绝');
      if (suggestion.expires_ms <= this.now()) fault(409, 'SUGGESTION_EXPIRED', '建议已过期，请重新发起对话');
      if (this.activeTask(ownerId)) fault(409, 'ACTIVE_TASK_EXISTS', '当前已有进行中的任务');
      const taskId = randomUUID();
      this.run(`INSERT INTO tasks(task_id, owner_id, template_id, status, started_ms, duration_seconds)
        VALUES (?, ?, ?, 'active', ?, ?)`, taskId, ownerId, suggestion.template_id, this.now(), taskTemplates.focus_25.duration_seconds);
      this.run("UPDATE suggestions SET status = 'accepted', task_id = ? WHERE suggestion_id = ?", taskId, suggestion.suggestion_id);
      this.run('UPDATE sessions SET revision = revision + 1 WHERE owner_id = ?', ownerId);
      return { mode, task: publicTask(this.task(ownerId, taskId)) };
    });
  }
  reject(ownerId, key, suggestionId, body, mode) {
    return this.mutate(ownerId, key, `POST /api/v1/suggestions/${suggestionId}/reject`, body, () => {
      empty(body);
      const suggestion = this.one('SELECT * FROM suggestions WHERE owner_id = ? AND suggestion_id = ?', ownerId, suggestionId);
      if (!suggestion) fault(404, 'SUGGESTION_NOT_FOUND', '建议不存在');
      if (suggestion.status === 'accepted') fault(409, 'SUGGESTION_ACCEPTED', '已经接受的任务不能当作未接受建议拒绝');
      if (suggestion.status !== 'rejected') {
        this.run("UPDATE suggestions SET status = 'rejected' WHERE owner_id = ? AND status = 'pending'", ownerId);
        this.run('UPDATE sessions SET rejected_until_ms = ?, revision = revision + 1 WHERE owner_id = ?', this.now() + SUGGESTION_MS, ownerId);
      }
      return { mode, rejected: true };
    });
  }
  complete(ownerId, key, taskId, body, mode) {
    return this.mutate(ownerId, key, `POST /api/v1/tasks/${taskId}/complete`, body, () => {
      empty(body);
      const task = this.task(ownerId, taskId);
      const already = task.status === 'completed';
      if (!already) {
        if (this.now() < task.started_ms + task.duration_seconds * 1000)
          fault(409, 'TASK_TOO_EARLY', '专注时长尚未结束，请按服务端时间继续计时');
        this.run("UPDATE tasks SET status = 'completed', completed_ms = ? WHERE task_id = ?", this.now(), taskId);
        this.run('UPDATE sessions SET revision = revision + 1 WHERE owner_id = ?', ownerId);
      }
      return { mode, task: publicTask(this.task(ownerId, taskId)), receipt: { already_completed: already, points_awarded: 0 } };
    });
  }
  preferences(ownerId, key, body, mode) {
    return this.mutate(ownerId, key, 'POST /api/v1/preferences', body, () => {
      if (!exact(body, ['proactive', 'remember']) || typeof body.proactive !== 'boolean' || body.remember !== false)
        fault(400, 'INVALID_PREFERENCES', '只支持主动建议开关，remember须为false');
      this.run('UPDATE sessions SET proactive = ?, revision = revision + 1 WHERE owner_id = ?', Number(body.proactive), ownerId);
      if (!body.proactive) this.run("UPDATE suggestions SET status = 'rejected' WHERE owner_id = ? AND status = 'pending'", ownerId);
      return { mode, preferences: { proactive: body.proactive, remember: false } };
    });
  }

  claimEvent(ownerId, key, event, leaseMs) {
    return this.transaction(() => {
      this.owner(ownerId);
      const { digest, row } = this.retry(ownerId, key, 'POST /api/v1/companion/events', event);
      if (row?.result_json) return { value: JSON.parse(row.result_json) };
      const prior = this.one('SELECT * FROM events WHERE owner_id = ? AND event_id = ?', ownerId, event.event_id);
      const eventDigest = signature('event', event);
      if (prior && prior.signature !== eventDigest) fault(409, 'EVENT_REUSED', '同一event_id的内容不一致');
      if (prior?.result_json) {
        const value = JSON.parse(prior.result_json);
        this.saveResult(ownerId, key, digest, value);
        return { value };
      }
      if (prior?.pending_until_ms > this.now() || row?.pending_until_ms > this.now())
        fault(409, 'REQUEST_IN_PROGRESS', '相同事件正在处理，请稍后重试');
      const pending = this.one('SELECT 1 FROM events WHERE owner_id = ? AND pending_until_ms > ? LIMIT 1', ownerId, this.now());
      if (pending) fault(409, 'REQUEST_IN_PROGRESS', '上一条对话正在处理，请稍后发送');
      if (!prior && explicitRefusal.test(event.user_message)) {
        this.run("UPDATE suggestions SET status = 'rejected' WHERE owner_id = ? AND status = 'pending'", ownerId);
        this.run('UPDATE sessions SET rejected_until_ms = ?, revision = revision + 1 WHERE owner_id = ?', this.now() + SUGGESTION_MS, ownerId);
      }
      const claim = randomUUID();
      const until = this.now() + leaseMs;
      this.run(`INSERT INTO events(owner_id, event_id, signature, claim, pending_until_ms) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(owner_id, event_id) DO UPDATE SET claim = excluded.claim, pending_until_ms = excluded.pending_until_ms`,
      ownerId, event.event_id, eventDigest, claim, until);
      this.run(`INSERT INTO request_keys(owner_id, retry_key, signature, claim, pending_until_ms) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(owner_id, retry_key) DO UPDATE SET claim = excluded.claim, pending_until_ms = excluded.pending_until_ms`,
      ownerId, key, digest, claim, until);
      return { claim, digest, revision: this.owner(ownerId).revision };
    });
  }
  abandonEvent(ownerId, key, eventId, claim) {
    this.transaction(() => {
      this.run('UPDATE events SET claim = NULL, pending_until_ms = NULL WHERE owner_id = ? AND event_id = ? AND claim = ? AND result_json IS NULL', ownerId, eventId, claim);
      this.run('UPDATE request_keys SET claim = NULL, pending_until_ms = NULL WHERE owner_id = ? AND retry_key = ? AND claim = ? AND result_json IS NULL', ownerId, key, claim);
    });
  }
  finishEvent(ownerId, key, event, ticket, candidate, trusted, mode) {
    return this.transaction(() => {
      const owner = this.owner(ownerId);
      const claim = this.one('SELECT claim FROM events WHERE owner_id = ? AND event_id = ?', ownerId, event.event_id)?.claim;
      if (claim !== ticket.claim || owner.revision !== ticket.revision)
        fault(409, 'CONTEXT_CHANGED', '任务或偏好已变化，请重试本次对话');
      const policy = suggestionPolicy({ eventType: event.event_type,
        proactiveEnabled: !!owner.proactive && event.preferences.proactive, activeTask: this.activeTask(ownerId),
        rejectedUntilMs: owner.rejected_until_ms, lastSuggestedAtMs: owner.last_suggested_ms,
        nowMs: this.now(), availableTemplates: trusted.available_templates });
      const output = validateAgentOutput(candidate, { allowedTemplates: policy.available_task_templates,
        retrievedSources: trusted.retrieved_sources, completionVerified: event.event_type === 'task_completed' &&
          this.task(ownerId, event.task_id).status === 'completed' });
      let suggestion = null;
      if (output.suggested_task) {
        const template = taskTemplates[output.suggested_task];
        const id = randomUUID();
        this.run("INSERT INTO suggestions(suggestion_id, owner_id, template_id, expires_ms, status) VALUES (?, ?, ?, ?, 'pending')",
          id, ownerId, output.suggested_task, this.now() + SUGGESTION_MS);
        this.run('UPDATE sessions SET last_suggested_ms = ?, revision = revision + 1 WHERE owner_id = ?', this.now(), ownerId);
        suggestion = { suggestion_id: id, task_template_id: output.suggested_task, ...template };
      }
      const value = { schema_version: '0.1', mode, request_id: randomUUID(), reply: output.reply,
        pet_action: output.pet_action, strategy: output.strategy, suggestion, sources: output.sources };
      this.run('UPDATE events SET result_json = ?, claim = NULL, pending_until_ms = NULL WHERE owner_id = ? AND event_id = ?',
        JSON.stringify(value), ownerId, event.event_id);
      this.saveResult(ownerId, key, ticket.digest, value);
      return value;
    });
  }
}
