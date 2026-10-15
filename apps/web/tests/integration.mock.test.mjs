// 端到端联调测试：真的启动 tools/mock-api.mjs 的模拟服务与本目录的静态服务器，
// 用页面实际使用的 CompanionClient 走一遍完整流程。
// 注意：validate 的是“契约与链路”，不是真实 GeniOS 效果；真实联调仍待 A 提供 live 服务。
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMockServer } from '../../../tools/mock-api.mjs';
import { createStaticServer } from '../dev-server.mjs';
import { CompanionClient, buildEvent, newEventId } from '../lib/api.mjs';

// mock 只放行 5173 的 Origin；这里用真实的 5173 头值验证跨域契约（两个服务器用随机端口，故手动带上该头）。
const BROWSER_ORIGIN = 'http://127.0.0.1:5173';

function browserFetch(url, init = {}) {
  return fetch(url, { ...init, headers: { ...(init.headers ?? {}), Origin: BROWSER_ORIGIN } });
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function startMock(t) {
  const server = createMockServer();
  const base = await listen(server);
  t.after(() => new Promise(resolve => server.close(resolve)));
  return new CompanionClient({ baseUrl: base, fetchImpl: browserFetch });
}

test('静态服务器按 5173 约定返回页面、样式与模块，并挡住目录穿越', async t => {
  const server = createStaticServer();
  const base = await listen(server);
  t.after(() => new Promise(resolve => server.close(resolve)));

  const html = await fetch(`${base}/`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.match(await html.text(), /id="mode-badge"/);

  const script = await fetch(`${base}/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
  assert.match(await script.text(), /textContent/);

  const lib = await fetch(`${base}/lib/api.mjs`);
  assert.match(lib.headers.get('content-type'), /javascript/);
  assert.equal(lib.status, 200);

  assert.equal((await fetch(`${base}/nope.html`)).status, 404);

  // 编码过的目录穿越尝试不能读到 apps/web 之外的文件（Windows 路径归一化后落到 404，也算拦住）。
  const traversal = await fetch(`${base}/..%2F..%2Fpackage.json`);
  assert.ok([403, 404].includes(traversal.status), `目录穿越应被拦，实际 ${traversal.status}`);
  assert.equal((await traversal.text()).includes('"name"'), false);
});

test('mock 上走通：会话→建议→接受→恢复→完成→反馈，且全程 mode=mock', async t => {
  const client = await startMock(t);
  await client.openSession();
  assert.match(client.sessionId, /^demo-/);

  const chatEvent = buildEvent({
    eventId: newEventId(),
    eventType: 'chat',
    scene: 'library',
    userMessage: '想静下心学习一会儿',
    proactive: true,
  });
  const reply = await client.sendEvent(chatEvent);
  assert.equal(reply.mode, 'mock');
  assert.equal(reply.suggestion.task_template_id, 'focus_25');
  assert.equal(reply.suggestion.duration_seconds, 1500);

  const accepted = await client.acceptSuggestion(reply.suggestion.suggestion_id);
  assert.equal(accepted.task.status, 'active');
  const taskId = accepted.task.task_id;

  const restored = await client.getTask(taskId);
  assert.equal(restored.task.task_id, taskId);
  assert.equal(restored.task.status, 'active');

  const completed = await client.completeTask(taskId);
  assert.equal(completed.task.status, 'completed');
  assert.equal(completed.receipt.points_awarded, 0);
  assert.match(completed.warning, /模拟/);

  const feedbackEvent = buildEvent({
    eventId: newEventId(),
    eventType: 'task_completed',
    scene: 'library',
    userMessage: '',
    proactive: true,
    taskId,
  });
  const feedback = await client.sendEvent(feedbackEvent);
  assert.equal(feedback.strategy, 'feedback');
  assert.equal(feedback.suggestion, null);
  assert.equal(feedback.mode, 'mock');

  const sceneEvent = buildEvent({
    eventId: newEventId(),
    eventType: 'scene_enter',
    scene: 'sports',
    userMessage: '',
    proactive: false,
  });
  const suppressed = await client.sendEvent(sceneEvent);
  assert.equal(suppressed.suggestion, null);
});

test('失败路径：无会话可自动重建，跨会话取任务被拒，错误可区分重试', async t => {
  const client = await startMock(t);
  const event = buildEvent({
    eventId: newEventId(),
    eventType: 'chat',
    scene: 'sports',
    userMessage: '想出去活动一下',
    proactive: true,
  });

  // 还没建会话就发送：应提示重建会话，而不是静默成功。
  await assert.rejects(
    () => client.sendEvent(event),
    error => error.requiresNewSession === true && error.code === 'NO_LOCAL_SESSION',
  );

  await client.openSession();
  const created = await client.sendEvent(event);
  const accepted = await client.acceptSuggestion(created.suggestion.suggestion_id);
  const taskId = accepted.task.task_id;

  // 另一个会话不能读写别人的任务。
  const other = await startMock(t);
  await other.openSession();
  await assert.rejects(
    () => other.getTask(taskId),
    error => error.status === 404 && error.code === 'TASK_NOT_FOUND' && error.retriable === false,
  );

  // 平台类失败可重试，参数类错误不可重试。
  const busy = await client.request('/api/v1/companion/events', {
    method: 'POST',
    body: { ...event, event_id: newEventId(), event_type: 'chat', scene: 'lab' },
    idempotencyKey: 'event:invalid-scene-check',
  }).catch(error => error);
  assert.equal(busy.status, 400);
  assert.equal(busy.code, 'INVALID_EVENT');
  assert.equal(busy.retriable, false);

  // 记忆接口本轮关闭：页面不能假装已有长期记忆。
  const memory = await client.request('/api/v1/memory', { method: 'DELETE' }).catch(error => error);
  assert.equal(memory.status, 501);
  assert.equal(memory.retriable, false);

  // 非白名单来源（评审页以外的地址）被拒。
  const foreign = new CompanionClient({
    baseUrl: client.baseUrl,
    fetchImpl: (url, init = {}) => fetch(url, { ...init, headers: { ...(init.headers ?? {}), Origin: 'https://example.org' } }),
  });
  foreign.setSessionId(client.sessionId);
  const blocked = await foreign.getTask(taskId).catch(error => error);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.code, 'ORIGIN_NOT_ALLOWED');
});
