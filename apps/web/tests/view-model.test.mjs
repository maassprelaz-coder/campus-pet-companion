import test from 'node:test';
import assert from 'node:assert/strict';
import * as view from '../lib/view-model.mjs';

const suggestion = { suggestion_id: 's1', task_template_id: 'focus_25', title: '专注 25 分钟', duration_seconds: 1500 };

test('模式徽标与说明区分模拟、真实与未连接', () => {
  assert.deepEqual(view.modeBadge('mock'), { mode: 'mock', text: '模拟 mock' });
  assert.deepEqual(view.modeBadge('live'), { mode: 'live', text: '真实 live' });
  assert.deepEqual(view.modeBadge(undefined), { mode: 'unknown', text: '未连接' });
  assert.match(view.modeNotice('mock'), /不能当作真实平台效果/);
  assert.match(view.modeNotice('live'), /真实服务/);
  assert.match(view.modeNotice('unknown'), /尚未连接/);
});

test('动作、场景、策略都能翻译且不吞掉未知值', () => {
  assert.equal(view.petActionLabel('happy'), '开心');
  assert.match(view.petActionLabel('dance'), /未识别动作（dance）/);
  assert.equal(view.sceneLabel('library'), '图书馆');
  assert.equal(view.strategyLabel('feedback'), '完成反馈');
});

test('时长按契约秒数显示', () => {
  assert.equal(view.durationText(1500), '25 分钟');
  assert.equal(view.durationText(120), '2 分钟');
  assert.equal(view.durationText(90), '1.5 分钟');
  assert.equal(view.durationText(45), '45 秒');
  assert.equal(view.durationText(0), '时长未提供');
  assert.equal(view.durationText(null), '时长未提供');
});

test('消息校验拦住空消息与超长消息', () => {
  assert.equal(view.validateMessage('').ok, false);
  assert.equal(view.validateMessage('   ').ok, false);
  assert.match(view.validateMessage('').error, /空消息/);
  assert.equal(view.validateMessage('你好').ok, true);
  assert.equal(view.validateMessage('x'.repeat(2001)).ok, false);
  assert.equal(view.validateMessage('x'.repeat(2000)).ok, true);
});

test('建议卡片在等待与已决定时禁用按钮', () => {
  const waiting = view.suggestionView(suggestion, { pending: true });
  assert.equal(waiting.acceptDisabled, true);
  assert.equal(waiting.rejectDisabled, true);
  assert.equal(waiting.durationText, '25 分钟');
  assert.equal(waiting.templateLabel, '专注 25 分钟');

  const accepted = view.suggestionView(suggestion, { decision: 'accepted' });
  assert.equal(accepted.acceptDisabled, true);
  assert.match(accepted.note, /不会自己加积分/);

  const rejected = view.suggestionView(suggestion, { decision: 'rejected' });
  assert.equal(rejected.rejectDisabled, true);
  assert.match(rejected.note, /没有发送任何请求/);

  assert.equal(view.suggestionView(null), null);
});

test('没有建议时按主动建议开关给出不同说明', () => {
  assert.match(view.emptySuggestionNote({ proactive: true }), /不会自行编造任务/);
  assert.match(view.emptySuggestionNote({ proactive: false }), /主动建议已关闭/);
});

test('任务视图只按服务端状态判断能否完成', () => {
  const active = view.taskView({ task_id: 't1', template_id: 'focus_25', status: 'active', duration_seconds: 1500 });
  assert.equal(active.statusLabel, '进行中');
  assert.equal(active.canComplete, true);

  const completed = view.taskView({ task_id: 't1', status: 'completed' });
  assert.equal(completed.statusLabel, '已完成');
  assert.equal(completed.canComplete, false);

  const weird = view.taskView({ task_id: 't1', status: 'cancelled' });
  assert.equal(weird.status, 'unknown');
  assert.equal(weird.canComplete, false);
  assert.equal(view.taskView(null), null);
});

test('积分只按服务端 receipt 显示，mock 明确标注不计入成效', () => {
  const mock = view.pointsNotice({ points_awarded: 0, already_completed: false }, 'mock');
  assert.equal(mock.simulated, true);
  assert.match(mock.text, /不计入成效统计/);

  const repeat = view.pointsNotice({ points_awarded: 0, already_completed: true }, 'live');
  assert.equal(repeat.simulated, false);
  assert.match(repeat.text, /未重复结算/);
});

