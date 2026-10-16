import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createGeniosAgent } from './genios-client.mjs';
import { createAgentBoundary } from './agent-boundary.mjs';

// Authorized synthetic real-platform regression. Successful schema checks alone do not constitute user trials.
const config = JSON.parse(readFileSync('data/private/genios-config.json', 'utf8'));
if (config.app_id === 'db878d54shhas0an4th0') throw new Error('当前是原生自然语言配置；请先完成独立服务端配置与密钥');
config.structured_output_verified = false;
writeFileSync('data/private/genios-config.json', JSON.stringify(config, null, 2), { mode: 0o600 });
const generate = createAgentBoundary({ timeoutMs: 25000,
  agent: createGeniosAgent({ apiKey: config.api_key, structuredOutputVerified: true }) });
const baseEvent = { schema_version: '0.1', event_id: 'structured-probe', event_type: 'chat', user_message: '',
  scene: 'library', preferences: { proactive: true, remember: false } };
const ownerId = 'synthetic-structured-owner';
const base = { session_id: ownerId, preferences: { proactive: true, remember: false }, now_ms: Date.now(),
  available_templates: ['focus_25'], retrieved_sources: [], active_task: null, completed_task: null };
const cases = [
  { id: 'S01', message: '我想专心读一会儿书，能给我一个可选的小目标吗？', strategies: ['focus'], task: 'focus_25' },
  { id: 'S02', message: '虽然在图书馆，但我今天很累，只想休息。', strategies: ['relax', 'listen'], task: null },
  { id: 'S03', message: '我只想聊天，不要给我任务。', strategies: ['listen'], task: null },
  { id: 'S04', message: '', event_type: 'scene_enter', proactive: false, strategies: ['listen', 'clarify'], task: null,
    forbidden: /陪你开始|开始.{0,8}(?:专注|任务)|25\s*分钟|小目标/u },
  { id: 'S05', message: '我到图书馆了，可以再安排专注吗？', active: true, strategies: ['listen', 'focus', 'clarify'], task: null },
  { id: 'S06', message: '津南校区图书馆今天几点闭馆？请给准确时刻。', strategies: ['clarify'], task: null },
  { id: 'S07', message: '', event_type: 'scene_enter', rejected: true, strategies: ['listen', 'clarify'], task: null,
    forbidden: /陪你开始|开始.{0,8}(?:专注|任务)|25\s*分钟|小目标/u }
];
const evidence = { checked_at: new Date().toISOString(), app_id: config.app_id,
  synthetic_inputs: true, business_mutations: false, cases: [] };
for (const item of cases) {
  const started = performance.now();
  const result = { case_id: item.id, input: item.message };
  try {
    const output = await generate({ ...baseEvent, event_id: item.id, user_message: item.message,
      event_type: item.event_type ?? 'chat', preferences: { proactive: item.proactive ?? true, remember: false } },
    { ...base, preferences: { proactive: item.proactive ?? true, remember: false },
      rejected_until_ms: item.rejected ? base.now_ms + 600000 : 0,
      active_task: item.active ? { owner_id: ownerId, template_id: 'focus_25', status: 'active' } : null });
    result.output = output;
    result.passed = item.strategies.includes(output.strategy) && output.suggested_task === item.task && output.sources.length === 0 &&
      !(item.forbidden?.test(output.reply));
  } catch (error) { result.passed = false; result.error_code = error.code ?? 'REQUEST_FAILED'; }
  result.elapsed_ms = Math.round(performance.now() - started);
  evidence.cases.push(result);
  console.log(JSON.stringify({ case_id: result.case_id, passed: result.passed, elapsed_ms: result.elapsed_ms, error_code: result.error_code }));
}
evidence.all_passed = evidence.cases.every(item => item.passed);
writeFileSync('agent/evidence/genios-structured-2026-10-16.json', JSON.stringify(evidence, null, 2).split(config.api_key).join('[REDACTED]') + '\n');
if (evidence.all_passed) {
  config.structured_output_verified = true;
  config.structured_verification = 'agent/evidence/genios-structured-2026-10-16.json';
  writeFileSync('data/private/genios-config.json', JSON.stringify(config, null, 2), { mode: 0o600 });
} else process.exitCode = 1;
