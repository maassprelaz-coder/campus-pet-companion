import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { TaskStore, publicTask } from './task-store.mjs';
import { BoundaryError, createAgentBoundary, validateEvent } from './agent-boundary.mjs';
import { createGeniosAgent } from './genios-client.mjs';

const fault = (status, code, message) => { throw new BoundaryError(status, code, message); };
const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const cookieName = 'campus_session';
const cookieToken = req => {
  const values = (req.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${cookieName}=`));
  return values.length === 1 ? values[0].slice(cookieName.length + 1) : null;
};
async function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? ''))
    fault(415, 'JSON_REQUIRED', '修改请求须使用 application/json');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) fault(413, 'BODY_TOO_LARGE', '请求过大');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { fault(400, 'INVALID_JSON', '请求不是有效JSON'); }
}

export function createApiServer({ store = new TaskStore(), agent = null, timeoutMs = 15000,
  mode = 'live', origins = defaultOrigins, secureCookie = false } = {}) {
  if (!['live', 'mock'].includes(mode)) throw new Error('Unsupported mode');
  const generate = createAgentBoundary({ agent, timeoutMs });
  const allowedOrigins = new Set(origins);
  // No fixture is substituted when the real platform is missing.
  const templates = typeof agent === 'function' ? ['focus_25'] : [];
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(value));
    };
    try {
      const host = req.headers.host;
      const port = server.address()?.port;
      // This first delivery deliberately binds to loopback. A public deployment needs its own verified origin/HTTPS configuration.
      if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(host)) fault(403, 'HOST_NOT_ALLOWED', '服务地址不匹配');
      const origin = req.headers.origin;
      if (origin && origin !== `http://${host}` && !allowedOrigins.has(origin))
        fault(403, 'ORIGIN_NOT_ALLOWED', '该网页来源未获允许');
      if (!origin && req.headers['sec-fetch-site'] === 'cross-site') fault(403, 'ORIGIN_NOT_ALLOWED', '不接受跨站请求');
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const path = new URL(req.url, 'http://127.0.0.1').pathname;
      const envelope = value => ({ mode, server_time: new Date(store.now()).toISOString(), ...value });
      if (req.method === 'GET' && path === '/health') {
        send(200, envelope({ task_service: true, agent_configured: typeof agent === 'function',
          available_task_templates: templates, remember: false })); return;
      }
      const body = req.method === 'POST' ? await readBody(req) : {};
      let ownerId = store.authenticate(cookieToken(req));
      if (req.method === 'POST' && path === '/api/v1/sessions') {
        if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length)
          fault(400, 'INVALID_BODY', '创建会话只接受空对象');
        const existed = !!ownerId;
        if (!ownerId) {
          const created = store.createSession(body);
          ownerId = created.ownerId;
          res.setHeader('Set-Cookie', `${cookieName}=${created.token}; Path=/api/v1; HttpOnly; SameSite=Lax; Max-Age=${created.maxAge}${secureCookie ? '; Secure' : ''}`);
        }
        send(existed ? 200 : 201, envelope(store.state(ownerId))); return;
      }
      if (!ownerId) fault(401, 'SESSION_REQUIRED', '请先建立会话');
      if (req.method === 'GET' && path === '/api/v1/session') {
        send(200, envelope(store.state(ownerId))); return;
      }
      const key = req.headers['idempotency-key'];
      if (req.method === 'POST' && path === '/api/v1/companion/events') {
        const event = validateEvent(body);
        const ticket = store.claimEvent(ownerId, key, event, timeoutMs + 5000);
        if (ticket.value) { send(200, ticket.value); return; }
        try {
          // Source metadata is empty until a real retrieval adapter proves the current hits.
          const trusted = store.trusted(ownerId, event, templates, []);
          const output = await generate(event, trusted);
          send(200, store.finishEvent(ownerId, key, event, ticket, output, trusted, mode));
        } catch (error) {
          store.abandonEvent(ownerId, key, event.event_id, ticket.claim);
          throw error;
        }
        return;
      }
      if (req.method === 'POST' && path === '/api/v1/tasks/accept') {
        send(200, envelope(store.accept(ownerId, key, body, mode))); return;
      }
      if (req.method === 'POST' && path === '/api/v1/preferences') {
        send(200, envelope(store.preferences(ownerId, key, body, mode))); return;
      }
      const rejection = /^\/api\/v1\/suggestions\/([a-f0-9-]{36})\/reject$/.exec(path);
      if (req.method === 'POST' && rejection) {
        send(200, envelope(store.reject(ownerId, key, rejection[1], body, mode))); return;
      }
      const task = /^\/api\/v1\/tasks\/([a-f0-9-]{36})(\/complete)?$/.exec(path);
      if (task && req.method === 'GET' && !task[2]) {
        send(200, envelope({ task: publicTask(store.task(ownerId, task[1])) })); return;
      }
      if (task && req.method === 'POST' && task[2]) {
        send(200, envelope(store.complete(ownerId, key, task[1], body, mode))); return;
      }
      if (path === '/api/v1/memory') fault(501, 'NOT_IMPLEMENTED', '本版没有长期记忆功能');
      fault(404, 'NOT_FOUND', '接口不存在');
    } catch (error) {
      send(error instanceof BoundaryError ? error.status : 500, { mode, error: {
        code: error instanceof BoundaryError ? error.code : 'INTERNAL_ERROR',
        message: error instanceof BoundaryError ? error.message : '任务服务暂时不可用' } });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const store = new TaskStore({ filename: resolve(process.env.TASK_DB_PATH ?? 'data/private/tasks.sqlite') });
  const configPath = resolve(process.env.GENIOS_CONFIG_PATH ?? 'data/private/genios-config.json');
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : null;
  const agent = config?.structured_output_verified === true
    ? createGeniosAgent({ apiKey: config.api_key, structuredOutputVerified: true }) : null;
  const server = createApiServer({ store, agent });
  server.listen(port, '127.0.0.1', () => console.log(`Task API: http://127.0.0.1:${port} — persistent tasks; GeniOS structured adapter ${agent ? 'configured (verify live calls separately)' : 'not configured'}.`));
  const stop = () => server.close(() => { store.close(); });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
