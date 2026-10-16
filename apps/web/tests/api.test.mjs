import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  CompanionClient,
  MAX_ID_LENGTH,
  ValidationError,
  buildEvent,
  completeIdempotencyKey,
  newEventId,
  normalizeBaseUrl,
  normalizeError,
  shortKey,
  summarizeResponse,
} from '../lib/api.mjs';

function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const result = handler(url, init) ?? {};
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers ?? {},
      body: init.body ? JSON.parse(init.body) : undefined,
      credentials: init.credentials,
    });
    const status = result.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => result.payload ?? {} };
  };
  return { fetchImpl, calls };
}

const baseEvent = {
  eventId: 'web-test-1',
  eventType: 'chat',
  scene: 'library',
  userMessage: '想静下心学习一会儿',
  proactive: true,
};

test('默认请求保留浏览器fetch所需的全局接收者', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async function () {
      assert.equal(this, globalThis, '浏览器内置fetch不能以CompanionClient实例作为接收者');
      return { ok: true, status: 200, json: async () => ({ mode: 'mock' }) };
    };
    const client = new CompanionClient();
    assert.equal((await client.health()).mode, 'mock');
  } finally {
    globalThis.fetch = previous;
  }
});

test('buildEvent 只发送契约字段，remember 固定 false', () => {
  const event = buildEvent(baseEvent);
  assert.deepEqual(Object.keys(event).sort(), ['event_id', 'event_type', 'preferences', 'scene', 'schema_version', 'user_message']);
  assert.equal(event.schema_version, '0.1');
  assert.deepEqual(event.preferences, { proactive: true, remember: false });
  assert.equal(event.mood, undefined);
});

test('buildEvent 拒绝不合法输入且不构造请求', () => {
  assert.throws(() => buildEvent({ ...baseEvent, scene: 'lab' }), ValidationError);
  assert.throws(() => buildEvent({ ...baseEvent, eventType: 'auto_sense' }), ValidationError);
  assert.throws(() => buildEvent({ ...baseEvent, userMessage: '   ' }), ValidationError);
  assert.throws(() => buildEvent({ ...baseEvent, userMessage: 'x'.repeat(2001) }), ValidationError);
  assert.throws(() => buildEvent({ ...baseEvent, eventId: '' }), ValidationError);
  assert.throws(() => buildEvent({ ...baseEvent, proactive: 'yes' }), ValidationError);
  assert.throws(() => buildEvent({ ...baseEvent, eventType: 'task_completed' }), ValidationError);
  assert.throws(() => buildEvent({ ...baseEvent, mood: 'x'.repeat(51) }), ValidationError);
});

test('buildEvent 完成事件带 task_id，且不把草稿或积分带出去', () => {
  const event = buildEvent({ ...baseEvent, eventType: 'task_completed', taskId: 'task-1', userMessage: '' });
  assert.equal(event.task_id, 'task-1');
  assert.equal(event.points, undefined);
  assert.equal(event.user_id, undefined);
  assert.equal(event.reward, undefined);
});

test('shortKey 稳定、可复现且不超长', () => {
  const long = 'x'.repeat(300);
  assert.equal(shortKey('event', long), shortKey('event', long));
  assert.ok(shortKey('event', long).length <= MAX_ID_LENGTH);
  assert.notEqual(shortKey('event', long), shortKey('event', `${long}y`));
  assert.equal(shortKey('event', 'abc'), 'event:abc');
});

test('newEventId 生成可用的短标识', () => {
  const id = newEventId();
  assert.ok(id.length > 0 && id.length <= MAX_ID_LENGTH);
  assert.notEqual(id, newEventId());
});

test('normalizeBaseUrl 处理末尾斜杠并拒绝非法地址', () => {
  assert.equal(normalizeBaseUrl(' http://127.0.0.1:8787/ '), 'http://127.0.0.1:8787');
  assert.equal(normalizeBaseUrl('https://example.org'), 'https://example.org');
  assert.throws(() => normalizeBaseUrl('127.0.0.1:8787'), ValidationError);
  assert.throws(() => normalizeBaseUrl(''), ValidationError);
});

test('normalizeError 区分可重试、需重建会话与不可重试', () => {
  const network = normalizeError(0, null, { networkFailure: true });
  assert.equal(network.code, 'NETWORK_UNREACHABLE');
  assert.equal(network.retriable, true);

  const busy = normalizeError(502, { error: { code: 'PLATFORM_FAILED', message: '平台暂时失败' } });
  assert.equal(busy.retriable, true);
  assert.equal(busy.message, '平台暂时失败');

  const conflict = normalizeError(409, { error: { code: 'KEY_REUSED', message: '同一重试键内容不一致' } });
  assert.equal(conflict.retriable, false);

  const unauthorized = normalizeError(401, { error: { code: 'NO_DEMO_SESSION', message: '先建立本地模拟会话' } });
  assert.equal(unauthorized.requiresNewSession, true);

  const unknown = normalizeError(418, null);
  assert.equal(unknown.code, 'HTTP_418');
});

