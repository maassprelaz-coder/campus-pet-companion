import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { TaskStore } from '../../services/api/task-store.mjs';
import { createApiServer } from '../../services/api/api-server.mjs';

const startMs = Date.parse('2026-10-16T00:00:00Z');
const event = (id, extras = {}) => ({ schema_version: '0.1', event_id: id, event_type: 'chat',
  user_message: '合成测试：想专注一会儿', scene: 'library',
  preferences: { proactive: true, remember: false }, ...extras });
const listen = { reply: '合成回复：可以聊聊。', pet_action: 'idle', strategy: 'listen', suggested_task: null, sources: [] };
const syntheticAgent = async context => context.completion_verified
  ? { ...listen, reply: '合成回复：已完成的任务保持完成。', pet_action: 'happy', strategy: 'feedback' }
  : context.suggestion_policy.allow_suggestion
    ? { ...listen, reply: '合成回复：要不要专注25分钟？', strategy: 'focus', suggested_task: 'focus_25' } : listen;

async function setup(t, options = {}) {
  let clock = startMs;
  const directory = mkdtempSync(join(tmpdir(), 'campus-task-test-'));
  const filename = join(directory, 'tasks.sqlite');
  let store = new TaskStore({ filename, now: () => clock });
  let server;
  let base;
  const boot = async () => {
    server = createApiServer({ store, agent: syntheticAgent, mode: 'mock', ...options });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  };
  await boot();
  const closeServer = async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    store.close();
  };
  t.after(async () => { await closeServer(); rmSync(directory, { recursive: true, force: true }); });
  const request = async (cookie, path, { body, key, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) => {
    const response = await fetch(base + path, { method, headers: {
      ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(key === undefined ? {} : { 'Idempotency-Key': key }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = response.status === 204 ? null : await response.json();
    return { status: response.status, value, headers: response.headers };
  };
  const session = async () => {
    const result = await request(null, '/api/v1/sessions', { body: {} });
    assert.equal(result.status, 201);
    return { cookie: result.headers.get('set-cookie').split(';')[0], ...result };
  };
  return { request, session, url: () => base, advance: ms => { clock += ms; }, filename,
    store: () => store,
    restart: async () => { await closeServer(); store = new TaskStore({ filename, now: () => clock }); await boot(); } };
}

async function suggestion(fixture, cookie, id = 'suggest') {
  const result = await fixture.request(cookie, '/api/v1/companion/events', { body: event(id), key: `event-${id}` });
  assert.equal(result.status, 200, JSON.stringify(result.value));
  return result;
}
async function accept(fixture, cookie, suggestionId, key = 'accept') {
  return fixture.request(cookie, '/api/v1/tasks/accept', { body: { suggestion_id: suggestionId }, key });
}

test('安全Cookie会话可恢复；不返回主体/令牌，拒绝未认证与伪造字段', async t => {
  const f = await setup(t);
  const s = await f.session();
  assert.match(s.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal('demo_session' in s.value, false);
  assert.equal('owner_id' in s.value, false);
  assert.equal((await f.request(null, '/api/v1/session')).status, 401);
  assert.equal((await f.request('campus_session=forged', '/api/v1/session')).status, 401);
  const resumed = await f.request(s.cookie, '/api/v1/sessions', { body: {} });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.headers.has('set-cookie'), false);
  const forged = await f.request(s.cookie, '/api/v1/companion/events', { key: 'forged', body: { ...event('bad'), user_id: 'other' } });
  assert.equal(forged.status, 400);
});

test('服务端计时、重启恢复、提前完成拒绝、重复完成不重复生效', async t => {
  const f = await setup(t);
  const s = await f.session();
  const answer = await suggestion(f, s.cookie);
  const accepted = await accept(f, s.cookie, answer.value.suggestion.suggestion_id);
  assert.equal(accepted.status, 200);
  const task = accepted.value.task;
  assert.equal(task.duration_seconds, 1500);
  assert.equal(Date.parse(task.ends_at) - Date.parse(task.started_at), 1500000);
  const completion = `/api/v1/tasks/${task.task_id}/complete`;
  const early = await f.request(s.cookie, completion, { body: {}, key: 'complete' });
  assert.equal(early.value.error.code, 'TASK_TOO_EARLY');
  f.advance(1499999);
  assert.equal((await f.request(s.cookie, completion, { body: {}, key: 'complete' })).status, 409);
  await f.restart();
  assert.deepEqual((await f.request(s.cookie, '/api/v1/session')).value.active_task, task);
  f.advance(1);
  const done = await f.request(s.cookie, completion, { body: {}, key: 'complete' });
  assert.equal(done.status, 200);
  assert.deepEqual(done.value.receipt, { already_completed: false, points_awarded: 0 });
  f.advance(1000);
  const replay = await f.request(s.cookie, completion, { body: {}, key: 'complete' });
  assert.deepEqual(replay.value, done.value);
  const repeat = await f.request(s.cookie, completion, { body: {}, key: 'complete-again' });
  assert.deepEqual(repeat.value.receipt, { already_completed: true, points_awarded: 0 });
  assert.equal(repeat.value.task.completed_at, done.value.task.completed_at);
  assert.equal((await f.request(s.cookie, '/api/v1/session')).value.active_task, null);
});

test('不同会话不能读写、接受、拒绝或冒充彼此任务', async t => {
  const f = await setup(t);
  const a = await f.session();
  const b = await f.session();
  const reply = await suggestion(f, a.cookie);
  const id = reply.value.suggestion.suggestion_id;
  assert.equal((await accept(f, b.cookie, id)).status, 404);
  assert.equal((await f.request(b.cookie, `/api/v1/suggestions/${id}/reject`, { body: {}, key: 'reject' })).status, 404);
  const task = (await accept(f, a.cookie, id)).value.task;
  for (const [path, args] of [
    [`/api/v1/tasks/${task.task_id}`, {}],
    [`/api/v1/tasks/${task.task_id}/complete`, { body: {}, key: 'complete' }],
    ['/api/v1/companion/events', { body: event('feedback', { event_type: 'task_completed', task_id: task.task_id }), key: 'feedback' }]
  ]) assert.equal((await f.request(b.cookie, path, args)).status, 404);
});

test('幂等键和event_id各自去重；换键重试不产生第二个建议或任务', async t => {
  const f = await setup(t);
  const s = await f.session();
  const first = await suggestion(f, s.cookie);
  const canonicalRetry = await f.request(s.cookie, '/api/v1/companion/events', {
    key: 'event-suggest', body: Object.fromEntries(Object.entries(event('suggest')).reverse()) });
  assert.deepEqual(canonicalRetry.value, first.value);
  const retry = await f.request(s.cookie, '/api/v1/companion/events', { body: event('suggest'), key: 'different' });
  assert.deepEqual(retry.value, first.value);
  const changed = { ...event('suggest'), user_message: '不同的内容' };
  assert.equal((await f.request(s.cookie, '/api/v1/companion/events', { body: changed, key: 'event-suggest' })).value.error.code, 'KEY_REUSED');
  assert.equal((await f.request(s.cookie, '/api/v1/companion/events', { body: changed, key: 'new' })).value.error.code, 'EVENT_REUSED');
  const id = first.value.suggestion.suggestion_id;
  const attempts = await Promise.all([accept(f, s.cookie, id, 'accept-a'), accept(f, s.cookie, id, 'accept-b')]);
  assert.equal(attempts[0].value.task.task_id, attempts[1].value.task.task_id);
  assert.equal((await f.request(s.cookie, '/api/v1/preferences', { body: { proactive: false, remember: false }, key: 'accept-a' })).value.error.code, 'KEY_REUSED');
});

test('拒绝抑制建议且不创建任务；偏好持久化，旧建议不能再次接受', async t => {
  const contexts = [];
  const f = await setup(t, { agent: async context => { contexts.push(context); return syntheticAgent(context); } });
  const s = await f.session();
  const reply = await suggestion(f, s.cookie);
  const id = reply.value.suggestion.suggestion_id;
  assert.equal((await f.request(s.cookie, `/api/v1/suggestions/${id}/reject`, { body: {}, key: 'reject' })).status, 200);
  assert.equal((await accept(f, s.cookie, id)).value.error.code, 'SUGGESTION_REJECTED');
  const after = await f.request(s.cookie, '/api/v1/companion/events', { body: event('after-reject'), key: 'after-reject' });
  assert.equal(after.value.suggestion, null);
  assert.equal(contexts.at(-1).suggestion_policy.reason, 'recent_rejection');
  assert.equal((await f.request(s.cookie, '/api/v1/session')).value.active_task, null);
  await f.request(s.cookie, '/api/v1/preferences', { body: { proactive: false, remember: false }, key: 'pref' });
  await f.restart();
  assert.deepEqual((await f.request(s.cookie, '/api/v1/session')).value.preferences, { proactive: false, remember: false });
  f.advance(600000);
  const scene = await f.request(s.cookie, '/api/v1/companion/events', { body: event('scene', { event_type: 'scene_enter' }), key: 'scene' });
  assert.equal(scene.value.suggestion, null);
  assert.equal(contexts.at(-1).suggestion_policy.reason, 'proactive_disabled');
  assert.equal((await f.request(s.cookie, '/api/v1/preferences', { body: { proactive: true, remember: true }, key: 'memory' })).status, 400);
});

test('明确文字拒绝会跨事件抑制建议，模型失败重试也不会重复延长抑制', async t => {
  let fail = true;
  const seen = [];
  const f = await setup(t, { agent: async context => {
    seen.push(context);
    if (fail) throw new Error('synthetic failure');
    return syntheticAgent(context);
  } });
  const s = await f.session();
  const body = event('refusal-text', { user_message: '今天只想聊聊，不要给我安排任务。' });
  assert.equal((await f.request(s.cookie, '/api/v1/companion/events', { body, key: 'refusal-text' })).status, 502);
  assert.equal(seen.at(-1).suggestion_policy.reason, 'recent_rejection');
  f.advance(500000);
  fail = false;
  assert.equal((await f.request(s.cookie, '/api/v1/companion/events', { body, key: 'refusal-text' })).value.suggestion, null);
  const later = await f.request(s.cookie, '/api/v1/companion/events', { body: event('other-scene', { event_type: 'scene_enter' }), key: 'other-scene' });
  assert.equal(later.value.suggestion, null);
  f.advance(100000);
  assert.equal((await suggestion(f, s.cookie, 'after-cooldown')).value.suggestion.task_template_id, 'focus_25');
});

test('建议过期、进行中任务以及客户端奖励/时长参数被拒绝', async t => {
  const f = await setup(t);
  const s = await f.session();
  const first = await suggestion(f, s.cookie);
  const id = first.value.suggestion.suggestion_id;
  f.advance(600000);
  assert.equal((await accept(f, s.cookie, id)).value.error.code, 'SUGGESTION_EXPIRED');
  const next = await suggestion(f, s.cookie, 'next');
  const injected = await f.request(s.cookie, '/api/v1/tasks/accept', {
    body: { suggestion_id: next.value.suggestion.suggestion_id, duration_seconds: 1 }, key: 'bad' });
  assert.equal(injected.status, 400);
  const task = (await accept(f, s.cookie, next.value.suggestion.suggestion_id)).value.task;
  const response = await suggestion(f, s.cookie, 'while-active');
  assert.equal(response.value.suggestion, null);
  assert.equal((await f.request(s.cookie, `/api/v1/tasks/${task.task_id}/complete`, { body: { points: 999 }, key: 'award' })).status, 400);
});

test('模型等待时可修改偏好；过时结果不保存为可接受的建议', async t => {
  let release;
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const f = await setup(t, { agent: async context => { entered(); await new Promise(resolve => { release = resolve; }); return syntheticAgent(context); } });
  const s = await f.session();
  const waiting = f.request(s.cookie, '/api/v1/companion/events', { body: event('slow'), key: 'slow' });
  await ready;
  const duplicate = await f.request(s.cookie, '/api/v1/companion/events', { body: event('slow'), key: 'slow-2' });
  assert.equal(duplicate.value.error.code, 'REQUEST_IN_PROGRESS');
  const preference = await f.request(s.cookie, '/api/v1/preferences', { body: { proactive: false, remember: false }, key: 'pref' });
  assert.equal(preference.status, 200);
  release();
  assert.equal((await waiting).value.error.code, 'CONTEXT_CHANGED');
  assert.equal(f.store().one('SELECT count(*) AS n FROM suggestions').n, 0);
});

test('完成任务不依赖模型；反馈超时后持久保留完成结果且能重试', async t => {
  let hang = false;
  const f = await setup(t, { timeoutMs: 25, agent: async context => hang ? new Promise(() => {}) : syntheticAgent(context) });
  const s = await f.session();
  const reply = await suggestion(f, s.cookie);
  const task = (await accept(f, s.cookie, reply.value.suggestion.suggestion_id)).value.task;
  f.advance(1500000);
  assert.equal((await f.request(s.cookie, `/api/v1/tasks/${task.task_id}/complete`, { body: {}, key: 'complete' })).status, 200);
  const body = event('feedback', { event_type: 'task_completed', task_id: task.task_id });
  hang = true;
  const failed = await f.request(s.cookie, '/api/v1/companion/events', { body, key: 'feedback' });
  assert.equal(failed.status, 504);
  await f.restart();
  assert.equal((await f.request(s.cookie, `/api/v1/tasks/${task.task_id}`)).value.task.status, 'completed');
  hang = false;
  const retry = await f.request(s.cookie, '/api/v1/companion/events', { body, key: 'feedback' });
  assert.equal(retry.status, 200);
  assert.equal(retry.value.strategy, 'feedback');
  assert.equal(retry.value.suggestion, null);
});

test('缺平台连接返回503；非法结构/来源不留建议，内部异常不泄漏', async t => {
  const f = await setup(t, { agent: null, mode: 'live' });
  const s = await f.session();
  const health = await f.request(null, '/health');
  assert.equal(health.value.agent_configured, false);
  assert.deepEqual(health.value.available_task_templates, []);
  const result = await f.request(s.cookie, '/api/v1/companion/events', { body: event('missing'), key: 'missing' });
  assert.equal(result.status, 503);
  assert.equal(result.value.error.code, 'PLATFORM_NOT_CONFIGURED');
  assert.equal(f.store().one('SELECT count(*) AS n FROM suggestions').n, 0);
  const broken = await setup(t, { agent: async () => { throw new Error('PRIVATE-API-SECRET'); } });
  const b = await broken.session();
  const bad = await broken.request(b.cookie, '/api/v1/companion/events', { body: event('broken'), key: 'broken' });
  assert.equal(bad.status, 502);
  assert.ok(!JSON.stringify(bad.value).includes('PRIVATE-API-SECRET'));
  const unverified = await setup(t, { agent: async () => ({ ...listen, sources: [{ title: '虚构', url: 'https://example.org/', verified_on: '2026-10-16' }] }) });
  const u = await unverified.session();
  assert.equal((await unverified.request(u.cookie, '/api/v1/companion/events', { body: event('source'), key: 'source' })).status, 502);
});

test('跨站/错误Host/表单请求被拒绝，受控来源支持携带Cookie', async t => {
  const f = await setup(t);
  assert.equal((await f.request(null, '/api/v1/sessions', { body: {}, headers: { Origin: 'https://evil.example' } })).status, 403);
  const wrongHostStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(f.url() + '/health', { headers: { Host: 'evil.example' } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.end();
  });
  assert.equal(wrongHostStatus, 403);
  assert.equal((await f.request(null, '/api/v1/sessions', { body: {}, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.request(null, '/api/v1/sessions', { body: {}, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const preflight = await f.request(null, '/api/v1/sessions', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  const s = await f.session();
  assert.equal((await f.request(s.cookie, '/api/v1/preferences', { body: { proactive: false, remember: false } })).status, 400);
});

test('过期会话不恢复他人任务，持久文件中不保存会话原始令牌或用户输入', async t => {
  const f = await setup(t);
  const s = await f.session();
  await suggestion(f, s.cookie);
  const raw = readFileSync(f.filename).toString('latin1');
  assert.ok(!raw.includes(s.cookie.split('=')[1]));
  assert.equal(f.store().one('SELECT count(*) AS n FROM sessions').n, 1);
  f.advance(7 * 24 * 60 * 60 * 1000);
  assert.equal((await f.request(s.cookie, '/api/v1/session')).status, 401);
  const renewed = await f.request(s.cookie, '/api/v1/sessions', { body: {} });
  assert.equal(renewed.status, 201);
  assert.equal(renewed.value.active_task, null);
  assert.equal(f.store().one('SELECT count(*) AS n FROM events').n, 0);
});
