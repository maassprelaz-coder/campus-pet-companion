// 网页端联调客户端（B 主责）。
// 只按 contracts/README.md 的接口 v0.1 草案调用本队业务服务：
// 不含平台密钥、不直连任何模型、不自行决定积分与奖励。
export const SCHEMA_VERSION = '0.1';
export const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_MOOD_LENGTH = 50;
export const MAX_ID_LENGTH = 100;
export const SCENES = Object.freeze(['dorm', 'library', 'sports', 'canteen']);
export const EVENT_TYPES = Object.freeze(['chat', 'scene_enter', 'task_completed']);

// 客户端自己发现输入不合法时抛这个，不向服务发请求。
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'CLIENT_INVALID_INPUT';
  }
}

// 服务返回错误或网络失败时抛这个，页面据此决定是否给“重试”。
export class ApiError extends Error {
  constructor({ status, code, message, retriable = false, requiresNewSession = false }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retriable = Boolean(retriable);
    this.requiresNewSession = Boolean(requiresNewSession);
  }
}

const SERVICE_RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

export function newEventId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `web-${uuid}`;
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

// 幂等键必须可稳定复现：同一逻辑请求重试时用同一个键，服务端才会复用结果。
export function shortKey(prefix, value) {
  const raw = `${prefix}:${value}`;
  if (raw.length <= MAX_ID_LENGTH) return raw;
  return `${prefix}:${fnv1a(value)}`;
}

export const eventIdempotencyKey = eventId => shortKey('event', eventId);
export const acceptIdempotencyKey = suggestionId => shortKey('accept', suggestionId);
export const completeIdempotencyKey = taskId => shortKey('complete', taskId);

export function normalizeBaseUrl(value) {
  const text = String(value ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(text)) {
    throw new ValidationError('服务地址需要是 http:// 或 https:// 开头，末尾不要带路径斜杠');
  }
  return text;
}

// 组事件。只发送契约允许的字段，preferences.remember 固定 false（记忆接口本轮关闭）。
export function buildEvent({
  eventId,
  eventType,
  scene,
  userMessage = '',
  mood = null,
  taskId = null,
  proactive = true,
}) {
  if (typeof eventId !== 'string' || eventId.length === 0 || eventId.length > MAX_ID_LENGTH) {
    throw new ValidationError('event_id 需要是 1—100 字符的字符串');
  }
  if (!EVENT_TYPES.includes(eventType)) throw new ValidationError(`未支持的事件类型：${eventType}`);
  if (!SCENES.includes(scene)) throw new ValidationError(`未支持的场景：${scene}`);
  if (typeof proactive !== 'boolean') throw new ValidationError('主动建议开关必须是布尔值');

  const message = typeof userMessage === 'string' ? userMessage : '';
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`消息超过 ${MAX_MESSAGE_LENGTH} 字上限，请缩短后再发送`);
  }
  if (eventType === 'chat' && message.trim().length === 0) {
    throw new ValidationError('空消息不会发送，请先输入内容');
  }

  const event = {
    schema_version: SCHEMA_VERSION,
    event_id: eventId,
    event_type: eventType,
    user_message: message,
    scene,
    preferences: { proactive, remember: false },
  };

  if (typeof mood === 'string' && mood.trim().length > 0) {
    if (mood.length > MAX_MOOD_LENGTH) throw new ValidationError(`自报心情超过 ${MAX_MOOD_LENGTH} 字上限`);
    event.mood = mood.trim();
  }

  if (eventType === 'task_completed') {
    if (typeof taskId !== 'string' || taskId.length === 0) {
      throw new ValidationError('完成事件必须带 task_id');
    }
    event.task_id = taskId;
  }

  return event;
}

export function normalizeError(status, payload, { networkFailure = false } = {}) {
  if (networkFailure) {
    return new ApiError({
      status: 0,
      code: 'NETWORK_UNREACHABLE',
      message: '连不上服务：请确认服务地址，或先在本机运行 npm run mock。',
      retriable: true,
    });
  }
  const code = payload?.error?.code ?? `HTTP_${status}`;
  const message = payload?.error?.message ?? `请求失败（HTTP ${status}）`;
  return new ApiError({
    status,
    code,
    message,
    retriable: SERVICE_RETRYABLE_STATUS.has(status),
    requiresNewSession: status === 401,
  });
}

// 只留可公开的摘要放进页面“证据面板”，便于录屏说明，且不含任何凭据。
export function summarizeResponse(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return {
    mode: typeof payload.mode === 'string' ? payload.mode : 'unknown',
    request_id: typeof payload.request_id === 'string' ? payload.request_id : null,
    strategy: payload.strategy ?? null,
    pet_action: payload.pet_action ?? null,
    hasSuggestion: Boolean(payload.suggestion),
    sourceCount: Array.isArray(payload.sources) ? payload.sources.length : 0,
  };
}

export class CompanionClient {
  constructor({ baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
    this.sessionId = null;
  }

  setBaseUrl(baseUrl) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.sessionId = null;
  }

  setSessionId(sessionId) {
    this.sessionId = sessionId || null;
  }

  async request(path, { method = 'GET', body, idempotencyKey, requireSession = true } = {}) {
    const headers = {};
    const init = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    if (requireSession) {
      if (!this.sessionId) {
        throw new ApiError({
          status: 401,
          code: 'NO_LOCAL_SESSION',
          message: '还没有本地会话，请先点击“连接服务”。',
          requiresNewSession: true,
        });
      }
      headers['X-Demo-Session'] = this.sessionId;
    }

    let response;
    try {
      response = await this.fetchImpl(this.baseUrl + path, init);
    } catch {
      throw normalizeError(0, null, { networkFailure: true });
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) throw normalizeError(response.status, payload);
    return payload;
  }

  health() {
    return this.request('/health', { requireSession: false });
  }

  async openSession() {
    const payload = await this.request('/api/v1/sessions', { method: 'POST', body: {}, requireSession: false });
    const sessionId = payload?.demo_session;
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new ApiError({
        status: 502,
        code: 'SESSION_MISSING',
        message: '服务没有返回会话标识，暂时无法继续。',
        retriable: true,
      });
    }
    this.sessionId = sessionId;
    return payload;
  }

  sendEvent(event) {
    return this.request('/api/v1/companion/events', {
      method: 'POST',
      body: event,
      idempotencyKey: eventIdempotencyKey(event.event_id),
    });
  }

  acceptSuggestion(suggestionId) {
    return this.request('/api/v1/tasks/accept', {
      method: 'POST',
      body: { suggestion_id: suggestionId },
      idempotencyKey: acceptIdempotencyKey(suggestionId),
    });
  }

  getTask(taskId) {
    return this.request(`/api/v1/tasks/${encodeURIComponent(taskId)}`);
  }

  completeTask(taskId) {
    return this.request(`/api/v1/tasks/${encodeURIComponent(taskId)}/complete`, {
      method: 'POST',
      body: {},
      idempotencyKey: completeIdempotencyKey(taskId),
    });
  }
}
