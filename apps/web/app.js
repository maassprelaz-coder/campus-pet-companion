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
} from './lib/api.mjs';
import * as view from './lib/view-model.mjs';

const BUILD_ID = 'web-0.1.0';
const BASE_URL_KEY = 'campus-pet-web-base-url';
const PROACTIVE_KEY = 'campus-pet-web-proactive';
const TASK_KEY = 'campus-pet-web-task-id';
const PET_KIND_KEY = 'campus-pet-web-pet-kind';
// 宠物贴图目录：只放 apps/web 内的相对路径（dev-server 只服务 apps/web，且不引用外部 CDN）。
const PET_ASSET_BASE = './assets/pet-ui/';
// 只在“形象 + 动作”变化时换图，避免每帧重设 src 造成闪烁。
let lastPetAsset = null;

const state = {
  baseUrl: DEFAULT_BASE_URL,
  mode: 'unknown',
  scene: 'dorm',
  proactive: true,
  // 宠物形象：旧原型 4 只宠物共用同一套动作。petPreview 表示“用 idle 先占位”，
  // 默认开启：首页一打开就能看见自己的宠物（待机不等于服务返回的动作，标签会写明“默认”）。
  petKind: view.DEFAULT_PET_KIND,
  petPreview: true,
  remember: false,
  pending: false,
  suggestion: null,
  decision: 'pending',
  task: null,
  lastResponse: null,
  lastEvent: null,
  retry: null,
  permissions: { location: 'not_requested', camera: 'not_requested' },
  // 连接状态：idle / pending / ok / failed（失败必须可见，见 view.connectStatusView 注释）
  connect: { status: 'idle', error: null },
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
  // 形象同样从本地存储恢复，但只认白名单：存储里可能留着旧值或被手改过。
  const storedKind = view.knownPetKind(readStorage(window.localStorage, PET_KIND_KEY));
  if (storedKind) state.petKind = storedKind;
}

function render() {
  renderConnection();
  renderControls();
  renderSuggestion();
  renderTask();
  renderEvidence();
  renderPet();
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
  // 连接状态行就在“连接服务”按钮下面：失败原因必须在这里可见，不能只写第 8 节。
  const status = view.connectStatusView({
    status: state.connect.status,
    baseUrl: state.baseUrl,
    hasSession: Boolean(client.sessionId),
    error: state.connect.error,
  });
  const health = el('health-text');
  if (health) {
    health.textContent = status.text;
    health.dataset.tone = status.tone;
  }
  setText(el('build-badge'), `网页版本 ${BUILD_ID}`);
}

