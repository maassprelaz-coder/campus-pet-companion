// 页面控制器（B 主责）。
// 只负责界面状态与调用顺序；安全规则、字段校验、幂等键都在 lib/ 内，且可单测。
// 用户与模型的文本一律用 textContent 渲染，绝不拼 HTML。
import {
  CompanionClient,
  DEFAULT_BASE_URL,
  ValidationError,
  buildEvent,
  newEventId,
  summarizeResponse,
  serviceBaseUrlForPage,
} from './lib/api.mjs';
import * as view from './lib/view-model.mjs';

const BUILD_ID = 'web-0.1.2-domain';
const BASE_URL_KEY = 'campus-pet-web-base-url';
const PROACTIVE_KEY = 'campus-pet-web-proactive';
const TASK_KEY = 'campus-pet-web-task-id';

const state = {
  baseUrl: DEFAULT_BASE_URL,
  mode: 'unknown',
  scene: 'dorm',
  proactive: true,
  remember: false,
  agentConfigured: null,
  serverTime: null,
  clockObservedAt: 0,
  pending: false,
  suggestion: null,
  decision: 'pending',
  task: null,
  lastResponse: null,
  lastEvent: null,
  retry: null,
  permissions: { location: 'not_requested', camera: 'not_requested' },
};

const client = new CompanionClient({ baseUrl: state.baseUrl });

const el = id => document.getElementById(id);

function setText(node, text) {
  if (node) node.textContent = text;
}