test('错误提示区分需重建会话、可重试与不可重试', () => {
  const unauth = view.formatError(Object.assign(new Error('先建立本地模拟会话'), { code: 'NO_DEMO_SESSION', requiresNewSession: true }));
  assert.equal(unauth.action, 'reconnect');
  assert.match(unauth.detail, /NO_DEMO_SESSION/);

  const retryable = view.formatError(Object.assign(new Error('平台暂时失败'), { code: 'PLATFORM_FAILED', retriable: true }));
  assert.equal(retryable.action, 'retry');

  const fatal = view.formatError(Object.assign(new Error('请求不符合接口 v0.1'), { code: 'INVALID_EVENT' }));
  assert.equal(fatal.action, 'none');

  assert.equal(view.formatError('裸字符串').action, 'none');
});

test('未连接时发送被锁住，等待时也锁住', () => {
  assert.equal(view.sendLocked({ pending: false, mode: 'unknown' }), true);
  assert.equal(view.sendLocked({ pending: true, mode: 'mock' }), true);
  assert.equal(view.sendLocked({ pending: false, mode: 'mock' }), false);
  assert.equal(view.sendLocked({ pending: false, mode: 'live' }), false);
});

test('连接失败有独立徽标与可见文案（回归：点了没反应）', () => {
  assert.deepEqual(view.modeBadge('error'), { mode: 'error', text: '连接失败' });
  assert.match(view.modeNotice('error'), /连接失败/);
  assert.match(view.modeNotice('error'), /npm run mock/);
});

test('连接状态行只在真连上时显示已连接，失败必须带原因与下一步', () => {
  const idle = view.connectStatusView({ status: 'idle', baseUrl: 'http://127.0.0.1:8787' });
  assert.equal(idle.tone, 'muted');
  assert.match(idle.text, /http:\/\/127\.0\.0\.1:8787/);

  const pending = view.connectStatusView({ status: 'pending', baseUrl: 'http://127.0.0.1:8787' });
  assert.equal(pending.tone, 'warn');
  assert.match(pending.text, /正在连接/);

  const ok = view.connectStatusView({ status: 'ok', baseUrl: 'http://127.0.0.1:8787', hasSession: true });
  assert.equal(ok.tone, 'ok');
  assert.match(ok.text, /已连接/);
  assert.match(ok.text, /已建立/);

  const failed = view.connectStatusView({
    status: 'failed',
    baseUrl: 'http://127.0.0.1:8787',
    error: { code: 'NETWORK_ERROR', detail: '[NETWORK_ERROR] 服务没有响应' },
  });
  assert.equal(failed.tone, 'err');
  assert.match(failed.text, /NETWORK_ERROR/);
  assert.match(failed.text, /npm run mock/);
  assert.match(failed.text, /第 8 节/);

  // 没有错误对象时也不能出现空白状态行。
  assert.equal(view.connectStatusView({ status: 'failed' }).tone, 'err');
  assert.ok(view.connectStatusView({ status: 'failed' }).text.length > 10);
});

test('宠物形象白名单：4 只形象 × 7 个动作都能取到贴图，白名单外不猜', () => {
  assert.deepEqual(Object.keys(view.PET_KIND_LABELS), ['dog', 'turtle', 'cat', 'sheep']);
  assert.equal(view.DEFAULT_PET_KIND, 'dog');
  assert.equal(view.petAssetFile('idle', 'sheep'), 'pet-sheep-idle.webp');
  assert.equal(view.petAssetFile('roll', 'turtle'), 'pet-turtle-roll.webp');
  assert.equal(view.petAssetFile('idle'), 'pet-dog-idle.webp', '不传形象时默认小狗');
  assert.equal(view.knownPetKind('cat'), 'cat');
  assert.equal(view.knownPetKind(''), null);
  assert.equal(view.knownPetKind(null), null);
  assert.equal(view.knownPetKind('__proto__'), null);
  assert.equal(view.petKindLabel('dog'), '小狗');
  assert.match(view.petKindLabel('dragon'), /未识别形象/);
});

test('失败与等待时发送都被锁住', () => {
  assert.equal(view.sendLocked({ pending: false, mode: 'error' }), true);
  assert.equal(view.sendLocked({ pending: false, mode: 'pending' }), true);
});

