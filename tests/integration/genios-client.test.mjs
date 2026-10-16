import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeniosClient, createGeniosAgent } from '../../services/api/genios-client.mjs';
import { createAgentBoundary } from '../../services/api/agent-boundary.mjs';

const event = { schema_version: '0.1', event_id: 'synthetic-event', event_type: 'chat', user_message: '合成输入',
  scene: 'dorm', preferences: { proactive: false, remember: false } };
const trusted = { session_id: 'internal-owner-not-for-platform', preferences: event.preferences,
  now_ms: 1000, available_templates: [], retrieved_sources: [] };
const output = { reply: '合成回复', pet_action: 'idle', strategy: 'listen', suggested_task: null, sources: [] };
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

test('按实际文档构造请求，只返回answer；两次调用使用不同平台主体与会话', async () => {
  const calls = [];
  let conversations = 0;
  const client = createGeniosClient({ apiKey: 'synthetic-test-key', fetchImpl: async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    return url.endsWith('create_conversation') ? json({ Conversation: { AppConversationID: `synthetic-${++conversations}` } })
      : json({ event: 'message', answer: JSON.stringify(output), think_messages: ['do-not-forward'], tool_messages: ['do-not-forward'] });
  } });
  const boundary = createAgentBoundary({ agent: client.generate });
  assert.deepEqual(await boundary(event, trusted), output);
  assert.deepEqual(await boundary(event, trusted), output);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, 'https://coze.nankai.edu.cn/api/proxy/api/v1/create_conversation');
  assert.equal(calls[1].url, 'https://coze.nankai.edu.cn/api/proxy/api/v1/chat_query_v2');
  assert.equal(calls[0].headers.Apikey, 'synthetic-test-key');
  assert.equal('Cookie' in calls[0].headers, false);
  assert.equal(calls[0].redirect, 'error');
  assert.equal(calls[1].body.UserID, calls[0].body.UserID);
  assert.equal(calls[1].body.AppConversationID, 'synthetic-1');
  assert.match(calls[0].body.UserID, /^[a-f0-9]{20}$/);
  assert.notEqual(calls[0].body.UserID, calls[2].body.UserID);
  assert.ok(!calls[1].body.Query.includes(trusted.session_id));
  assert.equal(calls[1].body.ResponseMode, 'blocking');
});

test('自然语言发布版不能直接启用结构化适配器；普通文本回答被边界拒绝', async () => {
  assert.throws(() => createGeniosAgent({ apiKey: 'synthetic' }), /structured-output/);
  const agent = createGeniosAgent({ apiKey: 'synthetic', structuredOutputVerified: true,
    fetchImpl: async url => url.endsWith('create_conversation') ? json({ Conversation: { AppConversationID: 'test' } })
      : json({ event: 'message', answer: '普通自然语言回答' }) });
  await assert.rejects(createAgentBoundary({ agent })(event, trusted), error => error.code === 'INVALID_AGENT_OUTPUT');
});

test('重定向/非JSON/缺会话/消息失败均失败，不输出上游错误或思考内容', async () => {
  for (const response of [
    () => new Response('secret error', { status: 403, headers: { 'Content-Type': 'text/plain' } }),
    () => json({ Conversation: {} }),
    url => url.endsWith('create_conversation') ? json({ Conversation: { AppConversationID: 'test' } })
      : json({ event: 'message_failed', answer: 'PRIVATE-ERROR' })
  ]) {
    const agent = createGeniosClient({ apiKey: 'synthetic', fetchImpl: async url => response(url) }).generate;
    await assert.rejects(createAgentBoundary({ agent })(event, trusted), error =>
      error.code === 'PLATFORM_FAILURE' && !error.message.includes('PRIVATE'));
  }
});

test('取消信号传递到实际请求，超时可中止等待', async () => {
  let signal;
  const agent = createGeniosClient({ apiKey: 'synthetic', fetchImpl: async (_, options) => {
    signal = options.signal;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } }).generate;
  await assert.rejects(createAgentBoundary({ agent, timeoutMs: 10 })(event, trusted), error => error.code === 'PLATFORM_TIMEOUT');
  assert.equal(signal.aborted, true);
});
