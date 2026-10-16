// 零依赖本地静态服务器：把 apps/web 跑在 127.0.0.1:5173。
// 之所以固定 5173：tools/mock-api.mjs 的跨域白名单只放 localhost:5173 与 127.0.0.1:5173。
// 只用于本机联调，不做鉴权、不对公网监听。
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
};

export function createStaticServer({ root = DEFAULT_ROOT, taskApiOrigin = null } = {}) {
  const base = resolve(root);
  const upstream = taskApiOrigin ? new URL(taskApiOrigin) : null;
  if (upstream && (upstream.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(upstream.hostname)
    || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash)) {
    throw new Error('Task proxy only accepts a local HTTP service origin');
  }
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (upstream && (url.pathname === '/health' || url.pathname.startsWith('/api/v1/'))) {
      const port = server.address()?.port;
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) {
        response.writeHead(403).end();
        return;
      }
      const headers = {};
      for (const name of ['cookie', 'content-type', 'idempotency-key', 'origin', 'sec-fetch-site']) {
        if (request.headers[name]) headers[name] = request.headers[name];
      }
      const forwarded = http.request(new URL(url.pathname + url.search, upstream), {
        method: request.method, headers,
      }, incoming => {
        response.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(response);
      });
      forwarded.setTimeout(30000, () => forwarded.destroy());
      forwarded.on('error', () => {
        if (response.headersSent) { response.destroy(); return; }
        response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: { code: 'LOCAL_SERVICE_UNAVAILABLE', message: '本机任务服务未启动或暂时不可用' } }));
      });
      request.pipe(forwarded);
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';

    const target = resolve(join(base, normalize(pathname)));
    if (target !== base && !target.startsWith(base + sep)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('403 只允许访问 apps/web 目录内的文件');
      return;
    }

    let isFile = false;
    try {
      isFile = statSync(target).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(`404 找不到 ${pathname}`);
      return;
    }

    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(target).pipe(response);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 5173);
  const host = process.env.HOST ?? '127.0.0.1';
  createStaticServer({ taskApiOrigin: process.env.TASK_API_ORIGIN ?? null }).listen(port, host, () => {
    console.log(`网页联调地址：http://${host}:${port}/`);
    console.log(process.env.TASK_API_ORIGIN
      ? `本机业务转发已启用：${process.env.TASK_API_ORIGIN}，页面服务地址可填 http://${host}:${port}`
      : '提示：业务服务需另行启动（根目录 npm run mock，监听 127.0.0.1:8787）。');
    console.log('请用这个 http 地址打开页面，不要用 file:// 直接双击 index.html。');
  });
}
