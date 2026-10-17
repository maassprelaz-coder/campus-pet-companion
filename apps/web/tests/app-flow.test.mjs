// 页面脚本行为测试（B 主责）：用最小 DOM 桩真实执行 apps/web/app.js，不引第三方依赖。
// 覆盖两件事：
//   ① 连接失败必须在顶部徽标与“连接服务”下面的状态行立刻可见（2026-10-16 修复的“点了没反应”缺陷）；
//   ② 连上 mock 后页面能走通：地图地标选场景 → 建议 → 接受 → 完成，宠物贴图按动作换图。
// 注意：这是 DOM 桩模拟，不是真实浏览器；真实浏览器点击走查记录见 docs/handoffs/B/current.md。
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createMockServer } from '../../../tools/mock-api.mjs';
import { createStaticServer } from '../dev-server.mjs';

const BROWSER_ORIGIN = 'http://127.0.0.1:5173';
const SCENES = ['dorm', 'library', 'sports', 'canteen'];

class FakeNode {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.attributes = {};
    this._text = '';
    this._id = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.checked = false;
    this.className = '';
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.src = '';
    // 地图图片按“已经加载成功”参与测试，覆盖 wireCampusMap 的 complete 分支。
    this.complete = true;
    this.naturalWidth = 2000;
  }
  get id() { return this._id; }
  set id(value) { this._id = value; if (value) this.owner?.register(value, this); }
  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value); }
  setAttribute(name, value) { this.attributes[name] = value; if (name === 'src') this.src = value; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  async fire(type) {
    for (const handler of this.listeners[type] ?? []) await handler({ preventDefault() {}, target: this });
  }
  flat() {
    const own = this._text ? [this._text] : [];
    return own.concat(this.children.flatMap(child => (child instanceof FakeNode ? child.flat() : [String(child)])));
  }
}

function installPage({ storedBaseUrl = null } = {}) {
  const byId = new Map();
  const owner = { register: (id, node) => byId.set(id, node) };
  const make = tag => {
    const node = new FakeNode(tag);
    node.owner = owner;
    return node;
  };
  const hotspots = SCENES.map(scene => {
    const node = make('button');
    node.dataset.scene = scene;
    return node;
  });
  // 用 localStorage 预置服务地址 = 模拟“用户之前填过地址”，页面 init 会沿用它并回填输入框。
  const store = new Map();
  if (storedBaseUrl) store.set('campus-pet-web-base-url', storedBaseUrl);
  const document = {
    getElementById(id) { if (!byId.has(id)) byId.set(id, make('div')); return byId.get(id); },
    createElement(tag) { return make(tag); },
    querySelectorAll(selector) { return selector === '.map-hotspot' ? hotspots : []; },
    addEventListener() {},
  };
  const window = {
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key),
    },
    addEventListener() {},
  };
  globalThis.document = document;
  globalThis.window = window;
  // 注意：包装前必须先抓住原始 fetch，否则包装函数内部的 fetch 会指向自己，直接爆栈。
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (url, init = {}) => realFetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Origin: BROWSER_ORIGIN },
  });
  return {
    document,
    window,
    el: id => document.getElementById(id),
    text: id => document.getElementById(id).flat().join(' '),
    has: id => byId.has(id),
    hotspot: scene => hotspots.find(node => node.dataset.scene === scene),
  };
}

async function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

// 关服务时必须同时断掉 keep-alive 连接，否则 close() 会一直等，测试进程不退出。
function stopServer(server) {
  return new Promise(resolve => {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    server.close(() => resolve());
  });
}

async function freePortBase() {
  const server = http.createServer();
  const base = await listen(server);
  await new Promise(resolve => server.close(resolve));
  return base;
}

async function waitFor(check, label, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`等待超时：${label}`);
}

let caseIndex = 0;
async function loadPage() {
  caseIndex += 1;
  // 带查询串导入 = 每个用例拿到全新的页面实例（模块缓存不会串状态）。
  const url = new URL('../app.js', import.meta.url);
  await import(`${url.href}?case=${caseIndex}`);
  return caseIndex;
}