function create(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function readStorage(store, key) {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeStorage(store, key, value) {
  try {
    if (!store) return;
    if (value === null || value === undefined) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    /* 存储不可用时页面照常工作，只是无法刷新恢复 */
  }
}

function logLine(text, tone = 'info') {
  const list = el('chat-log');
  if (!list) return;
  const item = create('li', `log-line log-${tone}`);
  item.appendChild(create('span', 'log-text', text));
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

function logMessage(role, text, meta) {
  const list = el('chat-log');
  if (!list) return;
  const item = create('li', `log-line log-${role}`);
  item.appendChild(create('span', 'log-role', role === 'user' ? '我' : '宠物'));
  item.appendChild(create('span', 'log-text', text));
  if (meta) item.appendChild(create('span', 'log-meta', meta));
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

// config.json 是本地可选文件（不入库）；读不到就用默认地址，不阻塞页面。
async function loadConfig() {
  try {
    const response = await fetch('./config.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const config = await response.json();
    return typeof config?.base_url === 'string' ? config.base_url : null;
  } catch {
    return null;
  }
}

function loadStoredPrefs() {
  const storedUrl = readStorage(window.localStorage, BASE_URL_KEY);
  if (storedUrl) state.baseUrl = storedUrl;
  const storedProactive = readStorage(window.localStorage, PROACTIVE_KEY);
  if (storedProactive === 'true') state.proactive = true;
  if (storedProactive === 'false') state.proactive = false;
}

function render() {
  renderConnection();
  renderControls();
  renderSuggestion();
  renderTask();
  renderEvidence();
  renderPermissions();
}

function renderConnection() {
  const badge = view.modeBadge(state.mode);
  const node = el('mode-badge');
  if (node) {
    node.textContent = badge.text;
    node.dataset.mode = badge.mode;
  }
  setText(el('mode-note'), view.modeNotice(state.mode));
  setText(el('health-text'), `服务地址：${state.baseUrl}｜本地会话：${client.hasSession ? '已建立' : '未建立'}`);
  if (state.agentConfigured === false) setText(el('mode-note'), '任务服务已连接，智能体暂未接通。聊天与新建议暂不可用，已开始的任务仍可查询和完成。');
  setText(el('build-badge'), `网页版本 ${BUILD_ID}`);
}

function renderControls() {
  if (el('scene-select')) el('scene-select').value = state.scene;
  if (el('proactive-checkbox')) el('proactive-checkbox').checked = state.proactive;
  if (el('proactive-checkbox')) el('proactive-checkbox').disabled = state.pending;
  if (el('connect-button')) el('connect-button').disabled = state.pending;
  if (el('health-button')) el('health-button').disabled = state.pending;
  setText(el('remember-state'), '记忆接口本轮关闭：本页固定发送 remember = false，不做长期记忆。');

  const hint = view.validateMessage(el('message-input')?.value ?? '');
  const hintText = state.mode === 'unknown'
    ? '服务未连接：请先点击“连接服务”，连接后即可发送（本页不会自动发送草稿）。'
    : hint.ok
      ? `已输入 ${hint.value.length}/2000 字，点“发送”才会发给服务（不会自动发送草稿）。`
      : hint.error;
  setText(el('send-hint'), hintText);
  if (el('send-button')) el('send-button').disabled = state.agentConfigured === false || view.sendLocked({ pending: state.pending, mode: state.mode });
  if (el('scene-button')) el('scene-button').disabled = state.pending || state.agentConfigured === false;
}

function renderSuggestion() {
  const region = el('suggestion-region');
  if (!region) return;
  region.replaceChildren();
  const card = view.suggestionView(state.suggestion, { pending: state.pending, decision: state.decision });

  if (!card) {
    region.appendChild(create('p', 'muted', state.lastResponse
      ? view.emptySuggestionNote({ proactive: state.proactive })
      : '还没有建议：先连接服务并发送一次输入。'));
    return;
  }

  region.appendChild(create('h3', null, `建议：${card.title}`));
  region.appendChild(create('p', 'muted', `模板 ${card.templateLabel}｜时长 ${card.durationText}`));
  const actions = create('div', 'button-row');
  const accept = create('button', 'primary', '接受并开始任务');
  accept.id = 'accept-button';
  accept.disabled = card.acceptDisabled;
  accept.addEventListener('click', () => acceptSuggestion());
  const reject = create('button', 'secondary', '拒绝这个建议');
  reject.id = 'reject-button';
  reject.disabled = card.rejectDisabled;
  reject.addEventListener('click', () => rejectSuggestion());
  actions.appendChild(accept);
  actions.appendChild(reject);
  region.appendChild(actions);
  region.appendChild(create('p', 'muted', card.note));
}

function currentTaskView() {
  return view.taskView(state.task, { serverTime: state.serverTime, elapsedMs: Math.max(0, performance.now() - state.clockObservedAt) });
}

function observeServerTime(payload) {
  if (typeof payload?.server_time === 'string') {
    state.serverTime = payload.server_time;
    state.clockObservedAt = performance.now();
  }
}

function updateCountdown() {
  const task = currentTaskView();
  const seconds = task?.remainingSeconds;
  setText(el('focus-countdown'), seconds === null || seconds === undefined ? '' :
    task.isCompleted ? '这次专注已完成。' : seconds > 0
      ? `还剩 ${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`
      : '专注时长已结束，可以确认完成。');
  if (el('complete-button')) el('complete-button').disabled = !task?.canComplete || state.pending;
}

function renderTask() {
  const region = el('task-region');
  if (!region) return;
  region.replaceChildren();
  const task = currentTaskView();
  if (!task) {
    region.appendChild(create('p', 'muted', '当前没有任务。接受建议后才会创建任务，页面不会自己新建。'));
    return;
  }
  region.appendChild(create('h3', null, `任务 ${task.statusLabel}`));
  const lines = [
    `任务标识：${task.taskId}`,
    task.templateLabel ? `模板：${task.templateLabel}` : null,
    `时长：${task.durationText}`,
    task.startedAt ? `开始时间（服务端）：${task.startedAt}` : null,
  ].filter(Boolean);
  for (const line of lines) region.appendChild(create('p', 'muted', line));

  const actions = create('div', 'button-row');
  const refresh = create('button', 'secondary', '按任务标识恢复状态');
  refresh.id = 'refresh-task-button';
  refresh.addEventListener('click', () => restoreTask(true));
  const complete = create('button', 'primary', '标记完成并取反馈');
  complete.id = 'complete-button';
  complete.disabled = !task.canComplete || state.pending;
  complete.addEventListener('click', () => completeTask());
  actions.appendChild(refresh);
  actions.appendChild(complete);
  region.appendChild(actions);
  const countdown = create('p', 'focus-countdown');
  countdown.id = 'focus-countdown';
  countdown.setAttribute('aria-live', 'off');
  region.appendChild(countdown);
  updateCountdown();
  region.appendChild(create('p', 'muted', '积分只按服务端返回的 receipt 显示；页面不自行加积分，也不接受客户端传入金额。'));
}

function renderEvidence() {
  const action = state.lastResponse?.pet_action ?? null;
  const stage = el('pet-stage');
  if (stage) stage.dataset.action = action ?? 'none';
  setText(el('pet-action-label'), `动作：${action ? view.petActionLabel(action) : '尚未收到服务响应'}`);
  setText(el('evidence-event'), state.lastEvent
    ? `事件：${state.lastEvent.event_type}｜event_id=${state.lastEvent.event_id}｜场景 ${view.sceneLabel(state.lastEvent.scene)}｜主动建议 ${state.lastEvent.preferences?.proactive ? '开' : '关'}｜字数 ${state.lastEvent.user_message.length}`
    : '事件：尚未发送。');
  const summary = state.lastResponse;
  setText(el('evidence-response'), summary
    ? `响应：mode=${summary.mode}｜request_id=${summary.request_id ?? '无'}｜策略 ${view.strategyLabel(summary.strategy)}｜动作 ${view.petActionLabel(summary.pet_action)}｜建议 ${summary.hasSuggestion ? '有' : '无'}｜来源 ${summary.sourceCount} 条`
    : '响应：尚未收到。');
  setText(el('evidence-build'), `构建：${BUILD_ID}｜接口草案：contracts v0.1｜本页不包含任何平台密钥，也不直连模型。`);
}

function renderPermissions() {
  const location = el('permission-location');
  const camera = el('permission-camera');
  const label = status => (status === 'denied' ? '已记录：拒绝授权' : '本轮不使用，未请求');
  if (location) location.textContent = `定位：${label(state.permissions.location)}`;
  if (camera) camera.textContent = `摄像头：${label(state.permissions.camera)}`;
  setText(el('permission-note'), '页面默认不请求定位与摄像头；即使拒绝授权，聊天、建议和任务照常可用。输入框内容只有在点“发送”时才会发给服务，不会自动发送草稿。');
}

function showError(error) {
  const region = el('error-region');
  if (!region) return;
  region.replaceChildren();
  const info = view.formatError(error);
  region.appendChild(create('p', 'error-title', info.title));
  region.appendChild(create('p', 'error-detail', info.detail));
  if (info.action !== 'none') {
    const actions = create('div', 'button-row');
    const retry = create('button', 'primary', info.action === 'reconnect' ? '重新连接会话' : '重试刚才的请求');
    retry.id = 'retry-button';
    retry.addEventListener('click', () => (info.action === 'reconnect' ? reconnect() : retryLast()));
    actions.appendChild(retry);
    region.appendChild(actions);
    region.appendChild(create('p', 'muted', '重试会复用同一个 event_id 与幂等键，服务端不会重复生效或重复加分。'));
  }
}

function clearError() {
  const region = el('error-region');
  if (region) region.replaceChildren();
}

// 统一执行入口：等待中禁止重复提交；401 时自动重建会话并原样重发（同 event_id / 同幂等键）。
async function dispatch(job) {
  state.pending = true;
  clearError();
  render();
  try {
    let payload;
    try {
      payload = await job.run();
    } catch (error) {
      if (error?.requiresNewSession) {
        logLine('本地会话失效或不存在，正在重建会话后重试同一次请求。', 'warn');
        await connectSession({ silent: true });
        payload = await job.run();
      } else {
        throw error;
      }
    }
    state.mode = typeof payload?.mode === 'string' ? payload.mode : state.mode;
    if (job.recordResponse !== false) state.lastResponse = summarizeResponse(payload);
    job.apply(payload);
    state.retry = null;
    return payload;
  } catch (error) {
    showError(error);
    state.retry = error?.retriable || error?.requiresNewSession ? job : null;
    return null;
  } finally {
    state.pending = false;
    render();
  }
}

async function connectSession({ silent = false } = {}) {
  const input = el('base-url-input');
  if (input && input.value.trim()) client.setBaseUrl(input.value);
  state.baseUrl = client.baseUrl;
  writeStorage(window.localStorage, BASE_URL_KEY, state.baseUrl);

  const health = await client.health();
  const session = await client.openSession();
  state.mode = typeof health?.mode === 'string' ? health.mode : state.mode;
  state.agentConfigured = typeof health?.agent_configured === 'boolean' ? health.agent_configured : null;
  if (client.useCookies) {
    state.task = session.active_task ?? session.last_completed_task ?? null;
    state.proactive = session.preferences.proactive;
    observeServerTime(session);
    writeStorage(window.sessionStorage, TASK_KEY, state.task?.task_id ?? null);
  }
  if (!silent) {
    logLine(`已连接 ${state.baseUrl}（mode=${state.mode}），本地会话已建立。`, 'ok');
  }
  return health;
}

async function reconnect() {
  return dispatch({ label: '重新连接会话', run: () => connectSession(), apply: () => {} });
}

function renderSources(sources) {
  const region = el('sources-region');
  if (!region) return;
  region.replaceChildren();
  const list = Array.isArray(sources) ? sources : [];
  if (list.length === 0) {
    region.appendChild(create('p', 'muted', '本次回复没有引用来源（sources 为空，页面不会编造链接）。'));
    return;
  }
  const ul = create('ul', 'source-list');
  for (const source of list) {
    const li = create('li');
    if (typeof source?.url === 'string' && source.url.startsWith('https://')) {
      const link = create('a', null, source.title ?? source.url);
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      li.appendChild(link);
    } else {
      li.appendChild(create('span', null, source?.title ?? '来源缺少可检查链接'));
    }
    li.appendChild(create('span', 'muted', `　核对日期 ${source?.verified_on ?? '未提供'}`));
    ul.appendChild(li);
  }
  region.appendChild(ul);
}

function applyResponse(payload) {
  const reply = typeof payload?.reply === 'string' && payload.reply.length > 0
    ? payload.reply
    : '（服务没有返回可读回复）';
  logMessage('pet', reply, `${view.strategyLabel(payload?.strategy)}｜动作 ${view.petActionLabel(payload?.pet_action)}｜mode=${payload?.mode ?? 'unknown'}`);
  state.suggestion = payload?.suggestion ?? null;
  state.decision = 'pending';
  renderSources(payload?.sources);
}

function sendChat() {
  const input = el('message-input');
  const validation = view.validateMessage(input?.value ?? '');
  if (!validation.ok) {
    logLine(validation.error, 'warn');
    render();
    return null;
  }
  let event;
  try {
    event = buildEvent({
      eventId: newEventId(),
      eventType: 'chat',
      scene: state.scene,
      userMessage: validation.value,
      proactive: state.proactive,
    });
  } catch (error) {
    showError(error);
    return null;
  }
  state.lastEvent = event;
  state.suggestion = null;
  state.decision = 'pending';
  logMessage('user', validation.value, `场景 ${view.sceneLabel(state.scene)}`);
  if (input) input.value = '';
  return dispatch({ label: '发送消息', run: () => client.sendEvent(event), apply: applyResponse });
}

function enterScene() {
  let event;
  try {
    event = buildEvent({
      eventId: newEventId(),
      eventType: 'scene_enter',
      scene: state.scene,
      userMessage: '',
      proactive: state.proactive,
    });
  } catch (error) {
    showError(error);
    return null;
  }
  state.lastEvent = event;
  state.suggestion = null;
  state.decision = 'pending';
  logLine(`进入场景：${view.sceneLabel(state.scene)}（主动建议${state.proactive ? '已开启，服务端可给建议' : '已关闭，服务端本次不给建议'}）。`);
  return dispatch({ label: '进入场景', run: () => client.sendEvent(event), apply: applyResponse });
}

function acceptSuggestion() {
  const suggestionId = state.suggestion?.suggestion_id;
  if (typeof suggestionId !== 'string' || suggestionId.length === 0) return null;
  return dispatch({
    label: '接受建议',
    recordResponse: false,
    run: async () => {
      const accepted = await client.acceptSuggestion(suggestionId);
      return client.useCookies ? client.getTask(accepted.task.task_id) : accepted;
    },
    apply: payload => {
      state.task = payload?.task ?? null;
      observeServerTime(payload);
      state.decision = 'accepted';
      writeStorage(window.sessionStorage, TASK_KEY, state.task?.task_id ?? null);
      const task = view.taskView(state.task);
      logLine(`已接受建议：服务端创建任务 ${task?.taskId ?? '（无标识）'}，状态 ${task?.statusLabel ?? '未知'}。`, 'ok');
    },
  });
}

// Cookie服务保存拒绝与抑制状态；旧mock继续只在页面拒绝。
function rejectSuggestion() {
  if (!state.suggestion) return;
  if (client.useCookies) {
    const id = state.suggestion.suggestion_id;
    return dispatch({ label: '拒绝建议', recordResponse: false, run: () => client.rejectSuggestion(id), apply: () => {
      state.decision = 'rejected';
      logLine('已拒绝该建议，暂时不再推荐新任务；没有创建任务或扣分。', 'ok');
    } });
  }
  state.decision = 'rejected';
  state.retry = null;
  logLine('已拒绝该建议：本页没有发送任何请求，也没有创建任务，不扣分，之后不会再催。', 'warn');
  render();
}

async function completeTask() {
  const taskId = state.task?.task_id;
  if (typeof taskId !== 'string' || taskId.length === 0) return null;

  const completed = await dispatch({
    label: '完成任务',
    recordResponse: false,
    retryRun: completeTask,
    run: () => client.completeTask(taskId),
    apply: payload => {
      state.task = payload?.task ?? state.task;
      observeServerTime(payload);
      writeStorage(window.sessionStorage, TASK_KEY, state.task?.task_id ?? null);
      const notice = view.pointsNotice(payload?.receipt, state.mode, { timerEnforced: client.useCookies });
      logLine(`任务状态：${view.taskView(state.task)?.statusLabel ?? '未知'}。${notice.text}`, notice.simulated ? 'warn' : 'ok');
      if (typeof payload?.warning === 'string') logLine(`服务提示：${payload.warning}`, 'warn');
    },
  });
  if (!completed) return null;

  let event;
  try {
    event = buildEvent({
      eventId: newEventId(),
      eventType: 'task_completed',
      scene: state.scene,
      userMessage: '',
      proactive: state.proactive,
      taskId,
    });
  } catch (error) {
    showError(error);
    return null;
  }
  state.lastEvent = event;
  return dispatch({ label: '取完成反馈', run: () => client.sendEvent(event), apply: applyResponse });
}

function restoreTask(announce = false) {
  const storedId = readStorage(window.sessionStorage, TASK_KEY);
  const taskId = state.task?.task_id ?? storedId;
  if (!taskId) {
    if (announce) logLine('本机没有可恢复的任务标识：刷新恢复只能恢复本机发起过的任务。', 'warn');
    render();
    return null;
  }
  return dispatch({
    label: '恢复任务状态',
    recordResponse: false,
    run: () => client.useCookies ? client.getSession() : client.getTask(taskId),
    apply: payload => {
      state.task = client.useCookies ? payload.active_task ?? payload.last_completed_task ?? null : payload?.task ?? null;
      observeServerTime(payload);
      writeStorage(window.sessionStorage, TASK_KEY, state.task?.task_id ?? null);
      const task = view.taskView(state.task);
      logLine(`已按任务标识恢复状态：${task?.taskId ?? '（无）'}｜${task?.statusLabel ?? '未知'}。`, 'ok');
    },
  });
}

function retryLast() {
  if (!state.retry) {
    logLine('没有可重试的请求。', 'warn');
    return null;
  }
  return state.retry.retryRun ? state.retry.retryRun() : dispatch(state.retry);
}

function recordPermissionDenied(scope) {
  state.permissions[scope] = 'denied';
  logLine(`已记录：拒绝${scope === 'location' ? '定位' : '摄像头'}授权。基础聊天、建议和任务仍然可用，页面不会再次请求，也不会自动发送草稿。`, 'warn');
  render();
}

function wireEvents() {
  el('connect-button')?.addEventListener('click', () => reconnect().then(() => restoreTask(false)));
  el('health-button')?.addEventListener('click', () => dispatch({
    label: '服务自检',
    recordResponse: false,
    run: () => client.health(),
    apply: payload => logLine(`自检：mode=${payload?.mode ?? 'unknown'}｜${payload?.message ?? '无附加说明'}`, 'ok'),
  }));
  el('base-url-input')?.addEventListener('change', () => {
    try {
      client.setBaseUrl(el('base-url-input').value);
      state.baseUrl = client.baseUrl;
      writeStorage(window.localStorage, BASE_URL_KEY, state.baseUrl);
      state.mode = 'unknown';
      state.agentConfigured = null;
      state.task = null;
      state.suggestion = null;
      state.serverTime = null;
      logLine(`服务地址改为 ${state.baseUrl}，请重新点“连接服务”。`, 'info');
    } catch (error) {
      showError(error);
    }
    render();
  });
  el('scene-select')?.addEventListener('change', event => {
    state.scene = event.target.value;
    render();
  });
  el('scene-button')?.addEventListener('click', () => enterScene());
  el('proactive-checkbox')?.addEventListener('change', event => {
    if (client.useCookies && client.hasSession) {
      const proactive = event.target.checked;
      const previous = state.proactive;
      state.proactive = proactive;
      const key = `preferences:${newEventId()}`;
      return dispatch({ label: '保存主动建议偏好', recordResponse: false, run: () => client.savePreferences(proactive, key), apply: payload => {
        state.proactive = payload.preferences.proactive;
        writeStorage(window.localStorage, PROACTIVE_KEY, String(state.proactive));
        if (!state.proactive) { state.suggestion = null; state.decision = 'rejected'; }
        logLine(`主动建议已${state.proactive ? '开启' : '关闭'}。`, 'ok');
      } }).then(payload => { if (!payload) { state.proactive = previous; render(); } });
    }
    state.proactive = event.target.checked;
    writeStorage(window.localStorage, PROACTIVE_KEY, String(state.proactive));
    logLine(`主动建议已${state.proactive ? '开启' : '关闭'}：进入场景时会把该设置作为 preferences.proactive 发给服务。`, 'info');
    render();
  });
  el('message-input')?.addEventListener('input', () => renderControls());
  el('message-input')?.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      sendChat();
    }
  });
  el('chat-form')?.addEventListener('submit', event => {
    event.preventDefault();
    sendChat();
  });
  el('permission-location-deny')?.addEventListener('click', () => recordPermissionDenied('location'));
  el('permission-camera-deny')?.addEventListener('click', () => recordPermissionDenied('camera'));
}

async function init() {
  const configUrl = await loadConfig();
  if (configUrl) state.baseUrl = configUrl;
  loadStoredPrefs();
  try {
    state.baseUrl = serviceBaseUrlForPage(window.location.href, state.baseUrl);
    client.setBaseUrl(state.baseUrl);
  } catch {
    state.baseUrl = DEFAULT_BASE_URL;
    client.setBaseUrl(DEFAULT_BASE_URL);
  }
  if (el('base-url-input')) el('base-url-input').value = state.baseUrl;
  wireEvents();
  render();
  logLine(state.baseUrl === window.location.origin && window.location.protocol === 'https:'
    ? '页面已就绪，正在连接校宠伴行服务。'
    : `页面已就绪（${BUILD_ID}）。本机联调请先启动服务，再点“连接服务”。`, 'info');
  try {
    await connectSession({ silent: true });
    await restoreTask(false);
  } catch (error) {
    showError(error);
    logLine(`自动连接失败：${error?.message ?? error}。可以先检查服务地址，再点“连接服务”重试。`, 'warn');
  }
  render();
}

init();

// Display only. This timer never sends input or decides whether the business task is complete.
setInterval(updateCountdown, 1000);
