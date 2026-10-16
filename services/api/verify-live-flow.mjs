import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

// Authorized synthetic checks through the web proxy and real model. Never advances the server clock.
const base = 'http://127.0.0.1:5173';
const checkpointPath = 'data/private/genios-live-flow-session.json';
const evidencePath = 'agent/evidence/genios-live-flow-2026-10-16.json';
const finish = process.argv.slice(2).join(' ') === '--complete';
const preferencesOnly = process.argv.slice(2).join(' ') === '--preferences';
if (process.argv.length > 2 && !finish && !preferencesOnly)
  throw new Error('Usage: node services/api/verify-live-flow.mjs [--complete|--preferences]');
execFileSync('git', ['check-ignore', '-q', checkpointPath], { stdio: 'ignore' });

let evidence = { checked_at: new Date().toISOString(), app_id: 'db8qfm54shhbpg924dpg',
  endpoint: base, synthetic_inputs: true, user_trial: false, clock: 'real_server_clock',
  full_flow_complete: false, checks: [] };
let checkpoint;
const save = () => writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, checked_at: new Date().toISOString(), ...details });
  save();
  console.log(JSON.stringify({ check: name, passed }));
  if (!passed) throw new Error(`CHECK_FAILED: ${name}`);
}
async function request(path, { cookie, body, key, status = 200 } = {}) {
  const started = performance.now();
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(key ? { 'Idempotency-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const value = await response.json();
  if (response.status !== status) throw new Error(`HTTP_${response.status}: ${value.error?.code ?? 'UNEXPECTED_STATUS'}`);
  return { value, elapsed_ms: Math.round(performance.now() - started), headers: response.headers };
}
async function session() {
  const { headers } = await request('/api/v1/sessions', { body: {}, status: 201 });
  const cookie = headers.get('set-cookie')?.split(';')[0];
  if (!/^campus_session=[a-f0-9]{64}$/.test(cookie ?? '')) throw new Error('SESSION_COOKIE_MISSING');
  return cookie;
}
function event(message, proactive = true, type = 'chat', taskId) {
  return { schema_version: '0.1', event_id: randomUUID(), event_type: type, user_message: message,
    scene: 'library', preferences: { proactive, remember: false }, ...(taskId ? { task_id: taskId } : {}) };
}
async function chat(cookie, payload, key = randomUUID()) {
  return request('/api/v1/companion/events', { cookie, body: payload, key });
}

try {
  if (finish || preferencesOnly) {
    if (!existsSync(checkpointPath) || !existsSync(evidencePath)) throw new Error('NO_SYNTHETIC_TASK_CHECKPOINT');
    evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  } else if (existsSync(checkpointPath)) {
    console.error('CHECKPOINT_EXISTS_USE_COMPLETE');
    process.exit(1);
  }
  const health = (await request('/health')).value;
  check('live_web_proxy_ready', health.mode === 'live' && health.agent_configured === true && health.task_service === true);
  if (preferencesOnly) {
    const cookie = await session();
    await request('/api/v1/preferences', { cookie, body: { proactive: false, remember: false }, key: randomUUID() });
    const quiet = await chat(cookie, event('', false, 'scene_enter'));
    check('quiet_reply_after_behavior_fix', quiet.value.mode === 'live' && quiet.value.suggestion === null &&
      !/陪你开始|开始.{0,8}(?:专注|任务)|25\s*分钟|小目标/u.test(quiet.value.reply),
    { output: quiet.value, elapsed_ms: quiet.elapsed_ms,
      review_scope: 'Checks only these synthetic phrases; not a universal semantic guarantee.' });
  } else if (finish) {
    checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
    if (checkpoint.base !== base || !/^campus_session=[a-f0-9]{64}$/.test(checkpoint.cookie) ||
        !/^[a-f0-9-]{36}$/.test(checkpoint.task_id)) throw new Error('INVALID_CHECKPOINT');
    const state = (await request(`/api/v1/tasks/${checkpoint.task_id}`, { cookie: checkpoint.cookie })).value;
    const remaining = Date.parse(state.task.ends_at) - Date.parse(state.server_time);
    if (remaining > 0) {
      evidence.pending_until = state.task.ends_at;
      save();
      console.log(JSON.stringify({ waiting_for_real_clock: true, remaining_seconds: Math.ceil(remaining / 1000), ends_at: state.task.ends_at }));
    } else {
      const complete = (await request(`/api/v1/tasks/${checkpoint.task_id}/complete`, {
        cookie: checkpoint.cookie, body: {}, key: checkpoint.completion_key })).value;
      evidence.task = complete.task;
      check('real_clock_completion', complete.task.status === 'completed' && complete.receipt.points_awarded === 0,
        { task: complete.task, elapsed_seconds: (Date.parse(complete.task.completed_at) - Date.parse(complete.task.started_at)) / 1000 });
      const repeated = (await request(`/api/v1/tasks/${checkpoint.task_id}/complete`, {
        cookie: checkpoint.cookie, body: {}, key: checkpoint.completion_key })).value;
      check('completion_retry_same_task', repeated.task.task_id === complete.task.task_id &&
        repeated.task.completed_at === complete.task.completed_at && repeated.receipt.points_awarded === 0);
      const reply = await chat(checkpoint.cookie, checkpoint.feedback_event, checkpoint.feedback_key);
      check('real_model_completion_feedback', reply.value.mode === 'live' && reply.value.strategy === 'feedback' && reply.value.suggestion === null,
        { output: reply.value, elapsed_ms: reply.elapsed_ms });
      const restored = (await request('/api/v1/session', { cookie: checkpoint.cookie })).value;
      check('completed_state_restored', restored.active_task === null && restored.last_completed_task?.task_id === checkpoint.task_id);
      evidence.full_flow_complete = true;
      delete evidence.last_error;
      evidence.completed_at = new Date().toISOString();
      delete evidence.pending_until;
      save();
    }
  } else {
    const cookie = await session();
    const focus = await chat(cookie, event('我想专心读一会儿书，能给我一个可选的小目标吗？'));
    check('real_model_focus_suggestion', focus.value.mode === 'live' && focus.value.strategy === 'focus' &&
      focus.value.suggestion?.task_template_id === 'focus_25' && focus.value.suggestion.duration_seconds === 1500,
    { output: focus.value, elapsed_ms: focus.elapsed_ms });
    const acceptBody = { suggestion_id: focus.value.suggestion.suggestion_id };
    const acceptKey = randomUUID();
    const accepted = (await request('/api/v1/tasks/accept', { cookie, body: acceptBody, key: acceptKey })).value;
    check('accept_creates_active_task', accepted.mode === 'live' && accepted.task.status === 'active' && accepted.task.duration_seconds === 1500,
      { task: accepted.task });
    checkpoint = { base, cookie, task_id: accepted.task.task_id, completion_key: randomUUID(), feedback_key: randomUUID(),
      feedback_event: event('合成技术验证：服务端已确认这轮任务完成，请回应已核验的完成状态。', true, 'task_completed', accepted.task.task_id) };
    writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2), { mode: 0o600 });
    evidence.task = accepted.task;
    evidence.pending_until = accepted.task.ends_at;
    save();
    const again = (await request('/api/v1/tasks/accept', { cookie, body: acceptBody, key: acceptKey })).value;
    const againNewKey = (await request('/api/v1/tasks/accept', { cookie, body: acceptBody, key: randomUUID() })).value;
    check('repeated_accept_same_task', again.task.task_id === accepted.task.task_id && againNewKey.task.task_id === accepted.task.task_id);
    const restored = (await request('/api/v1/sessions', { cookie, body: {} })).value;
    check('session_restores_active_task', restored.active_task?.task_id === accepted.task.task_id && restored.preferences.remember === false);
    const early = (await request(`/api/v1/tasks/${accepted.task.task_id}/complete`, { cookie, body: {}, key: randomUUID(), status: 409 })).value;
    check('early_completion_rejected', early.error?.code === 'TASK_TOO_EARLY', { http_status: 409, error_code: early.error?.code });
    const otherCookie = await session();
    const blocked = (await request(`/api/v1/tasks/${accepted.task.task_id}`, { cookie: otherCookie, status: 404 })).value;
    check('other_session_cannot_read_task', blocked.error?.code === 'TASK_NOT_FOUND', { http_status: 404 });
    const refusal = await chat(otherCookie, event('我只想聊天，不要给我任务。'));
    check('real_model_respects_refusal', refusal.value.mode === 'live' && refusal.value.strategy === 'listen' && refusal.value.suggestion === null,
      { output: refusal.value, elapsed_ms: refusal.elapsed_ms });
    const preferences = (await request('/api/v1/preferences', { cookie: otherCookie, body: { proactive: false, remember: false }, key: randomUUID() })).value;
    const preferenceState = (await request('/api/v1/session', { cookie: otherCookie })).value;
    check('proactive_preference_persists', preferences.preferences.proactive === false && preferenceState.preferences.proactive === false);
    const quiet = await chat(otherCookie, event('', false, 'scene_enter'));
    check('real_scene_enter_without_suggestion', quiet.value.mode === 'live' && quiet.value.suggestion === null,
      { output: quiet.value, elapsed_ms: quiet.elapsed_ms });
    console.log(JSON.stringify({ initial_checks_passed: true, full_flow_complete: false, ends_at: accepted.task.ends_at }));
  }
} catch (error) {
  // No request headers, response headers, cookie or configuration contents in public evidence/errors.
  evidence.last_error = /^HTTP_\d+: [A-Z_]+$|^CHECK_FAILED: [a-z_]+$|^[A-Z_]+$/.test(error.message)
    ? error.message : 'LIVE_FLOW_REQUEST_FAILED';
  save();
  console.error(evidence.last_error);
  process.exitCode = 1;
}
