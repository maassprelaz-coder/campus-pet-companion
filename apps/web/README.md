# 网页工作入口

主责Seventy。**把用户实际操作的宠物网页做好，接上真实智能体的建议、选择和行动反馈。** 详细步骤、验收、日期与交接见[B任务卡](../../docs/assignments/B_web.md)。2026-10-15 已有可在浏览器操作的 v1 骨架（未接真实服务），见下文。

先检查旧页面与素材的实际效果，再决定复制改造还是局部新做。原型是原生HTML/CSS/JS加Electron壳；不预先要求换框架，也不强制沿用。旧专注、任务和合拍并非全要重建，记录保留/改造/替换依据。

先使用根目录 `npm run mock` 和 [v0.1草案](../../contracts/README.md)独立联调，本地页面用5173端口或同A协调模拟工具配置。服务地址可配置，mock明显标记。只实现A确认的可执行任务；不要因fixtures包含两个模板就承诺两种任务都完成。

建议小步交付：先交现状与缺口表；再交能操作的主流程并接真实服务；最后修复问题、验证选定亮点、交截图录屏。B自己整理并接入资源，A不并行改页面。用纯文本显示输入输出，动作只取白名单；拒绝授权仍可使用基本功能，不自动发送草稿，不由页面决定奖励。

当前记忆接口关闭；如后续有高收益改进，按评分计划和公共接口流程确认后扩展。手势合拍、视觉等值得做的功能允许排入，以稳定、真实和可按时展示为准。不新增手机App或桌面打包。

## 已实现的 v1 骨架（2026-10-15，B）

新增了可直接在浏览器操作的主流程：连接会话 → 输入/场景切换 → 看建议 → 接受或拒绝 → 任务倒计时与恢复 → 完成反馈。全部走 `contracts/` 的 v0.1 草案，页面常驻 `模拟` 标识；没有真实模型、真实存储和真实积分，验收时不能当成实际成效。

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面结构，12 个小节（含"3. 校园地图（AI 生成示意）"；状态区块：未连接/连接中/等待/建议/已接受/任务/完成/空/错误/权限拒绝/刷新恢复）；末尾以 `<script type="module" src="./app.js">` 加载页面脚本（缺了它会整页变静态，见 `DECISIONS.md` 第 23 条） |
| `styles.css` | 纯本地样式，无 CDN；宠物贴图用 `assets/pet-ui/*.webp`、校园地图用 `assets/campus/map-campus.webp`（都是仓库内相对路径） |
| `app.js` | 渲染与事件分发：401 自动重建会话、失败可重试、拒绝不发请求、不自动发送草稿；地图负责加载失败降级与地标交互 |
| `lib/api.mjs` | 契约 v0.1 客户端：会话、事件、接受/查询/完成、幂等键、错误归一化、响应摘要 |
| `lib/view-model.mjs` | 文案标签、输入校验、建议/任务/积分/错误视图、发送锁、贴图形象/动作与场景白名单（`petAssetFile(action, kind)`/`knownPetKind`/`petKindLabel`/`knownScene`） |
| `dev-server.mjs` | 本地静态服务器，固定 5173、只监听 127.0.0.1、带目录穿越防护，可被测试 import |
| `tools/browser-walkthrough.mjs` | **真实浏览器走查**：调用本机 Edge/Chrome 无头模式 + CDP，零第三方依赖；自动走主流程并逐屏截图，同时报告网络失败与控制台错误 |
| `config.example.json` | 服务地址示例；复制为 `config.json`（已 gitignore）后生效 |
| `tests/*.test.mjs` | 58 个用例：客户端契约、视图模型、页面安全（含"页面必须真实加载 app.js"）、宠物贴图（4 只形象 × 7 动作 + favicon）、校园地图、真实起 mock 的端到端、页面脚本行为（DOM 桩执行真实 `app.js`）、浏览器 fetch 调用方式回归 |
| `favicon.png` | 浏览器标签页图标：由 `tools/convert-legacy-pets.py --favicon` 从 `pet-dog-idle.webp` 首帧裁切生成（512×512 透明调色板 PNG，27.8 KB） |

## 怎么跑起来

```
npm run mock                                  # 终端一：模拟服务，http://127.0.0.1:8787
node apps/web/dev-server.mjs                  # 终端二：页面，http://127.0.0.1:5173
node --test "apps/web/tests/**/*.test.mjs"    # 测试 58/58（Node ≥22；目录参数无效，必须用 glob；再加 tools/mock-api.test.mjs 则 59/59）
node apps/web/tools/browser-walkthrough.mjs   # 可选：真实浏览器走查（前两个终端保持运行）
```