test('CompanionClient 建立会话并校验返回', async () => {
  const ok = fakeFetch(() => ({ status: 201, payload: { mode: 'mock', demo_session: 'demo-1' } }));
  const client = new CompanionClient({ baseUrl: 'http://127.0.0.1:8787/', fetchImpl: ok.fetchImpl });
  await client.openSession();
  assert.equal(client.sessionId, 'demo-1');
  assert.equal(ok.calls[0].url, 'http://127.0.0.1:8787/api/v1/sessions');
  assert.equal(ok.calls[0].method, 'POST');

  const broken = fakeFetch(() => ({ status: 200, payload: { mode: 'mock' } }));
  const client2 = new CompanionClient({ fetchImpl: broken.fetchImpl });
  await assert.rejects(() => client2.openSession(), error => error instanceof ApiError && error.retriable === true);
});

test('sendEvent 带会话头与幂等键，重试时键保持一致', async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ payload: { mode: 'mock', reply: '好' } }));
  const client = new CompanionClient({ fetchImpl });
  client.setSessionId('demo-9');
  const event = buildEvent(baseEvent);

  await client.sendEvent(event);
  await client.sendEvent(event);

  assert.equal(calls[0].headers['X-Demo-Session'], 'demo-9');
  assert.equal(calls[0].headers['Idempotency-Key'], 'event:web-test-1');
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  assert.deepEqual(calls[0].body, calls[1].body);
});

test('没有会话时不发请求，改为提示重建会话', async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ payload: {} }));
  const client = new CompanionClient({ fetchImpl });
  await assert.rejects(
    () => client.sendEvent(buildEvent(baseEvent)),
    error => error.requiresNewSession === true && error.code === 'NO_LOCAL_SESSION',
  );
  assert.equal(calls.length, 0);
});

test('接受与完成使用稳定幂等键，查询任务只发 GET', async () => {
  const { fetchImpl, calls } = fakeFetch(url => (url.endsWith('/complete')
    ? { payload: { mode: 'mock', task: { task_id: 'task-1', status: 'completed' }, receipt: { already_completed: false, points_awarded: 0 } } }
    : { payload: { mode: 'mock', task: { task_id: 'task-1', status: 'active' } } }));
  const client = new CompanionClient({ fetchImpl });
  client.setSessionId('demo-9');

  await client.acceptSuggestion('sug-1');
  await client.acceptSuggestion('sug-1');
  await client.getTask('task/1');
  await client.completeTask('task-1');

  assert.equal(calls[0].headers['Idempotency-Key'], 'accept:sug-1');
  assert.deepEqual(calls[0].body, { suggestion_id: 'sug-1' });
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  assert.equal(calls[2].method, 'GET');
  assert.equal(calls[2].body, undefined);
  assert.match(calls[2].url, /task%2F1$/);
  assert.equal(calls[3].headers['Idempotency-Key'], completeIdempotencyKey('task-1'));
  assert.deepEqual(calls[3].body, {});
});

test('网络失败归一化为可重试，而不是当作成功', async () => {
  const client = new CompanionClient({
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  client.setSessionId('demo-9');
  await assert.rejects(
    () => client.getTask('task-1'),
    error => error.code === 'NETWORK_UNREACHABLE' && error.retriable === true,
  );
});

test('summarizeResponse 只保留可公开摘要', () => {
  const summary = summarizeResponse({
    mode: 'mock',
    reply: '很长的一段回复',
    request_id: 'mock-request-1',
    strategy: 'focus',
    pet_action: 'happy',
    suggestion: { suggestion_id: 's1' },
    sources: [{ title: 'a' }],
    user_message: '隐私内容',
  });
  assert.deepEqual(summary, {
    mode: 'mock',
    request_id: 'mock-request-1',
    strategy: 'focus',
    pet_action: 'happy',
    hasSuggestion: true,
    sourceCount: 1,
  });
  assert.equal('reply' in summary, false);
  assert.equal(summarizeResponse(null), null);
});

test('Cookie任务服务无需demo_session，所有后续请求携带Cookie且无模拟令牌头', async () => {
  const f = fakeFetch(url => ({ payload: url.endsWith('/health') ? { mode: 'live', task_service: true }
    : { mode: 'live', preferences: { proactive: true, remember: false }, active_task: null } }));
  const client = new CompanionClient({ fetchImpl: f.fetchImpl });
  await client.health();
  await client.openSession();
  assert.equal(client.hasSession, true);
  assert.equal(client.sessionId, null);
  await client.rejectSuggestion('suggestion-1');
  await client.savePreferences(false, 'pref-1');
  await client.getSession();
  for (const call of f.calls.slice(1)) {
    assert.equal(call.credentials, 'include');
    assert.equal('X-Demo-Session' in call.headers, false);
  }
  assert.equal(f.calls[2].headers['Idempotency-Key'], 'reject:suggestion-1');
  assert.deepEqual(f.calls[3].body, { proactive: false, remember: false });
});

test('仅进行中/上下文变化的409可重试，业务冲突仍明确拒绝', () => {
  for (const code of ['REQUEST_IN_PROGRESS', 'CONTEXT_CHANGED']) assert.equal(normalizeError(409, { error: { code } }).retriable, true);
  for (const code of ['KEY_REUSED', 'TASK_TOO_EARLY', 'SUGGESTION_EXPIRED']) assert.equal(normalizeError(409, { error: { code } }).retriable, false);
});
