import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createMockServer } from './mock-api.mjs';

const event = JSON.parse(readFileSync(new URL('../contracts/fixtures/focus.request.json', import.meta.url)));

test('独立联调流程、重试、会话隔离及模拟状态', async t => {
  const server = createMockServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  let seq = 0;
  async function call(path, body, session, { method = 'POST', key, headers = {} } = {}) {
    const response = await fetch(base + path, { method, headers: {
      'Content-Type': 'application/json', 'Idempotency-Key': key ?? `test-${++seq}`,
      ...(session ? { 'X-Demo-Session': session } : {}), ...headers
    }, ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  const first = await call('/api/v1/sessions', {});
  const s1 = first.data.demo_session;
  const s2 = (await call('/api/v1/sessions', {})).data.demo_session;
  assert.equal((await call('/api/v1/companion/events', event)).status, 401);

  const suggestion = await call('/api/v1/companion/events', event, s1, { key: 'event-one' });
  assert.equal(suggestion.status, 200);
  assert.equal(suggestion.data.mode, 'mock');
  assert.equal(suggestion.data.suggestion.task_template_id, 'focus_25');
  assert.deepEqual((await call('/api/v1/companion/events', event, s1, { key: 'event-one' })).data, suggestion.data);
  assert.equal((await call('/api/v1/companion/events', { ...event, scene: 'sports' }, s1, { key: 'event-one' })).status, 409);
  assert.equal((await call('/api/v1/companion/events', { ...event, user_id: 'someone-else' }, s1)).status, 400);
  assert.equal((await call('/api/v1/companion/events', { ...event, preferences: { proactive: true, remember: true } }, s1)).status, 400);

  const acceptBody = { suggestion_id: suggestion.data.suggestion.suggestion_id };
  assert.equal((await call('/api/v1/tasks/accept', acceptBody, s2)).status, 404);
  const accepted = await call('/api/v1/tasks/accept', acceptBody, s1);
  const task = accepted.data.task;
  assert.equal(task.status, 'active');
  assert.equal((await call('/api/v1/tasks/accept', acceptBody, s1)).data.task.task_id, task.task_id);
  assert.equal((await call(`/api/v1/tasks/${task.task_id}`, null, s2, { method: 'GET' })).status, 404);
  assert.equal((await call(`/api/v1/tasks/${task.task_id}/complete`, {}, s2)).status, 404);
  assert.equal((await call('/api/v1/companion/events', { ...event, event_type: 'task_completed', task_id: task.task_id }, s1)).status, 409);
  assert.equal((await call(`/api/v1/tasks/${task.task_id}/complete`, { reward: 999 }, s1)).status, 400);

  const completed = await call(`/api/v1/tasks/${task.task_id}/complete`, {}, s1);
  assert.equal(completed.data.receipt.points_awarded, 0);
  assert.match(completed.data.warning, /模拟/);
  assert.equal((await call(`/api/v1/tasks/${task.task_id}/complete`, {}, s1)).data.receipt.already_completed, true);
  const feedback = await call('/api/v1/companion/events', { ...event, event_type: 'task_completed', task_id: task.task_id }, s1);
  assert.equal(feedback.data.strategy, 'feedback');
  assert.equal(feedback.data.suggestion, null);

  const disabled = await call('/api/v1/companion/events', { ...event, event_type: 'scene_enter', preferences: { proactive: false, remember: false } }, s1);
  assert.equal(disabled.data.suggestion, null);
  assert.equal((await call('/api/v1/memory', {}, s1, { method: 'DELETE' })).status, 501);
  assert.equal((await call('/api/v1/companion/events', event, s1, { headers: { Origin: 'https://example.org' } })).status, 403);

  const badJson = await fetch(base + '/api/v1/companion/events', { method: 'POST', headers: { 'X-Demo-Session': s1 }, body: '{broken' });
  assert.equal(badJson.status, 400);
});
