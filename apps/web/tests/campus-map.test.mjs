// 校园地图 B 级接入检查（B 主责）：
// 1) 成品是仓库内的静态 WebP：2000×908、体积在 400 KB 预算内、保留源图自带的 AIGC 元数据（XMP 块）；
// 2) 页面只用相对路径引用，AI 生成标注与“非精确导航”说明写在 HTML 静态文本里（脚本失败也不丢标注）；
// 3) 加载失败只收起图片并显示文字兜底；地标按钮只覆盖契约白名单场景，点击复用已有 scene_enter。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { SCENES } from '../lib/api.mjs';
import * as view from '../lib/view-model.mjs';

const mapUrl = new URL('../assets/campus/map-campus.webp', import.meta.url);
const pageHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pageJs = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const pageCss = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function riffChunks(buffer) {
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const fourcc = buffer.subarray(offset, offset + 4).toString('latin1');
    const size = buffer.readUInt32LE(offset + 4);
    chunks.push({ fourcc, payload: buffer.subarray(offset + 8, offset + 8 + size) });
    offset += 8 + size + (size % 2);
  }
  return chunks;
}

test('地图成品是 2000×908 静态 WebP，体积不超 400 KB 预算', () => {
  const buffer = readFileSync(mapUrl);
  assert.equal(buffer.subarray(0, 4).toString('latin1'), 'RIFF', '应为 RIFF 容器');
  assert.equal(buffer.subarray(8, 12).toString('latin1'), 'WEBP', '应为 WebP');
  const chunks = riffChunks(buffer);
  const header = chunks.find(chunk => chunk.fourcc === 'VP8X');
  const image = chunks.find(chunk => chunk.fourcc === 'VP8 ' || chunk.fourcc === 'VP8L');
  assert.ok(header, '应有 VP8X 扩展头（承载 XMP 元数据需要）');
  assert.ok(image, '应有图像数据块');
  assert.equal(header.payload.readUIntLE(4, 3) + 1, 2000, '画布宽应为 2000');
  assert.equal(header.payload.readUIntLE(7, 3) + 1, 908, '画布高应为 908');
  assert.equal(chunks.some(chunk => chunk.fourcc === 'ANIM'), false, '地图是静态图，不应带动画块');
  const size = statSync(mapUrl).size;
  assert.ok(size > 50 * 1024, `体积过小，可能是坏文件（${size} 字节）`);
  assert.ok(size <= 400 * 1024, `超预算：${(size / 1024).toFixed(1)} KB`);
});

test('成品保留源图的 AIGC 元数据，并写清派生处理与非精确导航', () => {
  const xmp = riffChunks(readFileSync(mapUrl)).find(chunk => chunk.fourcc === 'XMP ');
  assert.ok(xmp, '应有 XMP 块（AI 生成标识不能丢）');
  const text = xmp.payload.toString('utf8');
  for (const phrase of ['AI 生成', '千问', '非精确导航', 'ContentProducer']) {
    assert.ok(text.includes(phrase), `XMP 应保留“${phrase}”信息`);
  }
});

test('页面用相对路径引用地图，AI 生成标注是静态文本（不依赖脚本）', () => {
  const tag = /<img[^>]*id="campus-map"[^>]*>/.exec(pageHtml);
  assert.ok(tag, 'index.html 需要 #campus-map 图片元素');
  assert.match(tag[0], /src="\.\/assets\/campus\/map-campus\.webp"/, '只允许 ./assets 下的相对路径');
  assert.equal(/https?:|src="\/\//.test(tag[0]), false, '不得引用外部地址或 CDN');
  assert.match(tag[0], /alt="[^"]*AI 生成[^"]*"/, 'alt 里要写明 AI 生成');
  const caption = /<figcaption[^>]*id="campus-map-note"[^>]*>([\s\S]*?)<\/figcaption>/.exec(pageHtml);
  assert.ok(caption, '说明应是 HTML 静态文本，脚本失败也不能丢掉标注');
  for (const phrase of ['AI 生成', '千问', '非精确导航', 'scene_enter']) {
    assert.ok(caption[1].includes(phrase), `说明应包含“${phrase}”`);
  }
  assert.ok(pageHtml.includes('id="campus-map-fallback"'), '需要图片失败时的文字兜底元素');
  assert.equal(pageHtml.includes('legacy/'), false, '页面不直接引用只读的 legacy 目录');
});

test('地标按钮只覆盖契约白名单的 4 个场景', () => {
  const scenes = [...pageHtml.matchAll(/data-scene="([a-z]+)"/g)].map(match => match[1]);
  assert.equal(scenes.length, 4, '应只有 4 个地标按钮');
  assert.deepEqual([...scenes].sort(), [...SCENES].sort(), '地标必须与契约场景白名单一致');
  assert.ok(pageHtml.includes('id="campus-map-hotspots"'));
});

test('地图加载失败只收起图片；地标点击复用 scene_enter 且带白名单守卫', () => {
  assert.match(pageJs, /function wireCampusMap\(\)/);
  assert.match(pageJs, /wireCampusMap\(\);/);
  assert.match(pageJs, /image\.addEventListener\('load', \(\) => showCampusMap\(true\)\)/);
  assert.match(pageJs, /image\.addEventListener\('error', \(\) => showCampusMap\(false\)\)/);
  assert.match(pageJs, /image\.hidden = !loaded/, '失败时应收起图片');
  assert.match(pageJs, /if \(image\.complete\) showCampusMap\(image\.naturalWidth > 0\)/, '脚本挂监听之前就已加载/失败的情况也要判');
  assert.match(pageJs, /view\.knownScene\(button\.dataset\.scene\)/, '地标场景必须过白名单');
  assert.match(pageJs, /state\.scene = scene;/, '地标点击应同步当前场景');
  assert.match(pageJs, /enterScene\(\);/, '地标点击应复用已有的 scene_enter 路径');
  assert.ok(pageCss.includes('.campus-map[hidden] { display: none; }'), '否则 .campus-map 的 display 会盖掉 hidden 而收起失败');
});

test('knownScene 只认契约白名单，其余一律不猜', () => {
  for (const scene of SCENES) assert.equal(view.knownScene(scene), scene);
  for (const bad of ['gym', 'DORM', '', ' ', null, undefined, 42, 'library ', 'constructor', 'toString', '__proto__']) {
    assert.equal(view.knownScene(bad), null, `${String(bad)} 不应被当作场景`);
  }
});

test('贴图白名单同样不认原型链上的名字', () => {
  assert.equal(view.petAssetFile('constructor'), null);
  assert.equal(view.petAssetFile('toString'), null);
  assert.equal(view.petAssetFile('idle'), 'pet-dog-idle.webp');
});
