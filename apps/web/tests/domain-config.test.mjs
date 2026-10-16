import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BASE_URL, serviceBaseUrlForPage } from '../lib/api.mjs';

test('部署到HTTPS域名后使用本站接口，手机与旧本机配置不会指向127.0.0.1', () => {
  assert.equal(serviceBaseUrlForPage('https://nkupet.fun/companion/', 'http://127.0.0.1:8787'), 'https://nkupet.fun');
  assert.equal(serviceBaseUrlForPage('https://nkupet.fun/', 'https://old.example'), 'https://nkupet.fun');
});

test('本机和文件预览仍使用开发配置，不影响已有mock联调', () => {
  assert.equal(serviceBaseUrlForPage('http://127.0.0.1:5173/', 'http://127.0.0.1:5173/'), 'http://127.0.0.1:5173');
  assert.equal(serviceBaseUrlForPage('https://localhost:5173/', DEFAULT_BASE_URL), DEFAULT_BASE_URL);
  assert.equal(serviceBaseUrlForPage('file:///preview.html'), DEFAULT_BASE_URL);
});
