// 真实浏览器走查（B 主责）：用本机 Edge/Chrome 的无头模式走一遍 mock 主流程并逐屏截图。
// 目的：补上"只有 Node 测试、没有真实浏览器验证"的缺口，并给提交材料产出可复现的效果演示图。
// 用法：
//   终端一 npm run mock               （127.0.0.1:8787）
//   终端二 node apps/web/dev-server.mjs（127.0.0.1:5173）
//   终端三 node apps/web/tools/browser-walkthrough.mjs [--base URL] [--out 目录]
// 说明：零第三方依赖（只用 Node 内置 WebSocket 说 CDP）；截图来自 mock，不能当真实成效。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CANDIDATES = [
  process.env.CP_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const BASE = arg('base', 'http://127.0.0.1:5173');
const OUT = resolve(arg('out', 'docs/submission/screenshots/mock-walkthrough'));
const WIDTH = Number(arg('width', '1280'));
const HEIGHT = Number(arg('height', '1600'));

const click = selector => `(() => { const n = document.querySelector(${JSON.stringify(selector)});
  if (!n) throw new Error('找不到 ${selector}'); n.click(); return true; })()`;
const text = selector => `(document.querySelector(${JSON.stringify(selector)})?.textContent ?? '')`;
// 贴图要等 load 事件把 hidden 摘掉，否则截图里宠物区还是空的。
const IMAGE_LOADED = `(() => { const i = document.querySelector('#pet-image');
  return Boolean(i && !i.hidden && i.complete && i.naturalWidth > 0); })()`;

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.pending = new Map();
    this.events = [];
    this.seq = 0;
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      } else if (msg.method) this.events.push(msg);
    });
  }

  static async connect(port) {
    let version = null;
    for (let i = 0; i < 25 && !version; i += 1) {
      try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); }
      catch { await sleep(300); }
    }
    if (!version) throw new Error(`CDP 端口 ${port} 没起来`);
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const cdp = new Cdp(ws);
    cdp.browser = version.Browser;
    return cdp;
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    return new Promise((res, rej) => {
      this.pending.set(id, msg => (msg.error ? rej(new Error(`${method}: ${msg.error.message}`)) : res(msg.result)));
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true }, this.sessionId);
    if (result.exceptionDetails) {
      throw new Error(`页面脚本报错：${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    }
    return result.result?.value;
  }

  async waitFor(expression, label, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.evaluate(`Boolean(${expression})`)) return;
      await sleep(200);
    }
    throw new Error(`等待超时：${label}`);
  }

  // 整页截图：按页面内容尺寸裁切，避免只截到首屏。
  async shot(name) {
    const metrics = await this.send('Page.getLayoutMetrics', {}, this.sessionId);
    const size = metrics.cssContentSize;
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
    }, this.sessionId);
    const buffer = Buffer.from(data, 'base64');
    writeFileSync(join(OUT, `${name}.png`), buffer);
    console.log(`  截图 ${name}.png（${Math.round(buffer.length / 1024)} KB，${Math.round(size.width)}×${Math.round(size.height)}）`);
  }

  // 元素特写：按元素外框裁切，用于宠物形象这类需要看清细节的图。
  async shotElement(selector, name) {
    const box = await this.evaluate(`(() => { const n = document.querySelector(${JSON.stringify(selector)});
      if (!n) return null; const r = n.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; })()`);
    if (!box) throw new Error(`找不到元素：${selector}`);
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 2 },
    }, this.sessionId);
    const buffer = Buffer.from(data, 'base64');
    writeFileSync(join(OUT, `${name}.png`), buffer);
    console.log(`  特写 ${name}.png（${Math.round(box.w)}×${Math.round(box.h)}，2 倍）`);
  }
}

async function main() {
  const browser = CANDIDATES.find(path => existsSync(path));
  if (!browser) throw new Error('没找到 Edge/Chrome，请用 CP_BROWSER 指定可执行文件');
  mkdirSync(OUT, { recursive: true });
  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = mkdtempSync(join(tmpdir(), 'cp-walkthrough-'));
  console.log(`浏览器：${browser}`);
  console.log(`页面：${BASE}｜输出：${OUT}`);

  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', `--window-size=${WIDTH},${HEIGHT}`, `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

  let cdp = null;
  try {
    cdp = await Cdp.connect(port);
    console.log(`内核：${cdp.browser}`);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    cdp.sessionId = sessionId;
    for (const domain of ['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable']) {
      await cdp.send(domain, {}, sessionId);
    }

    await cdp.send('Page.navigate', { url: BASE }, sessionId);
    await cdp.waitFor(`document.querySelector('#mode-badge')?.dataset.mode === 'mock'`, '自动连上 mock');
    console.log(`① 已连接：${await cdp.evaluate(text('#health-text'))}`);
    await cdp.waitFor(IMAGE_LOADED, '首页默认待机贴图加载完成');
    console.log(`   宠物区：${await cdp.evaluate(text('#pet-action-label'))}`);
    await cdp.shot('01-已连接服务');

    await cdp.evaluate(click('.map-hotspot[data-scene="library"]'));
    await cdp.waitFor(`${text('#suggestion-region')}.includes('接受并开始任务')`, '收到图书馆建议');
    console.log(`② 建议：${(await cdp.evaluate(text('#suggestion-region'))).slice(0, 70)}…`);
    await cdp.shot('02-场景建议');
    await cdp.waitFor(IMAGE_LOADED, '动作贴图加载完成');
    await cdp.shotElement('#pet-stage', '02b-宠物动作特写');

    await cdp.evaluate(click('#accept-button'));
    await cdp.waitFor(`${text('#task-region')}.includes('进行中')`, '任务进入进行中');
    console.log(`③ 任务：${(await cdp.evaluate(text('#task-region'))).slice(0, 70)}…`);
    await cdp.shot('03-接受建议后任务进行中');

    await cdp.evaluate(click('#complete-button'));
    await cdp.waitFor(`${text('#task-region')}.includes('已完成')`, '任务完成并有反馈');
    console.log(`④ 完成：${(await cdp.evaluate(text('#task-region'))).slice(0, 90)}…`);
    await cdp.shot('04-完成与反馈');

    await cdp.evaluate(`(() => { const s = document.querySelector('#pet-kind-select');
      s.value = 'sheep'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await cdp.waitFor(`/pet-sheep-/.test(document.querySelector('#pet-image')?.src ?? '')`, '换成小羊待机贴图');
    await cdp.waitFor(IMAGE_LOADED, '小羊贴图真正加载完成（hidden=false）');
    console.log(`⑤ 换形象：${await cdp.evaluate(text('#pet-asset-note'))}`);
    await cdp.shotElement('#pet-stage', '05-换形象-小羊');

    const failures = cdp.events.filter(e => e.method === 'Network.loadingFailed')
      .map(e => `${e.params.errorText}(${e.params.type})`);
    const errors = cdp.events.filter(e => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
      .map(e => e.params.entry.text);
    console.log(`网络失败：${failures.length ? failures.join('｜') : '无'}`);
    console.log(`控制台错误：${errors.length ? errors.join('｜') : '无'}`);
    console.log('完成：以上全部来自 mock，不代表真实智能体或真实试用成效。');
  } finally {
    try { await cdp?.send('Browser.close'); } catch { /* 忽略关闭失败 */ }
    await sleep(300);
    if (!proc.killed) proc.kill();
  }
}

main().catch(error => {
  console.error(`走查失败：${error.message}`);
  process.exitCode = 1;
});
