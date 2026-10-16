import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { resolve } from 'node:path';
import { productionSettings, createProductionApi } from '../../services/api/production-server.mjs';
import { TaskStore } from '../../services/api/task-store.mjs';

const env = { TASK_DB_PATH: resolve('data/private/synthetic-production.sqlite'),
  GENIOS_CONFIG_PATH: resolve('data/private/synthetic-production-config.json') };
const privateConfig = { app_id: 'db8qfm54shhbpg924dpg', structured_output_verified: true, api_key: 'synthetic-production-key' };

test('生产设置要求HTTPS源站和绝对私有路径，不能把数据库与凭据写到同一文件', () => {
  const settings = productionSettings(env);
  assert.equal(settings.origin, 'https://nkupet.fun');
  assert.equal(settings.port, 8788);
  for (const change of [{ PUBLIC_ORIGIN: 'http://nkupet.fun' }, { PUBLIC_ORIGIN: 'https://nkupet.fun/path' },
    { PUBLIC_ORIGIN: 'https://user:password@nkupet.fun' }, { PUBLIC_ORIGIN: 'https://localhost' },
    { GENIOS_CONFIG_PATH: 'relative.json' }, { TASK_DB_PATH: env.GENIOS_CONFIG_PATH }, { PORT: '0' }])
    assert.throws(() => productionSettings({ ...env, ...change }));
});

test('生产入口拒绝原生聊天版、未验证配置和缺失凭据，不静默使用mock', () => {
  for (const config of [null, { ...privateConfig, app_id: 'db878d54shhas0an4th0' },
    { ...privateConfig, structured_output_verified: false }, { ...privateConfig, api_key: '' }])
    assert.throws(() => createProductionApi({ settings: productionSettings(env), privateConfig: config }), /verified/);
});

test('HTTPS反向代理入口颁发Secure Cookie，仅接受本站Origin并保留内部Host检查', async t => {
  const store = new TaskStore();
  const server = createProductionApi({ settings: productionSettings(env), privateConfig, store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = once(server, 'close');
    server.close(); server.closeAllConnections(); await closed; store.close();
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const session = await fetch(url + '/api/v1/sessions', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://nkupet.fun' }, body: '{}' });
  assert.equal(session.status, 201);
  assert.equal((await session.json()).mode, 'live');
  assert.match(session.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/);
  assert.equal(session.headers.get('access-control-allow-origin'), 'https://nkupet.fun');
  const foreign = await fetch(url + '/api/v1/sessions', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: '{}' });
  assert.equal(foreign.status, 403);
  // fetch normalizes Host from its URL; send a raw HTTP request to exercise the actual header boundary.
  const hostStatus = await new Promise((resolveStatus, reject) => {
    http.get(url + '/health', { headers: { Host: 'nkupet.fun' } }, response => {
      response.resume();
      response.on('end', () => resolveStatus(response.statusCode));
    }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
});
