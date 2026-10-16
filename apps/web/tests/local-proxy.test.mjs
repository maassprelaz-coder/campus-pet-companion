import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createStaticServer } from '../dev-server.mjs';
import { createApiServer } from '../../../services/api/api-server.mjs';
import { TaskStore } from '../../../services/api/task-store.mjs';

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('本机同源入口保留Cookie、服务状态及来源校验，不能代理任意网站或非业务路径', async t => {
  const store = new TaskStore();
  t.after(() => store.close());
  const api = await listen(t, createApiServer({ store, mode: 'mock' }));
  const web = await listen(t, createStaticServer({ taskApiOrigin: api }));
  const health = await fetch(`${web}/health`);
  assert.equal((await health.json()).task_service, true);
  const created = await fetch(`${web}/api/v1/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(created.status, 201);
  const cookie = created.headers.get('set-cookie').split(';')[0];
  assert.match(created.headers.get('set-cookie'), /HttpOnly/);
  const restored = await fetch(`${web}/api/v1/session`, { headers: { Cookie: cookie } });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).preferences.remember, false);
  assert.equal((await fetch(`${web}/api/v1/session`)).status, 401);
  assert.equal((await fetch(`${web}/health`, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(`${web}/create_conversation`)).status, 404);
  assert.throws(() => createStaticServer({ taskApiOrigin: 'https://external.example' }), /local HTTP/);
  assert.throws(() => createStaticServer({ taskApiOrigin: 'http://127.0.0.1:8788/secret' }), /local HTTP/);
  const badHostStatus = await new Promise(resolve => {
    http.get(web + '/health', { headers: { Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); });
  });
  assert.equal(badHostStatus, 403);
});
