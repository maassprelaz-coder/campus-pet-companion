// Platform-independent boundary. No campus endpoint, credentials or model is bundled.
export const taskTemplates = Object.freeze({
  focus_25: Object.freeze({ title: '专注 25 分钟', duration_seconds: 1500 })
});
const actions = new Set(['idle', 'happy', 'think', 'sleep', 'eat', 'roll', 'sad']);
const strategies = new Set(['listen', 'focus', 'relax', 'clarify', 'feedback', 'support']);
const eventKeys = ['schema_version', 'event_id', 'event_type', 'user_message', 'scene', 'mood', 'preferences', 'task_id'];
const outputKeys = ['reply', 'pet_action', 'strategy', 'suggested_task', 'sources'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, keys) => isObject(value) && Object.keys(value).every(key => keys.includes(key));
const exactKeys = (value, keys) => onlyKeys(value, keys) && Object.keys(value).length === keys.length;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export class BoundaryError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function validateEvent(event) {
  if (!onlyKeys(event, eventKeys) || event.schema_version !== '0.1' ||
      !text(event.event_id, 100) || !['chat', 'scene_enter', 'task_completed'].includes(event.event_type) ||
      typeof event.user_message !== 'string' || event.user_message.length > 2000 ||
      !['dorm', 'library', 'sports', 'canteen'].includes(event.scene) ||
      !(event.mood === undefined || event.mood === null || typeof event.mood === 'string' && event.mood.length <= 50) ||
      !exactKeys(event.preferences, ['proactive', 'remember']) ||
      typeof event.preferences.proactive !== 'boolean' || event.preferences.remember !== false ||
      !(event.task_id === undefined || text(event.task_id, 100)) ||
      event.event_type === 'task_completed' && !text(event.task_id, 100)) {
    throw new BoundaryError(400, 'INVALID_EVENT', '请求不符合接口 v0.1');
  }
  return structuredClone(event);
}

// These arguments must come from authenticated server state, never request JSON.
export function suggestionPolicy({ eventType, proactiveEnabled, activeTask = null,
  rejectedUntilMs = 0, lastSuggestedAtMs = null, nowMs, availableTemplates = [] }) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(rejectedUntilMs) ||
      !(lastSuggestedAtMs === null || Number.isFinite(lastSuggestedAtMs)) ||
      typeof proactiveEnabled !== 'boolean' || !Array.isArray(availableTemplates)) {
    throw new BoundaryError(500, 'INVALID_TRUSTED_CONTEXT', '服务端建议状态不完整');
  }
  const available = [...new Set(availableTemplates)].filter(id => Object.hasOwn(taskTemplates, id));
  let reason = 'eligible';
  if (eventType === 'task_completed') reason = 'completion_feedback';
  else if (eventType === 'scene_enter' && !proactiveEnabled) reason = 'proactive_disabled';
  else if (activeTask?.status === 'active') reason = 'active_task';
  else if (rejectedUntilMs > nowMs) reason = 'recent_rejection';
  else if (lastSuggestedAtMs !== null && nowMs - lastSuggestedAtMs < 10 * 60 * 1000) reason = 'cooldown';
  else if (!available.length) reason = 'no_available_task';
  return { allow_suggestion: reason === 'eligible', reason,
    available_task_templates: reason === 'eligible' ? available : [] };
}

function sourceSignature(source) {
  if (!exactKeys(source, ['title', 'url', 'verified_on']) || !text(source.title, 200) ||
      !text(source.url, 2000) || !/^\d{4}-\d{2}-\d{2}$/.test(source.verified_on)) return null;
  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
  } catch { return null; }
  return JSON.stringify([source.title, source.url, source.verified_on]);
}

export function validateAgentOutput(candidate, { allowedTemplates = [], retrievedSources = [],
  completionVerified = false } = {}) {
  const invalid = () => { throw new BoundaryError(502, 'INVALID_AGENT_OUTPUT', '智能体返回结构或权限不符合约定，请重试'); };
  let output = candidate;
  if (typeof output === 'string') {
    if (output.length > 16000) invalid();
    try { output = JSON.parse(output); } catch { invalid(); }
  }
  if (!exactKeys(output, outputKeys) || !text(output.reply, 1000) ||
      !actions.has(output.pet_action) || !strategies.has(output.strategy) ||
      !Array.isArray(output.sources) || output.sources.length > 5 ||
      !(output.suggested_task === null || typeof output.suggested_task === 'string' &&
        Object.hasOwn(taskTemplates, output.suggested_task) && allowedTemplates.includes(output.suggested_task)) ||
      output.suggested_task === 'focus_25' && output.strategy !== 'focus' ||
      ['support', 'feedback', 'listen', 'clarify'].includes(output.strategy) && output.suggested_task !== null ||
      output.strategy === 'feedback' && !completionVerified ||
      completionVerified && !['feedback', 'support'].includes(output.strategy)) invalid();
  const allowedSources = new Set(retrievedSources.map(sourceSignature).filter(Boolean));
  const used = new Set();
  for (const source of output.sources) {
    const signature = sourceSignature(source);
    if (signature === null || !allowedSources.has(signature) || used.has(signature)) invalid();
    used.add(signature);
  }
  // Return text as data; the web must still use textContent, never innerHTML.
  return structuredClone(output);
}

