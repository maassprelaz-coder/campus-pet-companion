// 宠物贴图与静态资源检查（B 主责）：
// 1) 4 只形象 × 7 个白名单动作 = 28 个贴图都在，且是 512×512 / 含 ANIM 块的动画 WebP；
// 2) 单文件体积在需求单预算内（≤300 KB），整套体积有上限守门；
// 3) 文件名只由白名单映射得到，未知动作 / 未知形象不猜路径；
// 4) 页面按“形象 + 动作”换图，加载失败退回纯文字，且不引用任何外部地址。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as view from '../lib/view-model.mjs';

const ACTIONS = Object.keys(view.PET_ACTION_LABELS);
const KINDS = Object.keys(view.PET_KIND_LABELS);
const assetUrl = name => new URL(`../assets/pet-ui/${name}`, import.meta.url);
const pageHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pageJs = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('4 只形象 × 7 个动作都有贴图，且是 512×512 动画 WebP', () => {
  assert.deepEqual(ACTIONS, ['idle', 'happy', 'think', 'sleep', 'eat', 'roll', 'sad']);
  assert.deepEqual(KINDS, ['dog', 'turtle', 'cat', 'sheep']);
  assert.equal(Object.keys(view.PET_ASSET_FILES).length, KINDS.length * ACTIONS.length,
    '贴图映射应恰好覆盖全部形象 × 动作组合');
  for (const kind of KINDS) {
    for (const action of ACTIONS) {
      const file = view.petAssetFile(action, kind);
      assert.equal(file, `pet-${kind}-${action}.webp`, `${kind}/${action} 文件名应可预测`);
      const buf = readFileSync(assetUrl(file));
      assert.equal(buf.subarray(0, 4).toString('latin1'), 'RIFF', `${file} 应为 RIFF 容器`);
      assert.equal(buf.subarray(8, 12).toString('latin1'), 'WEBP', `${file} 应为 WebP`);
      assert.ok(buf.includes('ANIM'), `${file} 应为动画 WebP（含 ANIM 块）`);
      assert.equal(buf.readUIntLE(24, 3) + 1, 512, `${file} 画布宽应为 512`);
      assert.equal(buf.readUIntLE(27, 3) + 1, 512, `${file} 画布高应为 512`);
    }
  }
});

test('单文件体积不超过需求单预算 300 KB，整套体积也有上限', () => {
  let total = 0;
  for (const kind of KINDS) {
    for (const action of ACTIONS) {
      const file = view.petAssetFile(action, kind);
      const size = statSync(assetUrl(file)).size;
      total += size;
      assert.ok(size > 20 * 1024, `${file} 体积过小，可能是坏文件（${size} 字节）`);
      assert.ok(size <= 300 * 1024, `${file} 超预算：${(size / 1024).toFixed(1)} KB`);
    }
  }
  // 页面一次只加载 1 张（单张 300 KB 上限），整套素材只影响仓库体积，这里给宽松上限防膨胀。
  assert.ok(total <= 8 * 1024 * 1024, `28 张贴图合计 ${(total / 1024 / 1024).toFixed(2)} MB，超出 8 MB 上限`);
});

test('未知动作或未知形象都不猜贴图路径', () => {
  assert.equal(view.petAssetFile('dance'), null);
  assert.equal(view.petAssetFile(''), null);
  assert.equal(view.petAssetFile(undefined), null);
  assert.equal(view.petAssetFile('idle<script>'), null);
  assert.equal(view.petAssetFile('idle', 'dragon'), null);
  assert.equal(view.petAssetFile('idle', 'constructor'), null);
  assert.equal(view.petAssetFile('idle', undefined), 'pet-dog-idle.webp', '不传形象时默认小狗');
  assert.equal(view.knownPetKind('turtle'), 'turtle');
  assert.equal(view.knownPetKind('dragon'), null);
  assert.equal(view.petKindLabel('sheep'), '小羊');
  assert.match(view.petKindLabel('dragon'), /未识别形象（dragon）/);
});

test('形象下拉只提供白名单里的值，且白名单外一律回落默认', () => {
  assert.ok(pageHtml.includes('id="pet-kind-select"'), 'index.html 需要形象下拉');
  const options = [...pageHtml.matchAll(/<option value="([a-z]+)"(?:\s|>)/g)].map(match => match[1]);
  for (const kind of KINDS) assert.ok(options.includes(kind), `下拉里应有 ${kind}`);
  assert.ok(pageJs.includes('view.knownPetKind(event.target.value) ?? view.DEFAULT_PET_KIND'),
    '换形象时必须过白名单守卫');
  assert.ok(pageJs.includes('view.knownPetKind(readStorage(window.localStorage, PET_KIND_KEY))'),
    '从本地存储恢复形象时也必须过白名单守卫');
});

test('favicon 由同一套贴图派生，尺寸与体积符合需求单预算', () => {
  const buf = readFileSync(new URL('../favicon.png', import.meta.url));
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', 'favicon 应为 PNG');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.equal(width, height, 'favicon 应为正方形');
  assert.ok(width >= 192 && width <= 512, `favicon 边长应在 192–512，实际 ${width}`);
  assert.ok(buf.length <= 50 * 1024, `favicon 超预算：${(buf.length / 1024).toFixed(1)} KB`);
  assert.ok(pageHtml.includes('href="./favicon.png"'), 'index.html 应引用本地 favicon');
});

test('页面按形象与动作换图，加载失败退回纯文字，且只用相对路径', () => {
  assert.ok(pageHtml.includes('id="pet-image"'), 'index.html 需要宠物贴图元素');
  assert.ok(pageHtml.includes('id="pet-asset-note"'), 'index.html 需要贴图说明元素');
  assert.ok(pageHtml.includes('class="pet-image"'));
  assert.ok(pageJs.includes('view.petAssetFile(action, kind)'), 'app.js 应从白名单映射取文件名（带形象）');
  assert.ok(pageJs.includes('view.petKindLabel(kind)'), 'app.js 应在说明里写清当前形象');
  assert.match(pageJs, /image\.src = PET_ASSET_BASE \+ file;/);
  assert.match(pageJs, /addEventListener\('error'/);
  assert.match(pageJs, /addEventListener\('load'/);
  assert.ok(pageJs.includes("image.hidden = true"), '失败时应收起贴图');
  const base = /const PET_ASSET_BASE = '([^']+)'/.exec(pageJs);
  assert.ok(base, '应有 PET_ASSET_BASE 常量');
  assert.equal(base[1], './assets/pet-ui/');
  assert.equal(/^[a-z]+:|^\/\//.test(base[1]), false, '贴图目录必须是相对路径');
});