test('连接失败时：顶部徽标与按钮下方状态行立刻可见（回归：点了没反应）', async () => {
  const deadBase = await freePortBase();
  const page = installPage({ storedBaseUrl: deadBase }); // 页面记着这个地址，但服务没启动

  await loadPage();
  await waitFor(() => page.el('mode-badge').textContent === '连接失败', '徽标变成连接失败');

  assert.equal(page.el('mode-badge').dataset.mode, 'error');
  assert.match(page.el('mode-note').textContent, /连接失败/);
  assert.match(page.el('health-text').textContent, /连接失败/);
  assert.match(page.el('health-text').textContent, /npm run mock/);
  assert.match(page.el('health-text').textContent, /\[[A-Z_]+\]/, '状态行应带真实的错误码，而不是空话');
  assert.equal(page.el('health-text').dataset.tone, 'err');
  assert.equal(page.el('send-button').disabled, true, '未连上时发送按钮应锁住');
  assert.ok(page.text('error-region').length > 0, '第 8 节仍应保留错误详情');

  // 再点一次“连接服务”：必须马上变成可见的失败状态，而不是毫无变化。
  await page.el('connect-button').fire('click');
  await waitFor(() => page.el('health-text').dataset.tone === 'err', '再次点击后仍是可见的失败状态');
  assert.equal(page.el('mode-badge').textContent, '连接失败');
  assert.match(page.text('chat-log'), /连接失败/, '聊天区也留一条可读的失败说明');
});

test('连上 mock 后页面走通：地标选场景 → 建议 → 接受 → 完成，宠物贴图跟着动作换', async t => {
  const server = createMockServer();
  const base = await listen(server);
  t.after(() => stopServer(server));

  const page = installPage({ storedBaseUrl: base });

  await loadPage();
  await waitFor(() => page.el('mode-badge').textContent === '模拟 mock', '自动连上 mock');
  assert.match(page.el('health-text').textContent, /已连接/);
  assert.equal(page.el('health-text').dataset.tone, 'ok');
  assert.equal(page.el('send-button').disabled, false, '连上后发送按钮应解锁');
  assert.equal(page.el('campus-map').hidden, false, '地图图片应显示');
  assert.equal(page.el('campus-map-fallback').hidden, true);

  // 点地图“图书馆”地标 = 选场景 + 发 scene_enter（复用既有契约路径）
  await page.hotspot('library').fire('click');
  await waitFor(() => page.text('suggestion-region').includes('接受并开始任务'), '收到 focus_25 建议');
  assert.equal(page.el('scene-select').value, 'library');
  assert.match(page.text('suggestion-region'), /25 分钟/);
  assert.match(page.el('pet-asset-note').textContent, /pet-dog-happy\.webp/);
  assert.match(page.el('evidence-response').textContent, /建议 有/);

  // 接受建议 → 任务由服务端创建（页面不会自己造成完成）
  await page.el('accept-button').fire('click');
  await waitFor(() => page.text('task-region').includes('进行中'), '任务变为进行中');
  assert.equal(page.el('complete-button').disabled, false);

  // 标记完成 → 反馈；mock 固定 0 分，页面不自行加积分
  await page.el('complete-button').fire('click');
  await waitFor(() => page.text('task-region').includes('已完成'), '任务变为已完成');
  assert.match(page.text('task-region'), /积分/);
});

test('服务中途不可用：点发送显示可重试的失败，页面不崩溃', async t => {
  const server = createMockServer();
  const base = await listen(server);
  t.after(() => stopServer(server));
  const page = installPage({ storedBaseUrl: base });

  await loadPage();
  await waitFor(() => page.el('mode-badge').textContent === '模拟 mock', '自动连上 mock');

  await page.el('scene-button').fire('click');
  await waitFor(() => page.text('suggestion-region').length > 0, '场景请求完成');

  // 服务停掉后再发一次：应进入可重试的失败状态，而不是静默无反应。
  await stopServer(server);
  page.el('message-input').value = '服务断了我还想说句话';
  await page.el('chat-form').fire('submit');
  await waitFor(() => page.text('error-region').length > 0, '出现错误面板');
  assert.match(page.text('error-region'), /重试|失败|拒绝/);
  assert.equal(page.has('retry-button'), true, '网络失败应给出重试按钮');
});

