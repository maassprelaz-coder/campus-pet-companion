import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApiServer } from './api-server.mjs';
import { createGeniosAgent } from './genios-client.mjs';
import { TaskStore } from './task-store.mjs';

// HTTPS terminates at the site's reverse proxy. This service still listens only on loopback.
export function productionSettings(env = process.env) {
  const rawOrigin = env.PUBLIC_ORIGIN ?? 'https://nkupet.fun';
  let origin;
  try { origin = new URL(rawOrigin); } catch { throw new Error('PUBLIC_ORIGIN must be an HTTPS origin'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' ||
      origin.search || origin.hash || ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
    throw new Error('PUBLIC_ORIGIN must be a public HTTPS origin without a path');
  const port = Number(env.PORT ?? 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const databasePath = env.TASK_DB_PATH;
  const configPath = env.GENIOS_CONFIG_PATH;
  if (![databasePath, configPath].every(path => typeof path === 'string' && isAbsolute(path)))
    throw new Error('TASK_DB_PATH and GENIOS_CONFIG_PATH must be absolute private paths');
  if (databasePath === configPath) throw new Error('Database and configuration paths must differ');
  return { origin: origin.origin, port, databasePath, configPath };
}

function verifiedAgent(privateConfig) {
  if (privateConfig?.app_id !== 'db8qfm54shhbpg924dpg' || privateConfig.structured_output_verified !== true ||
      typeof privateConfig.api_key !== 'string' || !/^[A-Za-z0-9_./+=-]{20,500}$/.test(privateConfig.api_key))
    throw new Error('A verified service-agent configuration is required');
  return createGeniosAgent({ apiKey: privateConfig.api_key, structuredOutputVerified: true });
}

export function createProductionApi({ settings, privateConfig, store }) {
  return createApiServer({ store, mode: 'live', secureCookie: true, origins: [settings.origin],
    agent: verifiedAgent(privateConfig) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const settings = productionSettings();
    if (!existsSync(settings.configPath)) throw new Error('Private service configuration is missing');
    const privateConfig = JSON.parse(readFileSync(settings.configPath, 'utf8'));
    // Validate the agent configuration before opening or creating any persistent database.
    verifiedAgent(privateConfig);
    const store = new TaskStore({ filename: settings.databasePath });
    const server = createProductionApi({ settings, privateConfig, store });
    server.listen(settings.port, '127.0.0.1', () => console.log(`Task API ready behind HTTPS proxy for ${settings.origin}; loopback port ${settings.port}.`));
    const stop = () => server.close(() => store.close());
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch {
    // Configuration values and parsing errors can contain credentials. Fail startup without echoing them.
    console.error('Production startup failed: check HTTPS origin, absolute private paths, Node version and verified service configuration.');
    process.exitCode = 1;
  }
}