浏览器打开 `http://127.0.0.1:5173`，点上方的"连接宠物"。服务地址默认 `http://127.0.0.1:8787`，可在页面输入框临时改，或写进 `apps/web/config.json`。mock 只放行 `localhost:5173` 与 `127.0.0.1:5173` 两个来源，换端口会被 403 拒绝，这是刻意设的跨域边界。

页面只发契约允许的字段（`schema_version/event_id/event_type/user_message/scene/mood/preferences/task_id`），`preferences.remember` 固定 `false`；幂等键由 `event_id`/`suggestion_id`/`task_id` 推导，重试不会重复建任务。详细取舍见 `DECISIONS.md`。

## 打不开 / 点了没反应？（2026-10-16 修了两处；下午那处才是真根因）

- **真根因：`index.html` 从来没有加载 `app.js`（10-16 下午查实，已修）**。此前的页面测试里有一条"不许出现 `<script src=>`"的断言（本意是禁外部 CDN），把本仓库的本地脚本也一起禁掉了，`index.html` 里连 `<script>` 标签都没有——浏览器里 JS 一次都没执行过，所以徽标永远停在 HTML 里写死的"未连接"、点"连接服务/进入场景"完全没反应（事件根本没绑定）。现在 `index.html` 末尾是 `<script type="module" src="./app.js"></script>`，并有 3 条测试守着：必须恰好一个模块脚本且指向 `./app.js`、页面引用的本地文件都真实存在、静态服务器交付的页面能真的取到这个脚本（防"页面变静态"回归）。**打开页面前请先 Ctrl+F5 强刷一次**（服务器已发 `Cache-Control: no-store`，但旧标签页需要手动刷新）。
- **页面在哪**：`http://127.0.0.1:5173`（第 1 节写服务地址，默认 `http://127.0.0.1:8787`）。这是本地静态服务器，必须先起 `node apps/web/dev-server.mjs`，直接双击 `index.html` 会因为 ES 模块与相对路径限制跑不起来。
- **点了"连接服务"没反应（失败信息不可见，10-16 上午修）**：现在连接失败时，顶部徽标立刻变成红色"连接失败"，按钮正下方状态行写明原因（带错误码，如 `[NETWORK_ERROR]`）和下一步——通常是模拟服务没启动，先跑 `npm run mock` 再点一次。成功后状态行显示"已连接 <地址>（本地会话已建立）"，徽标变"模拟 mock"。
- 连接失败时"发送"按钮保持锁定，这是刻意的：未连上不发请求，避免用户以为发出去了。

## 真实浏览器走查（2026-10-16 晚补，B）

此前"交互只做了源码级与 HTTP 级验证"，这一轮用本机 Edge 155 的无头模式真跑了一遍，**并因此发现一个致命缺陷**：

- **缺陷：页面在任何浏览器里都连不上服务**。`lib/api.mjs` 写的是 `await this.fetchImpl(...)`；浏览器原生 `fetch` 是 WebIDL 操作，receiver 必须是 `Window`，这样调用会抛 `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`，被 `catch` 吞成 `[NETWORK_UNREACHABLE]`。Node 的 `fetch` 不校验 receiver，所以 57 个用例全绿、curl 打 HTTP 也全 200，页面里却**一个请求都没发出去**（`performance.getEntriesByType('resource')` 里没有 8787 记录）。已改为无 receiver 调用，并加回归用例（stub 在 `this !== undefined` 时抛同样的 TypeError，旧写法必失败）。
- **怎么复现证据**：前两个终端起好后跑 `node apps/web/tools/browser-walkthrough.mjs`（默认输出 `docs/submission/screenshots/mock-walkthrough/`，可用 `--out` 改）。脚本依次：等自动连上 mock → 点地图"图书馆" → 等建议 → 点"接受并开始任务" → 点"完成" → 换形象为小羊；每步截图，结束打印网络失败与控制台错误。
- **2026-10-16 晚实测**：Edge `Edg/155.0.4283.45`；状态行 `已连接 http://127.0.0.1:8787（本地会话已建立）`；建议 / 接受 / 完成 / 换形象四步都按预期出现；`网络失败：无`；控制台只有一条可选 `config.json` 404（该文件默认不存在且已 gitignore，`loadConfig()` 已 catch 并回落默认地址，属预期）。
- **首屏宠物**：走查发现收到响应前宠物区是个空框，改为默认 `idle` 待机（标签写明"待机（默认，尚未收到服务响应）"），服务返回 `pet_action` 后照旧覆盖。

## 宠物动作贴图（2026-10-16 增补；同日晚扩到 4 只形象，B）