test('静态服务器交付的页面会真的引导浏览器加载 app.js（防“页面变静态”回归）', async t => {
  const server = createStaticServer();
  const base = await listen(server);
  t.after(() => stopServer(server));

  const html = await (await fetch(`${base}/`)).text();
  const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
  assert.equal(scripts.length, 1, 'index.html 应恰好有一个脚本标签');
  assert.match(scripts[0], /type=["']module["']/);
  const src = scripts[0].match(/src=["']([^"']+)["']/)?.[1];
  assert.equal(src, './app.js');

  // 页面引用的脚本必须真的能从同一服务器取到，且是 JS 内容类型（浏览器按模块加载）。
  const moduleResponse = await fetch(new URL(src, `${base}/`));
  assert.equal(moduleResponse.status, 200);
  assert.match(moduleResponse.headers.get('content-type'), /javascript/);
  assert.match(await moduleResponse.text(), /import\s+\{/);

  // 静态 HTML 里必须留着初始状态与状态行节点；JS 没跑起来时用户至少能看到"未连接"与指引。
  assert.match(html, /id="mode-badge"/);
  assert.match(html, /id="mode-note"/);
  assert.match(html, /id="health-text"/);
  assert.match(html, /尚未连接到服务/);

  // 换形象依赖的新贴图也必须能从同一服务器按 WebP 取到（取不到就只会静默退回纯文字）。
  const petAsset = await fetch(new URL('./assets/pet-ui/pet-cat-idle.webp', `${base}/`));
  assert.equal(petAsset.status, 200);
  assert.match(petAsset.headers.get('content-type'), /image\/webp/);
});

test('换形象：切换下拉立刻给一眼待机贴图，随后动作也用同一只宠物，且刷新后记得', async t => {
  const server = createMockServer();
  const base = await listen(server);
  t.after(() => stopServer(server));

  const page = installPage({ storedBaseUrl: base });
  await loadPage();
  await waitFor(() => page.el('mode-badge').textContent === '模拟 mock', '自动连上 mock');

  // 还没收到任何服务响应：默认小狗待机贴图（写明“默认”，不冒充服务动作）。
  assert.equal(page.el('pet-kind-select').value, 'dog');
  assert.match(page.el('pet-image').src, /pet-dog-idle\.webp$/, '首页默认显示小狗待机贴图');
  assert.match(page.el('pet-asset-note').textContent, /默认待机/);
  assert.match(page.el('pet-action-label').textContent, /待机（默认/);

  // 换形象：只换图、不发请求（没有建议、没有错误），并写进本地存储。
  page.el('pet-kind-select').value = 'cat';
  await page.el('pet-kind-select').fire('change');
  assert.match(page.el('pet-image').src, /pet-cat-idle\.webp$/, '切换后应立刻显示该形象的待机贴图');
  assert.match(page.el('pet-asset-note').textContent, /猫咪/);
  assert.match(page.text('chat-log'), /宠物形象已切换为猫咪/);
  assert.equal(page.text('suggestion-region').includes('接受并开始任务'), false, '换形象不应触发任何请求');
  assert.equal(page.window.localStorage.getItem('campus-pet-web-pet-kind'), 'cat');

  // 之后进入场景：动作贴图换成同一只猫的动作图，说明里也写清形象。
  await page.hotspot('library').fire('click');
  await waitFor(() => page.text('suggestion-region').includes('接受并开始任务'), '收到 focus_25 建议');
  assert.match(page.el('pet-image').src, /pet-cat-happy\.webp$/);
  assert.match(page.el('pet-asset-note').textContent, /pet-cat-happy\.webp/);
  assert.match(page.el('pet-asset-note').textContent, /猫咪形象/);
});

