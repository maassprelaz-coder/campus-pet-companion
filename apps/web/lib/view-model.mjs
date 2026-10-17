// 纯展示逻辑（B 主责）：把服务响应和本地状态翻译成页面文案与按钮可用性。
// 这里不碰 DOM、不发请求，方便用 node:test 单测。
import { MAX_MESSAGE_LENGTH } from './api.mjs';

export const MODE_LABELS = Object.freeze({
  mock: '模拟 mock',
  live: '真实 live',
  error: '连接失败',
  unknown: '未连接',
});

export const SCENE_LABELS = Object.freeze({
  dorm: '宿舍',
  library: '图书馆',
  sports: '操场',
  canteen: '食堂',
});

export const PET_ACTION_LABELS = Object.freeze({
  idle: '待机',
  happy: '开心',
  think: '思考',
  sleep: '睡觉',
  eat: '吃东西',
  roll: '打滚',
  sad: '难过',
});

// 宠物形象（旧原型素材库共 4 只，动作与画风一致；2026-10-16 全部接入，见 DECISIONS 第 25 条）。
export const PET_KIND_LABELS = Object.freeze({
  dog: '小狗',
  turtle: '小龟',
  cat: '猫咪',
  sheep: '小羊',
});

export const DEFAULT_PET_KIND = 'dog';

// 动作 × 形象 → 网页贴图文件名（旧原型 4 只宠物素材，本项目转码为动画 WebP）。
// 两个白名单（形象 / 动作）都命中才返回文件名，否则返回 null，页面就只用文字，不猜路径、不拼字符串。
export const PET_ASSET_FILES = Object.freeze(Object.fromEntries(
  Object.entries(PET_KIND_LABELS).flatMap(([kind]) => Object.keys(PET_ACTION_LABELS)
    .map(action => [`${kind}.${action}`, `pet-${kind}-${action}.webp`])),
));

export const STRATEGY_LABELS = Object.freeze({
  listen: '倾听',
  focus: '专注任务',
  relax: '放松任务',
  clarify: '澄清',
  feedback: '完成反馈',
  support: '支持',
});

export const TASK_STATUS_LABELS = Object.freeze({
  active: '进行中',
  completed: '已完成',
  unknown: '未知状态',
});

export const TASK_TEMPLATE_LABELS = Object.freeze({
  focus_25: '专注 25 分钟',
  relax_2: '放松 2 分钟',
});

export function modeBadge(mode) {
  const key = MODE_LABELS[mode] ? mode : 'unknown';
  return { mode: key, text: MODE_LABELS[key] };
}

export function modeNotice(mode) {
  if (mode === 'mock') {
    return '当前回复来自本地模拟服务（mock）：只能用于联调，不能当作真实平台效果、试点成效或录制素材。';
  }
  if (mode === 'live') {
    return '当前回复来自真实服务：材料与成效统计只能使用这一模式下的记录。';
  }
  if (mode === 'error') {
    return '连接失败：服务没有响应。请先在本机运行 npm run mock（127.0.0.1:8787），再点“连接服务”重试；详细错误与重试按钮在第 8 节。';
  }
  return '尚未连接到服务：请先启动服务并点击“连接服务”。';
}

// 连接状态可见性（B 缺陷修复 2026-10-16）：
// 之前连接失败只写第 8 节，顶部与按钮附近没有任何变化，用户点击后以为“没反应”。
// 现在按钮正下方的状态行会明确显示失败原因和下一步操作。
export function connectStatusView({ status = 'idle', baseUrl = '', hasSession = false, error = null } = {}) {
  if (status === 'pending') return { text: `正在连接 ${baseUrl} …`, tone: 'warn' };
  if (status === 'ok') {
    return { text: `已连接 ${baseUrl}（本地会话${hasSession ? '已建立' : '未建立'}）`, tone: 'ok' };
  }
  if (status === 'failed') {
    const detail = error?.detail ?? error?.message ?? '服务没有响应';
    return {
      text: `连接失败：${detail}｜请确认已运行 npm run mock（127.0.0.1:8787）或改上面的服务地址，然后重新点“连接服务”。详细错误与重试按钮在第 8 节。`,
      tone: 'err',
    };
  }
  return { text: `服务地址：${baseUrl}｜本地会话：${hasSession ? '已建立' : '未建立'}`, tone: 'muted' };
}

export function petActionLabel(action) {
  return PET_ACTION_LABELS[action] ?? `未识别动作（${action ?? '空'}）`;
}

export function petKindLabel(kind) {
  return PET_KIND_LABELS[kind] ?? `未识别形象（${kind ?? '空'}）`;
}

// 形象白名单守卫：本地存储里可能留着旧值或被手改过，页面只用白名单内的形象，其余回落到默认。
export function knownPetKind(kind) {
  return typeof kind === 'string' && Object.hasOwn(PET_KIND_LABELS, kind) ? kind : null;
}