export function createAgentBoundary({ agent = null, timeoutMs = 15000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
    throw new Error('timeoutMs must be an integer between 1 and 120000');
  }
  return async function generate(rawEvent, trusted) {
    const event = validateEvent(rawEvent);
    if (!isObject(trusted) || !text(trusted.session_id, 100) ||
        !isObject(trusted.preferences) || typeof trusted.preferences.proactive !== 'boolean' ||
        trusted.preferences.remember !== false || !Number.isFinite(trusted.now_ms) ||
        !Array.isArray(trusted.available_templates) || !Array.isArray(trusted.retrieved_sources)) {
      throw new BoundaryError(500, 'INVALID_TRUSTED_CONTEXT', '服务端上下文未就绪');
    }
    const completed = trusted.completed_task;
    const completionVerified = event.event_type === 'task_completed' &&
      completed?.task_id === event.task_id && completed.owner_id === trusted.session_id && completed.status === 'completed';
    if (event.event_type === 'task_completed' && !completionVerified) {
      throw new BoundaryError(409, 'TASK_NOT_COMPLETED', '当前会话没有已核验完成的该任务');
    }
    if (trusted.active_task && (trusted.active_task.owner_id !== trusted.session_id ||
        trusted.active_task.status !== 'active' || !Object.hasOwn(taskTemplates, trusted.active_task.template_id))) {
      throw new BoundaryError(500, 'INVALID_TRUSTED_CONTEXT', '服务端任务归属不一致');
    }
    const policy = suggestionPolicy({ eventType: event.event_type,
      proactiveEnabled: event.preferences.proactive && trusted.preferences.proactive,
      activeTask: trusted.active_task, rejectedUntilMs: trusted.rejected_until_ms ?? 0,
      lastSuggestedAtMs: trusted.last_suggested_at_ms ?? null, nowMs: trusted.now_ms,
      availableTemplates: trusted.available_templates });
    if (typeof agent !== 'function') {
      throw new BoundaryError(503, 'PLATFORM_NOT_CONFIGURED', '尚未配置经过验证的南开 GeniOS 连接');
    }
    // Only send necessary context. In particular, no session token or owner ID.
    // A missing task card alone does not prevent a verbal invitation. Describe the trusted reason explicitly.
    const replyRules = {
      proactive_disabled: '用户已关闭主动建议。本次只是场景进入，只简短问候或安静陪伴；不要提学习、专注、25分钟、小目标或开始任务，也不要邀请用户选择任务。',
      recent_rejection: '用户近期已拒绝任务。只回应明确聊天内容，不再口头推荐或邀请专注、小目标、开始任务；切换场景也不能重新提任务。',
      cooldown: '处于建议冷却期。回应本轮明确需要，不重复口头推荐或邀请新任务。',
      active_task: '已有真实进行中的任务。只回应用户需要或现有任务状态，不口头邀请开始另一任务。',
      completion_feedback: '只反馈已核验的完成状态，不主动邀请开始下一任务。'
    };
    const context = { event, suggestion_policy: structuredClone({ ...policy,
      ...(replyRules[policy.reason] ? { reply_rule: replyRules[policy.reason] } : {}) }),
      active_task: trusted.active_task ? { template_id: trusted.active_task.template_id, status: 'active' } : null,
      completion_verified: completionVerified,
      retrieved_sources: structuredClone(trusted.retrieved_sources) };
    const controller = new AbortController();
    const timeoutError = new BoundaryError(504, 'PLATFORM_TIMEOUT', '智能体响应超时，可重试；已完成任务不受影响');
    let timer;
    let result;
    try {
      result = await Promise.race([
        Promise.resolve().then(() => agent(context, { signal: controller.signal })),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(timeoutError);
            controller.abort();
          }, timeoutMs);
        })
      ]);
    } catch (error) {
      if (error === timeoutError) throw error;
      throw new BoundaryError(502, 'PLATFORM_FAILURE', '智能体暂时不可用，请稍后重试');
    } finally { clearTimeout(timer); }
    return validateAgentOutput(result, { allowedTemplates: policy.available_task_templates,
      retrievedSources: trusted.retrieved_sources, completionVerified });
  };
}