function renderControls() {
  if (el('scene-select')) el('scene-select').value = state.scene;
  if (el('pet-kind-select')) el('pet-kind-select').value = state.petKind;
  if (el('proactive-checkbox')) el('proactive-checkbox').checked = state.proactive;
  setText(el('remember-state'), '记忆接口本轮关闭：本页固定发送 remember = false，不做长期记忆。');

  const hint = view.validateMessage(el('message-input')?.value ?? '');
  const notConnected = state.mode !== 'mock' && state.mode !== 'live';
  const hintText = notConnected
    ? '服务未连接：请先点击“连接服务”，连接后即可发送（本页不会自动发送草稿）。'
    : hint.ok
      ? `已输入 ${hint.value.length}/2000 字，点“发送”才会发给服务（不会自动发送草稿）。`
      : hint.error;
  setText(el('send-hint'), hintText);
  if (el('send-button')) el('send-button').disabled = view.sendLocked({ pending: state.pending, mode: state.mode });
  if (el('scene-button')) el('scene-button').disabled = state.pending;
  for (const button of document.querySelectorAll('.map-hotspot')) button.disabled = state.pending;
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

function renderTask() {
  const region = el('task-region');
  if (!region) return;
  region.replaceChildren();
  const task = view.taskView(state.task);
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
  region.appendChild(create('p', 'muted', '积分只按服务端返回的 receipt 显示；页面不自行加积分，也不接受客户端传入金额。'));
}

function renderEvidence() {
  const action = state.lastResponse?.pet_action ?? null;
  const stage = el('pet-stage');
  if (stage) stage.dataset.action = action ?? 'none';
  setText(el('pet-action-label'), `动作：${action ? view.petActionLabel(action) : '待机（默认，尚未收到服务响应）'}`);
  setText(el('evidence-event'), state.lastEvent
    ? `事件：${state.lastEvent.event_type}｜event_id=${state.lastEvent.event_id}｜场景 ${view.sceneLabel(state.lastEvent.scene)}｜主动建议 ${state.lastEvent.preferences?.proactive ? '开' : '关'}｜字数 ${state.lastEvent.user_message.length}`
    : '事件：尚未发送。');
  const summary = state.lastResponse;
  setText(el('evidence-response'), summary
    ? `响应：mode=${summary.mode}｜request_id=${summary.request_id ?? '无'}｜策略 ${view.strategyLabel(summary.strategy)}｜动作 ${view.petActionLabel(summary.pet_action)}｜建议 ${summary.hasSuggestion ? '有' : '无'}｜来源 ${summary.sourceCount} 条`
    : '响应：尚未收到。');
  setText(el('evidence-build'), `构建：${BUILD_ID}｜接口草案：contracts v0.1｜本页不包含任何平台密钥，也不直连模型。`);
}

// 宠物贴图：按“形象 + 服务返回的动作”换图；加载失败只影响画面，不影响聊天、建议和任务。
function renderPet() {
  const image = el('pet-image');
  if (!image) return;
  const kind = state.petKind;
  // 还没收到服务响应时不当成服务动作：默认用 idle 占位（写明“默认”），用户换过形象也先看一眼 idle。
  const action = state.lastResponse?.pet_action ?? (state.petPreview ? 'idle' : null);
  const file = action ? view.petAssetFile(action, kind) : null;

  if (!file) {
    lastPetAsset = null;
    image.hidden = true;
    image.removeAttribute('src');
    setText(el('pet-asset-note'), action
      ? `动作“${action}”不在白名单内，本页不猜贴图，只用文字说明。`
      : '还没有贴图：收到服务响应后按动作显示，也可以在上面换一个形象先看预览。');
    return;
  }

  // 换图判重要带上形象：换形象时文件名会变，但只用文件名做 key 容易被后续改动踩坑。
  const assetKey = `${kind}/${file}`;
  if (lastPetAsset === assetKey) return;
  lastPetAsset = assetKey;
  image.hidden = true; // 等 load 再显示，避免半张图闪一下
  image.alt = `宠物动作示意：${view.petKindLabel(kind)}${view.petActionLabel(action)}（素材为旧原型转码）`;
  image.src = PET_ASSET_BASE + file;
  const preview = state.lastResponse?.pet_action ? '' : '，默认待机（服务还没返回动作）';
  setText(el('pet-asset-note'), `按动作显示贴图 ${file}（${view.petKindLabel(kind)}形象${preview}；旧原型素材转码，来源见 content/assets/pet-ui/source-register.csv）。`);
}

function wirePetAsset() {
  const image = el('pet-image');
  if (!image) return;
  image.addEventListener('load', () => { image.hidden = false; });
  image.addEventListener('error', () => {
    image.hidden = true;
    lastPetAsset = null;
    setText(el('pet-asset-note'), '贴图没有加载成功（本地缺文件或被拦截）：宠物区退回纯文字，聊天、建议和任务照常可用。');
  });
}

// 校园地图（B 级接入）：静态示意插画，只作氛围示意、非精确导航。
// 图片失败只收起图片并显示文字兜底；点地标 = 选中场景 + 复用已有 scene_enter 路径（契约零改动）。
function showCampusMap(loaded) {
  const image = el('campus-map');
  if (!image) return;
  image.hidden = !loaded;
  if (el('campus-map-fallback')) el('campus-map-fallback').hidden = loaded;
}

function wireCampusMap() {
  const image = el('campus-map');
  if (!image) return;
  image.addEventListener('load', () => showCampusMap(true));
  image.addEventListener('error', () => showCampusMap(false));
  // 监听器挂上之前就加载完（或已失败）的情况：此时不会再触发 load/error，直接按当前状态显示。
  if (image.complete) showCampusMap(image.naturalWidth > 0);

  for (const button of document.querySelectorAll('.map-hotspot')) {
    button.addEventListener('click', () => {
      const scene = view.knownScene(button.dataset.scene);
      if (!scene) {
        logLine(`地标“${button.dataset.scene ?? ''}”不在场景白名单内，本页不会发送请求。`, 'warn');
        return;
      }
      state.scene = scene;
      render();
      enterScene();
    });
  }
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
  state.connect = { status: 'pending', error: null };
  render();
  try {
    const input = el('base-url-input');
    if (input && input.value.trim()) client.setBaseUrl(input.value);
    state.baseUrl = client.baseUrl;
    writeStorage(window.localStorage, BASE_URL_KEY, state.baseUrl);

    const health = await client.health();
    await client.openSession();
    state.mode = typeof health?.mode === 'string' ? health.mode : state.mode;
    state.connect = { status: 'ok', error: null };
    if (!silent) {
      logLine(`已连接 ${state.baseUrl}（mode=${state.mode}），本地会话已建立。`, 'ok');
    }
    return health;
  } catch (error) {
    // 失败必须让用户看得见：顶部徽标变“连接失败”，按钮下面的状态行写清原因和下一步。
    state.mode = 'error';
    state.connect = { status: 'failed', error: view.formatError(error) };
    if (!silent) {
      logLine(`连接失败：${state.connect.error.detail}。请确认服务已启动（npm run mock，127.0.0.1:8787），或修改上面的服务地址后重试。`, 'warn');
    }
    throw error;
  }
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
    run: () => client.acceptSuggestion(suggestionId),
    apply: payload => {
      state.task = payload?.task ?? null;
      state.decision = 'accepted';
      writeStorage(window.sessionStorage, TASK_KEY, state.task?.task_id ?? null);
      const task = view.taskView(state.task);
      logLine(`已接受建议：服务端创建任务 ${task?.taskId ?? '（无标识）'}，状态 ${task?.statusLabel ?? '未知'}。`, 'ok');
    },
  });
}