// kind 缺省为小狗（历史调用点不传形象时行为不变）。
export function petAssetFile(action, kind = DEFAULT_PET_KIND) {
  const resolved = knownPetKind(kind);
  if (!resolved || typeof action !== 'string') return null;
  const key = `${resolved}.${action}`;
  return Object.hasOwn(PET_ASSET_FILES, key) ? PET_ASSET_FILES[key] : null;
}

// 场景白名单守卫（地图地标等入口用）：只认契约允许的场景，其余返回 null，页面就不发请求。
export function knownScene(scene) {
  return typeof scene === 'string' && Object.hasOwn(SCENE_LABELS, scene) ? scene : null;
}

export function sceneLabel(scene) {
  return SCENE_LABELS[scene] ?? `未识别场景（${scene ?? '空'}）`;
}

export function strategyLabel(strategy) {
  return STRATEGY_LABELS[strategy] ?? `未识别策略（${strategy ?? '空'}）`;
}

export function durationText(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '时长未提供';
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = seconds / 60;
  return Number.isInteger(minutes) ? `${minutes} 分钟` : `${minutes.toFixed(1)} 分钟`;
}

export function validateMessage(text) {
  const value = typeof text === 'string' ? text : '';
  if (value.trim().length === 0) return { ok: false, value, error: '请输入内容再发送（空消息不会发给服务）' };
  if (value.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, value, error: `已超过 ${MAX_MESSAGE_LENGTH} 字上限，请缩短后再发送` };
  }
  return { ok: true, value, error: null };
}

// suggestion 为 null 时不显示卡片；decision 为 pending/accepted/rejected。
export function suggestionView(suggestion, { pending = false, decision = 'pending' } = {}) {
  if (!suggestion) return null;
  const decided = decision !== 'pending';
  let note = '接受后才会创建任务；拒绝不会创建任务，也不会扣分。';
  if (decision === 'accepted') note = '已接受：任务已创建，积分由服务端规则结算，页面不会自己加积分。';
  if (decision === 'rejected') note = '已拒绝：本页没有发送任何请求，也没有创建任务，之后不会再催。';
  return {
    suggestionId: suggestion.suggestion_id,
    templateId: suggestion.task_template_id,
    templateLabel: TASK_TEMPLATE_LABELS[suggestion.task_template_id] ?? suggestion.task_template_id,
    title: suggestion.title,
    durationText: durationText(suggestion.duration_seconds),
    acceptDisabled: pending || decided,
    rejectDisabled: pending || decided,
    note,
  };
}

export function emptySuggestionNote({ proactive }) {
  return proactive
    ? '这次没有建议：可以直接继续聊天，页面不会自行编造任务。'
    : '主动建议已关闭：服务端本次不会给建议，你仍然可以自己聊天或进入场景。';
}

export function taskView(task) {
  if (!task) return null;
  const status = task.status === 'active' || task.status === 'completed' ? task.status : 'unknown';
  return {
    taskId: task.task_id,
    templateId: task.template_id ?? null,
    templateLabel: TASK_TEMPLATE_LABELS[task.template_id] ?? null,
    status,
    statusLabel: TASK_STATUS_LABELS[status],
    startedAt: task.started_at ?? null,
    durationText: durationText(task.duration_seconds),
    canComplete: status === 'active',
    isCompleted: status === 'completed',
  };
}

export function pointsNotice(receipt, mode) {
  const points = Number.isFinite(receipt?.points_awarded) ? receipt.points_awarded : null;
  const already = receipt?.already_completed === true;
  if (mode === 'mock') {
    return {
      simulated: true,
      text: `${already ? '重复完成请求：' : ''}模拟完成，本次积分 ${points ?? 0}。mock 不校验时长、固定不加分，不计入成效统计。`,
    };
  }
  return {
    simulated: false,
    text: `${already ? '该任务此前已完成，未重复结算：' : ''}本次积分 ${points ?? 0}（由服务端规则结算）。`,
  };
}

export function formatError(error) {
  if (error instanceof Error) {
    const code = error.code ?? 'CLIENT_ERROR';
    const detail = error.message ?? String(error);
    const retriable = Boolean(error.retriable);
    const requiresNewSession = Boolean(error.requiresNewSession);
    return {
      title: requiresNewSession ? '需要重新连接会话' : retriable ? '请求失败，可以重试' : '请求被拒绝或不支持',
      detail: `[${code}] ${detail}`,
      retriable,
      requiresNewSession,
      action: requiresNewSession ? 'reconnect' : retriable ? 'retry' : 'none',
    };
  }
  return {
    title: '未知问题',
    detail: String(error ?? '没有更多信息'),
    retriable: false,
    requiresNewSession: false,
    action: 'none',
  };
}

export function sendLocked({ pending, mode }) {
  if (pending) return true;
  return mode === 'unknown' || mode === 'error' || mode === 'pending';
}
