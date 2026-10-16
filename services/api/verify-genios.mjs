import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createGeniosClient } from './genios-client.mjs';

// Explicit real-platform probe. The key is read from an ignored file, never a CLI argument or console output.
const config = JSON.parse(readFileSync(process.env.GENIOS_CONFIG_PATH ?? 'data/private/genios-native-config.json', 'utf8'));
const attempts = [];
const started = performance.now();
const evidence = { checked_at: new Date().toISOString(), kind: 'real_native_api_probe',
  app_id: config.app_id, synthetic_input: true, structured_output_verified: false, attempts };
try {
  const client = createGeniosClient({ apiKey: config.api_key, fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    const attempt = { path: new URL(url).pathname, status: response.status,
      content_type: response.headers.get('content-type') };
    if (!response.ok) {
      const detail = await response.clone().json().catch(() => null);
      if (detail) {
        const code = detail.code ?? detail.error?.code ?? detail.Error?.Code ?? detail.BaseResp?.StatusCode;
        const message = detail.message ?? detail.error?.message ?? detail.Error?.Message ?? detail.BaseResp?.StatusMessage ??
          (typeof detail.error === 'string' ? detail.error : undefined);
        if (typeof code === 'string' || typeof code === 'number') attempt.response_code = code;
        if (typeof message === 'string') attempt.response_message = message.slice(0, 300);
      }
    }
    attempts.push(attempt);
    return response;
  } });
  const answer = await client.generate({ event: { schema_version: '0.1', event_id: 'native-api-probe', event_type: 'chat',
    user_message: '这是开发者的合成接口连通测试，请用一句中文打个招呼，不创建任务。',
    scene: 'dorm', preferences: { proactive: false, remember: false } },
  suggestion_policy: { allow_suggestion: false, reason: 'no_available_task', available_task_templates: [] },
  active_task: null, completion_verified: false, retrieved_sources: [] }, { signal: AbortSignal.timeout(20000) });
  evidence.outcome = 'native_answer_received';
  evidence.answer = answer;
} catch (error) {
  evidence.outcome = 'failed';
  evidence.failure = error.name === 'TimeoutError' ? 'timeout' :
    error.cause?.message?.includes('redirect') ? 'unexpected_redirect' : 'network_or_response_failure';
  if (typeof error.cause?.code === 'string') evidence.network_code = error.cause.code;
  process.exitCode = 1;
}
evidence.elapsed_ms = Math.round(performance.now() - started);
mkdirSync('agent/evidence', { recursive: true });
// Synthetic answer only; remove the secret even if a platform unexpectedly echoes it.
const evidencePath = 'agent/evidence/genios-api-probe-2026-10-16.json';
const previous = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, 'utf8')) : null;
const runs = previous ? previous.runs ?? [previous] : [];
runs.push(evidence);
const sanitized = JSON.stringify({ schema_version: 1, runs }, null, 2).split(config.api_key).join('[REDACTED]');
writeFileSync(evidencePath, sanitized + '\n');
console.log(JSON.stringify(evidence, null, 2).split(config.api_key).join('[REDACTED]'));