// 拒绝不调用任何接口：不创建任务、不扣分、不再催。
function rejectSuggestion() {
  if (!state.suggestion) return;
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
    run: () => client.completeTask(taskId),
    apply: payload => {
      state.task = payload?.task ?? state.task;
      writeStorage(window.sessionStorage, TASK_KEY, state.task?.task_id ?? null);
      const notice = view.pointsNotice(payload?.receipt, state.mode);
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
    run: () => client.getTask(taskId),
    apply: payload => {
      state.task = payload?.task ?? null;
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
  return dispatch(state.retry);
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
      state.connect = { status: 'idle', error: null };
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
    state.proactive = event.target.checked;
    writeStorage(window.localStorage, PROACTIVE_KEY, String(state.proactive));
    logLine(`主动建议已${state.proactive ? '开启' : '关闭'}：进入场景时会把该设置作为 preferences.proactive 发给服务。`, 'info');
    render();
  });
  el('pet-kind-select')?.addEventListener('change', event => {
    // 形象只认白名单；白名单外的值（存储被手改或旧值）一律回落到默认小狗。
    state.petKind = view.knownPetKind(event.target.value) ?? view.DEFAULT_PET_KIND;
    state.petPreview = true;
    writeStorage(window.localStorage, PET_KIND_KEY, state.petKind);
    logLine(`宠物形象已切换为${view.petKindLabel(state.petKind)}：7 个动作贴图都来自旧原型素材库的同一套素材，切换只换图，不影响聊天、建议和任务。`, 'info');
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
  wirePetAsset();
  wireCampusMap();
}

async function init() {
  const configUrl = await loadConfig();
  if (configUrl) state.baseUrl = configUrl;
  loadStoredPrefs();
  try {
    client.setBaseUrl(state.baseUrl);
  } catch {
    state.baseUrl = DEFAULT_BASE_URL;
    client.setBaseUrl(DEFAULT_BASE_URL);
  }
  if (el('base-url-input')) el('base-url-input').value = state.baseUrl;
  wireEvents();
  render();
  logLine(`页面已就绪（${BUILD_ID}）。只用 contracts v0.1 草案接口；服务未启动时请先在本机运行 npm run mock（8787），再点“连接服务”。`, 'info');
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