旧原型 `legacy/prototype/动物基础动作GIF/` 的 **4 只宠物 × 7 个动作 = 28 个 GIF 已全部转码接入**，放在 `assets/pet-ui/pet-<kind>-<action>.webp`（`kind` = `dog`/`turtle`/`cat`/`sheep`；512×512、透明底、12 帧、83 ms/帧≈1 s 循环、单文件 159–254 KB、合计 5.62 MB）。统一由 `tools/convert-legacy-pets.py` 生成（读 legacy 只读、写 `apps/web/assets/pet-ui/`），参数与来源逐条登记在 `content/assets/pet-ui/source-register.csv`（28 + 1 行）。第 4 节新增"宠物形象"下拉，可在 4 只之间切换。

- 换图规则：按"当前形象 + 服务返回的 `pet_action`"换图；两个白名单（`PET_KIND_LABELS` 的 4 个形象、`PET_ACTION_LABELS` 的 7 个动作）都命中才取文件名，否则收起图片、只用文字，不猜路径、不拼字符串。形象选择与本地存储恢复都要过 `view.knownPetKind()`，白名单外一律回落默认小狗。
- 预览规则：`state.petPreview` 默认开——首屏先用 `idle` 占位，用户换形象时也立刻给该形象的 `idle`，**都不发任何请求**；收到服务响应后一律以 `pet_action` 为准（见 `DECISIONS.md` 第 31 条）。
- 失败降级：贴图 404 或被拦截时只收起图片，宠物区提示退回纯文字，聊天、建议、任务不受影响；页面依旧零外部 CDN。
- 已核对的细节：28 个文件全部是 512×512 动画 WebP（含 `ANIM` 块）、四角 alpha=0（真透明底）、底边统一对齐 y=500（跨形象、跨动作基线一致）；`思考` 自带的白色问号经与源 GIF 第 40 帧比对确认为原始设计元素（非转码残影），因此把 think 底色加深到 `#e7eefb`，否则纯白问号在近白底上看不见。
- favicon：`favicon.png`（512×512 透明调色板 PNG，27.8 KB）由同一张贴图首帧裁切，`index.html` 用相对路径引用。
- 素材来源未提供（旧原型历史文件），是否进提交材料需 A 决定；旧项目的 `.ogg` 音频本轮未引入；拍立得相框与 `3334.jpg` 实测后本轮不接入（理由见 `content/assets/pet-ui/README.md`）。

## 校园地图（2026-10-16 增补，B）

第 3 节新增"校园地图（AI 生成示意）"：`assets/campus/map-campus.webp`（2000×908 静态 WebP，315.3 KB，单文件预算 400 KB），由旧原型只读源图 `legacy/prototype/map.png` 经"去水印 → 擦顶部文案 → 裁 16 px 边框 → LANCZOS 缩放到 2000 宽 → WebP q74"得到。

- **来源如实标注**：源图右下角自带"千问AI生成"水印，文件带 AIGC 元数据（`ContentProducer=001191440101MA9Y9T4H7A00000`、`ProduceID=u:1767869599896599535/task:...`）→ 属 **AI 生成内容**，不是手绘也不是实拍；生成者账号与授权说明未提供，登记表 `status` 写"已接入网页（AI 生成／来源未提供）"。成品保留 AIGC 元数据（XMP 块）。
- **页面口径**：`alt` 与 `figcaption`（`#campus-map-note`）里是 HTML 静态文本——"AI 生成示意插画""非精确导航，不代表真实校区地标的位置与距离""站牌数字属 AI 装饰"；标注不依赖脚本，JS 挂了也不会丢。
- **降级**：图片 404/被拦截时只收起图片、显示 `#campus-map-fallback` 文字，场景下拉、"进入场景"、聊天、建议、任务照常可用。
- **地标交互**：4 个地标按钮（宿舍/图书馆/操场/食堂）＝选中场景 + 复用已有 `enterScene()` 发送 `scene_enter`，契约与接口零改动；场景值先过 `view.knownScene()` 白名单，白名单外只打日志不发请求；页面依旧零外部 CDN、不读取定位。
- **未核实**：校区名称、地标真实位置与距离；能否进提交材料由 A 决定（授权未核实）。

## 还没做的（不要当成已完成）

- 真实浏览器主流程已在 Edge 155 无头模式走过（`tools/browser-walkthrough.mjs`，2026-10-16 晚）；仍缺**人工手动点一遍**（鼠标/键盘真实事件）与另一台设备上的体验记录。
- 未接 A 的 live 服务，所有结果都是 mock。
- 宠物有 4 只形象 × 7 个动作贴图（旧原型素材转码，可切换），但没有合拍、相机与换装；拍立得相框与 `3334.jpg` 实测后本轮不接入（理由见 `content/assets/pet-ui/README.md`）；登记表已补 28 + 1 行。
- 手机尺寸、无障碍朗读、长列表滚动未专门验证。

