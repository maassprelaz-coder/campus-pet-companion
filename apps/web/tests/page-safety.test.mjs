// 页面安全与边界静态检查（B 主责）：
// 比赛与协作规则要求文本不当 HTML 执行、不直连模型、不引外部 CDN、不出现密钥。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

test('页面不加载外部 CDN 或第三方脚本', () => {
  const scriptTags = pageHtml.match(/<script\b[^>]*>/gi) ?? [];
  assert.deepEqual(scriptTags, ['<script type="module" src="./app.js">'], '只加载本页模块入口，禁止第三方脚本');
  assert.equal(/https?:\/\/(?!127\.0\.0\.1|localhost)/.test(pageHtml.replace(/<a[^>]*>/g, '')), false);
});

test('关键交互元素与标识都存在', () => {
  for (const id of ['mode-badge', 'mode-note', 'connect-button', 'scene-select', 'proactive-checkbox',
    'message-input', 'send-button', 'chat-log', 'suggestion-region', 'task-region', 'error-region',
    'sources-region', 'permission-location', 'permission-camera', 'permission-note', 'evidence-event']) {
    assert.ok(pageHtml.includes(`id="${id}"`), `缺少元素 ${id}`);
  }
  assert.ok(pageHtml.includes('id="pet-stage"') && pageHtml.includes('id="pet-action-label"'));
});

test('只有点发送或回车才发请求，草稿不会被自动发送', () => {
  assert.ok(pageJs.includes("el('chat-form')?.addEventListener('submit'"));
  assert.ok(pageJs.includes("(event.ctrlKey || event.metaKey) && event.key === 'Enter'"));
  const countdown = pageJs.slice(pageJs.indexOf('function updateCountdown'), pageJs.indexOf('function renderTask'));
  for (const call of ['client.', 'sendChat(', 'dispatch(']) assert.equal(countdown.includes(call), false, '倒计时只能显示，不能发送用户内容');
});

test('拒绝建议不会接受/完成任务，也不在页面结算积分', () => {
  const rejectBlock = pageJs.slice(pageJs.indexOf('function rejectSuggestion'), pageJs.indexOf('async function completeTask'));
  assert.equal(rejectBlock.includes('client.acceptSuggestion'), false, '拒绝不能创建任务');
  assert.equal(rejectBlock.includes('client.completeTask'), false, '拒绝不能完成任务');
  assert.equal(pageJs.includes('points_awarded +'), false);
  assert.equal(/points\s*=\s*\d/.test(pageJs), false);
});

test('本地静态服务器固定 5173 且不对外监听', () => {
  assert.match(serverJs, /process\.env\.PORT \?\? 5173/);
  assert.match(serverJs, /process\.env\.HOST \?\? '127\.0\.0\.1'/);
  assert.ok(serverJs.includes('startsWith(base + sep)'), '需要阻止目录穿越');
  assert.ok(serverJs.includes('pathToFileURL(process.argv[1])'), '被当作模块引入时不应自行监听端口');
});
