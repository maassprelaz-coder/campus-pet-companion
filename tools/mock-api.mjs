// Local UI integration aid only. No model, real auth, persistence or real rewards.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const fixtures = Object.fromEntries(['focus', 'relax', 'listen'].map(name => [
  name, JSON.parse(readFileSync(new URL(`../contracts/fixtures/${name}.response.json`, import.meta.url)))
]));
const allowedOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
const allowedFields = new Set(['schema_version', 'event_id', 'event_type', 'user_message', 'scene', 'mood', 'preferences', 'task_id']);

function fault(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

export function validEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (Object.keys(body).some(key => !allowedFields.has(key))) return false;
  const prefs = body.preferences;
  return body.schema_version === '0.1' &&
    typeof body.event_id === 'string' && body.event_id.length > 0 && body.event_id.length <= 100 &&
    ['chat', 'scene_enter', 'task_completed'].includes(body.event_type) &&
    typeof body.user_message === 'string' && body.user_message.length <= 2000 &&
    ['dorm', 'library', 'sports', 'canteen'].includes(body.scene) &&
    (body.mood === undefined || body.mood === null || (typeof body.mood === 'string' && body.mood.length <= 50)) &&
    (body.task_id === undefined || (typeof body.task_id === 'string' && body.task_id.length > 0 && body.task_id.length <= 100)) &&
    prefs && typeof prefs === 'object' && !Array.isArray(prefs) &&
    Object.keys(prefs).length === 2 && typeof prefs.proactive === 'boolean' && prefs.remember === false &&
    (body.event_type !== 'task_completed' || typeof body.task_id === 'string');
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw fault(413, 'BODY_TOO_LARGE', '请求过大');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw fault(400, 'INVALID_JSON', '请求不是有效 JSON'); }
}

export function createMockServer() {
  const sessions = new Map();
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(value));
    };
    try {
      if (origin && !allowedOrigins.has(origin)) throw fault(403, 'ORIGIN_NOT_ALLOWED', '仅允许本地 5173 端口客户端');
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Demo-Session, Idempotency-Key');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const path = new URL(req.url, 'http://127.0.0.1').pathname;
      if (req.method === 'GET' && path === '/health') {
        send(200, { mode: 'mock', message: '仅本地联调；无真实智能体、存储或积分' }); return;
      }
      const body = await readBody(req);
      if (req.method === 'POST' && path === '/api/v1/sessions') {
        const id = `demo-${randomUUID()}`;
        sessions.set(id, { suggestions: new Map(), tasks: new Map(), replay: new Map() });
        send(201, { mode: 'mock', demo_session: id }); return;
      }
      const session = sessions.get(req.headers['x-demo-session']);
      if (!session) throw fault(401, 'NO_DEMO_SESSION', '先建立本地模拟会话');
      if (path === '/api/v1/preferences' || path === '/api/v1/memory') {
        throw fault(501, 'NOT_IMPLEMENTED', '本轮 mock 不实现持久授权或长期记忆');
      }
      const mutation = req.method === 'POST';
      const key = req.headers['idempotency-key'];
      if (mutation && (!key || key.length > 100)) throw fault(400, 'IDEMPOTENCY_REQUIRED', '修改请求需提供 Idempotency-Key');
      const replayKey = `${req.method}:${path}:${key}`;
      const signature = JSON.stringify(body);
      if (mutation && session.replay.has(replayKey)) {
        const previous = session.replay.get(replayKey);
        if (previous.signature !== signature) throw fault(409, 'KEY_REUSED', '同一重试键的请求内容不一致');
        send(previous.status, previous.value); return;
      }
      let status = 200;
      let value;
      if (req.method === 'POST' && path === '/api/v1/companion/events') {
        if (!validEvent(body)) throw fault(400, 'INVALID_EVENT', '请求不符合接口 v0.1');
        let name = body.scene === 'library' ? 'focus' : body.scene === 'sports' ? 'relax' : 'listen';
        if (body.event_type === 'scene_enter' && !body.preferences.proactive) name = 'listen';
        value = structuredClone(fixtures[name]);
        value.request_id = `mock-request-${randomUUID()}`;
        if (body.event_type === 'task_completed') {
          const task = session.tasks.get(body.task_id);
          if (!task || task.status !== 'completed') throw fault(409, 'TASK_NOT_COMPLETED', '当前会话没有已完成的该任务');
          value.reply = '这次行动已经记录，你可以休息一下了。';
          value.pet_action = 'happy'; value.strategy = 'feedback'; value.suggestion = null;
        } else if (body.event_type === 'scene_enter' && !body.preferences.proactive) {
          value.reply = '已切换场景，想聊天时可以告诉我。';
          value.suggestion = null;
        }
        if (value.suggestion) {
          value.suggestion.suggestion_id = `mock-suggestion-${randomUUID()}`;
          session.suggestions.set(value.suggestion.suggestion_id, { ...value.suggestion, task_id: null });
        }
      } else if (req.method === 'POST' && path === '/api/v1/tasks/accept') {
        if (!body || Object.keys(body).length !== 1 || typeof body.suggestion_id !== 'string')
          throw fault(400, 'INVALID_ACCEPT', '只能提交 suggestion_id');
        const suggestion = session.suggestions.get(body.suggestion_id);
        if (!suggestion) throw fault(404, 'SUGGESTION_NOT_FOUND', '建议不存在');
        if (!suggestion.task_id) {
          const task = { task_id: `mock-task-${randomUUID()}`, template_id: suggestion.task_template_id,
            status: 'active', started_at: new Date().toISOString(), duration_seconds: suggestion.duration_seconds };
          session.tasks.set(task.task_id, task); suggestion.task_id = task.task_id;
        }
        value = { mode: 'mock', task: structuredClone(session.tasks.get(suggestion.task_id)) };
      } else {
        const match = /^\/api\/v1\/tasks\/([^/]+)(\/complete)?$/.exec(path);
        if (!match || !((!match[2] && req.method === 'GET') || (match[2] && req.method === 'POST')))
          throw fault(404, 'NOT_FOUND', '接口不存在');
        const task = session.tasks.get(match[1]);
        if (!task) throw fault(404, 'TASK_NOT_FOUND', '任务不存在');
        if (match[2]) {
          if (!body || Object.keys(body).length) throw fault(400, 'INVALID_COMPLETE', '完成请求不接受奖励等参数');
          const already = task.status === 'completed';
          task.status = 'completed';
          value = { mode: 'mock', task: structuredClone(task), receipt: { already_completed: already, points_awarded: 0 },
            warning: '模拟完成未校验实际时长，不产生真实积分，不能用于成效统计' };
        } else value = { mode: 'mock', task: structuredClone(task) };
      }
      if (mutation) session.replay.set(replayKey, { signature, status, value: structuredClone(value) });
      send(status, value);
    } catch (error) {
      send(error.status ?? 500, { mode: 'mock', error: { code: error.code ?? 'INTERNAL_ERROR',
        message: error.status ? error.message : '模拟服务内部错误' } });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createMockServer().listen(8787, '127.0.0.1', () => {
    console.log('Mock only: http://127.0.0.1:8787 — no real AI, persistence or rewards.');
  });
}
