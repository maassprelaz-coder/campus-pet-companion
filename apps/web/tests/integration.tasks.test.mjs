import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { CompanionClient, buildEvent } from '../lib/api.mjs';
import { taskView } from '../lib/view-model.mjs';
import { TaskStore } from '../../../services/api/task-store.mjs';
import { createApiServer } from '../../../services/api/api-server.mjs';

async function setup(t) {
  let now = Date.parse('2026-10-16T00:00:00Z');
  const store = new TaskStore({ now: () => now });
  const server = createApiServer({ store, mode: 'mock', agent: async context => ({
    reply: '合成联调回复', pet_action: 'idle', strategy: context.completion_verified ? 'feedback' :
      context.suggestion_policy.allow_suggestion ? 'focus' : 'listen',
    suggested_task: context.suggestion_policy.allow_suggestion ? 'focus_25' : null, sources: [] }) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed; store.close(); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = () => {
    let cookie = '';
    const fetchImpl = async (url, init = {}) => {
      const response = await fetch(url, { ...init, headers: { ...init.headers, ...(init.credentials === 'include' && cookie ? { Cookie: cookie } : {}) } });
      if (response.headers.has('set-cookie') && init.credentials === 'include') cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    const client = () => new CompanionClient({ baseUrl, fetchImpl });
    return { client };
  };
  return { browser, advance: ms => { now += ms; } };
}
const send = (client, id) => client.sendEvent(buildEvent({ eventId: id, eventType: 'chat', scene: 'library', userMessage: '合成测试：想学习' }));

test('网页transport与SQLite服务实际HTTP联通：接受、刷新、提前拒绝、合法完成及反馈', async t => {
  const f = await setup(t);
  const browser = f.browser();
  let client = browser.client();
  await client.health(); await client.openSession();
  const reply = await send(client, 'first');
  const task = (await client.acceptSuggestion(reply.suggestion.suggestion_id)).task;
  const snapshot = await client.getSession();
  assert.equal(taskView(task, { serverTime: snapshot.server_time }).canComplete, false);
  await assert.rejects(client.completeTask(task.task_id), error => error.code === 'TASK_TOO_EARLY');
  client = browser.client();
  await client.health();
  assert.equal((await client.openSession()).active_task.task_id, task.task_id);
  f.advance(1500000);
  const done = await client.completeTask(task.task_id);
  assert.equal(done.task.status, 'completed');
  assert.equal(done.receipt.points_awarded, 0);
  const feedback = await client.sendEvent(buildEvent({ eventId: 'feedback', eventType: 'task_completed', scene: 'library', taskId: task.task_id }));
  assert.equal(feedback.strategy, 'feedback');
  assert.equal(feedback.suggestion, null);
});

test('网页transport实际保存拒绝与偏好；另一Cookie环境仍不能读取任务', async t => {
  const f = await setup(t);
  const browser = f.browser();
  const client = browser.client();
  await client.health(); await client.openSession();
  const reply = await send(client, 'reject');
  await client.rejectSuggestion(reply.suggestion.suggestion_id);
  assert.equal((await send(client, 'next')).suggestion, null);
  await client.savePreferences(false, 'preferences');
  assert.equal((await client.getSession()).preferences.proactive, false);
  f.advance(600000);
  const task = (await client.acceptSuggestion((await send(client, 'explicit-chat')).suggestion.suggestion_id)).task;
  const other = f.browser().client();
  await other.health(); await other.openSession();
  await assert.rejects(other.getTask(task.task_id), error => error.status === 404);
});
