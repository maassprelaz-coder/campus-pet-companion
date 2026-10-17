// 页面安全与边界静态检查（B 主责）：
// 比赛与协作规则要求文本不当 HTML 执行、不直连模型、不引外部 CDN、不出现密钥。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

const pageHtml = read('../index.html');
const pageJs = read('../app.js');
const apiJs = read('../lib/api.mjs');
const viewJs = read('../lib/view-model.mjs');
const serverJs = read('../dev-server.mjs');
const pageSource = [pageJs, apiJs, viewJs].join('\n');

test('页面脚本不用 HTML 注入接口渲染文本', () => {
  for (const pattern of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
    assert.equal(pageSource.includes(pattern), false, `不应出现 ${pattern}`);
  }
});

test('页面不直连模型、不出现密钥或鉴权头', () => {
  const forbidden = [
    { pattern: /sk-[A-Za-z0-9_-]{8,}/, label: '疑似密钥字符串' },
    { pattern: /Authorization/i, label: '鉴权头' },
    { pattern: /Bearer\s/i, label: 'Bearer 令牌' },
    { pattern: /api[-_]?key/i, label: 'api key 字段' },
    { pattern: /deepseek|openai|qwen|glm-|gemini/i, label: '模型厂商接口' },
  ];
  for (const { pattern, label } of forbidden) {
    assert.equal(pattern.test(pageSource), false, `不应出现 ${label}（${pattern}）`);
  }
});

test('页面不加载外部 CDN 或第三方脚本，只引用仓库内相对路径', () => {
  // 原断言写成“不许出现 <script src=>”，结果把本仓库的本地脚本也一起禁掉了，
  // 页面因此从来没有加载过 app.js（2026-10-16 查实的真根因）。这里改成按“是否外链”判断。
  const remote = /(?:src|href)\s*=\s*["'](?:[a-z][a-z0-9+.-]*:)?\/\//gi;
  assert.equal(remote.test(pageHtml), false, 'index.html 不应引用任何外部地址（含协议相对 //host）');
  // 正文里的 http://127.0.0.1:8787 是给用户看的提示文本（input 的 value 也一样），不是外部引用，
  // 所以只查 src/href 属性，不用“整页不许出现 http”这种会误伤的一刀切断言。
  const links = [...pageHtml.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  for (const href of links) {
    assert.match(href, /^(?:\.{0,2}\/|#|https:\/\/)/, `页内链接只允许相对路径、锚点或 https：${href}`);
  }
});

test('页面必须以模块方式加载本仓库的 app.js，否则页面会一直是静态 HTML', () => {
  const scripts = pageHtml.match(/<script\b[^>]*>/gi) ?? [];
  assert.equal(scripts.length, 1, `应恰好有一个脚本标签，实际 ${scripts.length} 个`);
  assert.match(scripts[0], /type=["']module["']/, '必须声明 type="module"');
  assert.match(scripts[0], /src=["']\.\/app\.js["']/, '必须指向本目录的 ./app.js');
  assert.match(pageHtml, /<script\b[^>]*><\/script>\s*<\/body>/, '脚本标签应放在 </body> 前');
});

test('页面引用的本地脚本、样式、图片都真实存在', () => {
  const refs = [...pageHtml.matchAll(/(?:src|href)\s*=\s*["']([^"'#]+)["']/gi)].map(match => match[1]);
  assert.ok(refs.length >= 2, `页面至少应引用 styles.css 与 app.js，实际 ${refs.length} 个`);
  for (const ref of refs) {
    assert.equal(/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(ref), false, `不应引用外部地址：${ref}`);
    const target = new URL(ref, new URL('../index.html', import.meta.url));
    assert.equal(existsSync(target), true, `页面引用了不存在的文件：${ref}`);
  }
});

test('关键交互元素与标识都存在', () => {
  for (const id of ['mode-badge', 'mode-note', 'connect-button', 'scene-select', 'proactive-checkbox',
    'pet-kind-select', 'pet-image', 'pet-asset-note',
    'message-input', 'send-button', 'chat-log', 'suggestion-region', 'task-region', 'error-region',
    'sources-region', 'permission-location', 'permission-camera', 'permission-note', 'evidence-event']) {
    assert.ok(pageHtml.includes(`id="${id}"`), `缺少元素 ${id}`);
  }
  assert.ok(pageHtml.includes('id="pet-stage"') && pageHtml.includes('id="pet-action-label"'));
});

test('只有点发送或回车才发请求，草稿不会被自动发送', () => {
  assert.ok(pageJs.includes("el('chat-form')?.addEventListener('submit'"));
  assert.ok(pageJs.includes("(event.ctrlKey || event.metaKey) && event.key === 'Enter'"));
  for (const pattern of ['setInterval', 'setTimeout']) {
    assert.equal(pageJs.includes(pattern), false, `不应出现定时自动发送相关调用 ${pattern}`);
  }
});

test('拒绝建议不调用接口，也不在页面结算积分', () => {
  const rejectBlock = pageJs.slice(pageJs.indexOf('function rejectSuggestion'), pageJs.indexOf('async function completeTask'));
  assert.equal(rejectBlock.includes('client.'), false, '拒绝路径不应调用任何接口');
  assert.equal(pageJs.includes('points_awarded +'), false);
  assert.equal(/points\s*=\s*\d/.test(pageJs), false);
});

test('本地静态服务器固定 5173 且不对外监听', () => {
  assert.match(serverJs, /process\.env\.PORT \?\? 5173/);
  assert.match(serverJs, /process\.env\.HOST \?\? '127\.0\.0\.1'/);
  assert.ok(serverJs.includes('startsWith(base + sep)'), '需要阻止目录穿越');
  assert.ok(serverJs.includes('pathToFileURL(process.argv[1])'), '被当作模块引入时不应自行监听端口');
});
