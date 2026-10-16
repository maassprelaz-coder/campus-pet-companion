import { randomBytes } from 'node:crypto';

// Paths/headers/fields were read from the signed-in Nankai documentation on 2026-10-16.
// Actual native and structured calls are recorded separately in agent/evidence; this file alone proves no access.
const baseUrl = 'https://coze.nankai.edu.cn/api/proxy/api/v1/';
async function limitedJson(response) {
  if (!response.ok || !/application\/json/i.test(response.headers.get('content-type') ?? ''))
    throw new Error('GeniOS HTTP or content-type failure');
  let size = 0;
  const parts = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 262144) throw new Error('GeniOS response too large');
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

export function createGeniosClient({ apiKey, fetchImpl = fetch } = {}) {
  if (typeof apiKey !== 'string' || !/^[\x21-\x7e]{1,500}$/.test(apiKey)) throw new Error('A server-side GeniOS API key is required');
  const post = async (path, body, signal) => limitedJson(await fetchImpl(baseUrl + path, {
    method: 'POST', redirect: 'error', signal,
    headers: { Apikey: apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  return {
    async generate(context, { signal } = {}) {
      // One isolated platform conversation per event. No campus identity, cookie or business owner ID is transmitted.
      const userId = randomBytes(10).toString('hex');
      const created = await post('create_conversation', { UserID: userId }, signal);
      const conversationId = created?.Conversation?.AppConversationID;
      if (typeof conversationId !== 'string' || !conversationId || conversationId.length > 200)
        throw new Error('GeniOS conversation response invalid');
      const response = await post('chat_query_v2', { UserID: userId, AppConversationID: conversationId,
        Query: JSON.stringify(context), ResponseMode: 'blocking' }, signal);
      if (response?.event === 'message_failed' || typeof response?.answer !== 'string' || !response.answer || response.answer.length > 16000)
        throw new Error('GeniOS answer response invalid');
      // Only answer reaches the strict boundary. Reasoning, tool traces and model-selected identifiers are never forwarded.
      return response.answer;
    }
  };
}

export function createGeniosAgent({ structuredOutputVerified = false, ...options } = {}) {
  if (structuredOutputVerified !== true)
    throw new Error('Verify a separate structured-output platform version before using this adapter; v0.1.0 is natural-language only');
  return createGeniosClient(options).generate;
}
