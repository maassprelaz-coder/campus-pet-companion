# B岗交接记录

更新时间：2026-10-16。状态：第一版可运行骨架（web-0.1.0）已提交到 `feat/web`，未接真实服务；标"未核实"的都还没拿到准确信息，不能当已确认。A 侧平台与服务截至本日仍为 0，见文末"给 A 的需求清单"。

- 任务ID与负责人：B（Seventy / zhaozishi123）——网页主流程 v1 骨架，对应[任务卡](../../assignments/B_web.md)第 3–5 条。
- 分支/提交或平台版本：`feat/web`（已推 `origin/feat/web`），提交 `556c4a6`「feat(web): 搭建 mock 环境下的网页骨架，完成主流程与边界状态测试」，工作树干净。改动文件：`apps/web/{app.js,index.html,styles.css,dev-server.mjs,config.example.json,DECISIONS.md,README.md}`、`apps/web/lib/`、`apps/web/tests/`。没有动旧成员历史，也没有强推。（10-15 记录时上述改动尚未提交；10-16 复核已提交，故更正此行。）
- 已完成：
  1. 页面主流程可跑：连接会话 → 文字/场景输入 → 看建议 → 接受或拒绝 → 任务显示与刷新恢复 → 完成反馈。
  2. 状态覆盖：未连接、连接中（等待）、无建议（空）、失败可重试、权限拒绝、刷新恢复失败。
  3. 契约 v0.1 客户端与视图模型拆成可测模块；幂等键稳定，401 自动重建会话后原样重发；拒绝建议不发请求，页面不自行加积分、不自动发送草稿，模型与用户文本一律 `textContent`。
  4. 本地静态服务器固定 5173、只监听 127.0.0.1、带目录穿越防护。
  5. 测试 33 个用例全部通过（含真实启动 `tools/mock-api.mjs` 的端到端）。（这是 10-15 首次提交时的数字；增量 1 后 37、增量 2 后 44、增量 3 后 50、增量 4 后 53。）
- 未完成：真实服务联调；宠物合拍/相机（P2，未做）；手机尺寸与无障碍专门验证；真实试用记录；提交材料。（校园地图已于 10-16 落盘接入，见下文"增量 2"。）
- 启动和操作步骤：
  ```
  npm run mock                                  # 终端一：http://127.0.0.1:8787
  node apps/web/dev-server.mjs                  # 终端二：http://127.0.0.1:5173
  node --test "apps/web/tests/**/*.test.mjs"    # 53/53（10-16 增量 4 后：原 33 → 37 → 44 → 50 → 53）
  ```
  浏览器开 `127.0.0.1:5173` → 点"连接宠物" → 输入内容并选场景 → 发送 → 接受或拒绝建议 → 看任务 → 完成任务看反馈 → 刷新页面确认任务状态恢复。
- 实际验证及环境（区分模拟与真实）：
  - 环境：Windows，Node v24.20.0（`node` 已在 PATH，直接执行即可；A 用标准 Node ≥22 均可）。10-16 更正：此前写的"本机 `node` 不在 PATH、只能用 IDE 自带 node.exe"已不成立。
  - 模拟链路：`npm run mock` 起 8787 后，`/health` 返回 `{"mode":"mock","message":"仅本地联调；无真实智能体、存储或积分"}`；8787 预检响应带 `Access-Control-Allow-Origin: http://localhost:5173` 与 `Allow-Headers: Content-Type, X-Demo-Session, Idempotency-Key`。
  - 静态页：`http://127.0.0.1:5173/` 返回 200，含 `mode-badge` 模拟标识。
  - 端到端（自动化，真实 HTTP）：会话 → 事件（library 场景返回 `focus_25`/1500 秒建议）→ 接受（任务 `active`）→ 查询（同一 task_id）→ 完成（`points_awarded: 0` + 显式警告、状态 `completed`）→ `task_completed` 事件返回 `strategy: feedback` 且无建议；`scene_enter` 且关闭主动建议时无建议；跨会话取任务 404 `TASK_NOT_FOUND`；非白名单 Origin 403 `ORIGIN_NOT_ALLOWED`；非法场景 400 `INVALID_EVENT`；`/api/v1/memory` 501（记忆关闭）。
  - **未验证**：没有用真实浏览器点击走查（本机无无头浏览器），DOM 交互只有源码级断言；没有真实 GeniOS/服务端参与，以上结论全部属于模拟环境。
- 文件、截图、录屏、来源：新增与修改文件见上；无截图与录屏；页面仍不含任何外部字体/图片/CDN，宠物贴图走仓库内相对路径（见下节）。素材登记 `content/assets/pet-ui/source-register.csv` 已补 7 行（小狗 7 个动作）。
- 接收者及对方可继续做什么（给 A）：
  1. 按上文命令在本机复现，确认 8787+5173 跑通；若换端口，需同步改 mock 的 Origin 白名单。
  2. 交 live 服务地址与字段/错误码表后，B 只改 `apps/web/config.json`，不动页面逻辑。需你确认的错误码命名：`NO_LOCAL_SESSION`、`TASK_NOT_FOUND`、`ORIGIN_NOT_ALLOWED`、`INVALID_EVENT`、`SUGGESTION_NOT_FOUND`、`INVALID_ACCEPT`、`INVALID_COMPLETE`。
  3. 确认 live 是否同样要求 `preferences.remember === false`；若允许 `true`，需先给出授权、删除与验收口径，B 再开。
  4. 决定是否把 `apps/web` 的测试并入根 `npm run check`。
- 阻塞、依赖和最晚需要时间：
  - 真实服务地址 + 字段/错误码确认：最晚 16 日上午（否则真实联调只能压到 16 日当天）。
  - 宠物形象方案（贴图/动画/合拍）与素材许可口径：16 日。
  - 截止时刻、飞书提交入口/模板、评审访问方式：**未核实**。仓库内 `docs/REQUIREMENTS.md`、`docs/evidence/` 的 PDF/JPG 读不出可执行时刻，按任务卡要求写"未核实"，请 A 用报名账号确认后回填，不要默认午夜。
- 下一步（B）：16 日接 live 服务并压失败/重试路径；整理试用记录并组织自愿试用；随后做截图与录屏。（校园插画已于 10-16 落盘接入，见下文"增量 2"。）

## 2026-10-16 增量 1：宠物动作贴图接入（B）

- 版本/分支：在 `feat/web` 上继续，工作树为未提交改动（改动文件见下），未强推、未改队友历史。
- 改动文件：`apps/web/index.html`、`apps/web/app.js`、`apps/web/styles.css`、`apps/web/lib/view-model.mjs`、`apps/web/tests/pet-assets.test.mjs`（新增）、`apps/web/assets/pet-ui/pet-dog-*.webp`（新增 7 个）、`apps/web/{README.md,DECISIONS.md}`、`content/assets/pet-ui/{source-register.csv,README.md,ART_BRIEF.md}`。
- 做了什么：把旧原型 `legacy/prototype/动物基础动作GIF/小狗GIF/` 的 7 个动作 GIF 转成动画 WebP（512×512、透明底、12 帧、83 ms/帧≈1 s 循环、q70、底边统一对齐 y=500），共约 1.62 MB；页面按服务返回的 `pet_action` 换图，动作不在白名单就收起图片只用文字，贴图加载失败只影响画面，聊天/建议/任务/积分不受影响。契约与接口零改动（只读服务返回的 `pet_action`）。
- 回归与验证（真实命令输出，非推断）：
  - `node --test "apps/web/tests/**/*.test.mjs"` → **37/37 通过**（原 33 + 新增 4：贴图存在与格式、体积预算、白名单外不猜路径、页面换图与降级分支）。（本轮数字；增量 2 落地后为 44/44。）
  - `npm run check` → 1/1 通过（mock 端到端无回归）。
  - 起 `node apps/web/dev-server.mjs` 后用 HTTP 实测：7 个贴图全部 `200 / image/webp`（233944 / 217786 / 248104 / 259610 / 247336 / 208754 / 243372 字节）；`/` 含 `pet-image` 与 `pet-asset-note`；`/app.js` 含 `renderPet`、`wirePetAsset`；不存在的贴图返回 **404**（即页面降级分支的真实触发条件）。随后已停止该服务器进程。
  - 贴图本体自检：RIFF/WEBP、含 `ANIM` 块、画布 512×512、单文件 203.9–253.5 KB（需求单预算 ≤300 KB）、四角 alpha=0（真透明底）、7 个动作首帧底边同为 500（跨动作基线一致）。
- 接收人（A）可继续做什么：
  1. 按上文两条命令复现（37/37 与 1/1），再看 `http://127.0.0.1:5173` 的宠物区是否出现小狗贴图。
  2. 决定这 7 个"来源未提供"的旧素材能否进提交材料：登记表 `status` 列已如实写"已接入网页（来源未提供）"；若提交清单卡"素材来源已核实"，需换 CC0 素材或让美术重画，B 只改 `PET_ASSET_FILES` 一处映射即可替换。
  3. 若同意，B 再补截图/录屏（同一版本）。
- 遗留问题：旧项目来源不明的 `.ogg` 音频本轮未引入（提交材料需剔除）；小龟/猫咪/小羊 3 只未转码（备用）；校园插画 B 级接入待落盘（**已于增量 2 完成**）；真实浏览器点击走查仍未做（本机无无头浏览器），以上均未计入"已完成"。

## 2026-10-16 增量 2：校园地图 B 级接入（B）

- 版本/分支：在 `feat/web` 上继续（未强推、未改队友历史）；工作树含增量 1 + 增量 2 的未提交改动。
- 改动文件：`apps/web/index.html`（新增第 3 节"校园地图（AI 生成示意）"，其后各节序号顺延至 12）、`apps/web/app.js`（`showCampusMap`/`wireCampusMap`）、`apps/web/styles.css`（`.campus-map*`、`.map-hotspot`）、`apps/web/lib/view-model.mjs`（新增 `knownScene`，并收紧 `petAssetFile`）、`apps/web/tests/campus-map.test.mjs`（新增）、`apps/web/assets/campus/map-campus.webp`（新增）、`apps/web/{README.md,DECISIONS.md}`、`content/assets/campus/{source-register.csv,README.md}`。
- 做了什么：
  1. 地图落盘：从只读源图 `legacy/prototype/map.png`（3840×1760、10.9 MB）重跑"去水印 → 擦顶部文案 → 裁 16 px 边框 → LANCZOS 2000×908 → WebP q74 method=6"，成品 **315.3 KB**；保留源图自带 AIGC 元数据（写入 XMP 块）。
  2. 页面接入：独立小节 + 仓库内相对路径 `./assets/campus/map-campus.webp`；AI 生成标注与"非精确导航"写在 HTML 静态文本（`alt` + `figcaption`），不依赖脚本。
  3. 降级：图片 `error` 或被拦截时只收起图片并显示文字兜底；额外用 `image.complete` 覆盖"监听器挂上之前就已失败/已完成"的情况。
  4. 地标交互：4 个地标按钮（宿舍/图书馆/操场/食堂）＝选中场景 + 复用现成 `enterScene()` 发 `scene_enter`；契约与接口零改动，场景值先过 `view.knownScene()` 白名单。
- 素材与合规（如实记录，供 A 决定能否进材料）：
  - 源图**是 AI 生成内容**：右下角自带"千问AI生成"水印，文件带 AIGC tEXt（`ContentProducer=001191440101MA9Y9T4H7A00000`、`ProduceID=u:1767869599896599535/task:ce0b053fe6394229b5d8b61373a6732b/...`）；**不是手绘、也不是实拍**。
  - 生成者账号与授权说明未提供 → 登记 `status` 写"已接入网页（AI 生成／来源未提供）"，与宠物贴图同口径；页面口径只写"示意"，图上站牌数字属 AI 装饰，校区名称/地标位置/距离一律未核实、不进材料。
- 回归与验证（真实命令输出，非推断）：
  - `node --test "apps/web/tests/**/*.test.mjs"` → **44/44 通过**（增量 1 后 37 + 新增 7：成品尺寸与静态块、AIGC 元数据保留、静态标注与相对路径、地标与契约白名单一致、失败降级＋复用 `scene_enter`、`knownScene` 白名单、原型链名字不认）。
  - `node --test tools/mock-api.test.mjs`（即 `npm run check` 的内容；本会话 `npm` 不在 PATH，直接跑 node）→ **1/1 通过**。
  - 成品自检：`RIFF/WEBP` + `VP8X`（flags=0x04，表示带 XMP）+ `VP8 ` + `XMP `；画布 2000×908；无 `ANIM`（静态图）；RIFF 长度字段 322860 与实际文件大小一致；`VP8 ` 载荷 sha256 与已目视验收版本一致（`acce3851d120c1a5`）——只做过一次有损压缩。
  - HTTP 实测（起 `node apps/web/dev-server.mjs` 后）：`/assets/campus/map-campus.webp` → **200 / image/webp / 322860 字节**；`/` → 200 且含 `id="campus-map"`、`id="campus-map-note"`、`id="campus-map-fallback"`、`data-scene="library"`、"非精确导航"；`/app.js` → 含 `wireCampusMap`、`view.knownScene`；`/styles.css` → 含 `.campus-map`；不存在的 `map-campus-missing.webp` → **404**（正是降级分支的触发条件）。随后已停止该服务器进程。
  - 目视复核（成品本体、6 倍放大）：去水印补丁区与周边背景一致、无可见残影；顶部条带无字形残留。
- 未验证：没有真实浏览器点击走查（本机无无头浏览器），地标点击与降级分支目前只有源码级断言 + HTTP 级检查；地标复用的 `scene_enter` 路径只在 mock 端到端用例里覆盖（直接 HTTP 调用，不是按钮点击）；未接真实服务。
- 遗留：旧项目来源不明的 `.ogg` 音频未引入（提交材料需剔除）；小龟/猫咪/小羊 3 只贴图未转码（备用）；作品介绍里"GPS 寻路/自动定位"的表述待 B 自写提交版时落实删改（`docs/submission/` 目前只有 CHECKLIST.md）。

## 2026-10-16 增量 3：连接状态可见性缺陷修复 + 页面脚本行为测试（B）

- 触发来源：用户（A）实测反馈——在 `http://127.0.0.1:5173` 看到顶部"未连接"，点"连接服务/进入场景"后页面**没有任何变化**，以为是按钮坏了。
- 实测原因（不是猜的）：页面"连接失败"的信息原来只写在最下面的第 8 节"错误与重试"，顶部徽标仍停在"未连接"；用户点击后看不到任何反馈。真实失败原因只是模拟服务没启动（8787 无监听）。复现证据：诊断脚本把地址指到已释放端口后，1.5 秒内页面连接失败但徽标/状态行都不变；把地址指到运行中的 mock 时才显示"模拟 mock"。
- 版本/分支：`feat/web`，HEAD 仍为 `556c4a6`（本增量与前两个增量同属**未提交的工作树改动**）；未强推、未改队友历史，未动公共接口与契约。
- 改动文件：`apps/web/app.js`（新增 `state.connect`；`connectSession` 记录 `pending/ok/failed` 并在失败时置 `mode='error'`；`renderConnection` 改用新状态行；发送提示语按"未连接"判断）、`apps/web/lib/view-model.mjs`（新增 `connectStatusView`；`MODE_LABELS` 增 `error: 连接失败`；`modeNotice('error')`；`sendLocked` 收紧为未连接/失败/等待都锁）、`apps/web/index.html`（状态行加 `data-tone`/`role="status"`/`aria-live="polite"`）、`apps/web/styles.css`（`.badge[data-mode="error"]`、`#health-text[data-tone=err|ok|warn]`）、`apps/web/tests/app-flow.test.mjs`（**新增**，DOM 桩跑真实 `app.js`）、`apps/web/tests/view-model.test.mjs`（+3 用例）、`apps/web/{README.md,DECISIONS.md}`。
- 做了什么：
  1. 连接失败时顶部徽标立刻变红色**"连接失败"**；按钮正下方状态行显示"连接失败：<原因，含错误码>｜请确认已运行 npm run mock（127.0.0.1:8787）…详细错误与重试按钮在第 8 节"；连接中显示"正在连接 …"；成功显示"已连接 <地址>（本地会话已建立）"。状态只由真实请求结果驱动，失败时绝不会显示"模拟 mock"。
  2. 新增 `apps/web/tests/app-flow.test.mjs`：最小 DOM 桩 + **真实启动** `tools/mock-api.mjs`（随机端口）+ 真实 HTTP，3 个用例：①连接失败可见（本次缺陷的回归用例）②连上后"点地图图书馆地标 → 收到 focus_25 建议 → 接受 → 完成"与宠物贴图换图（`pet-dog-happy.webp`）、发送按钮解锁/锁定 ③服务中途停掉后发送显示可重试失败并出现重试按钮。
- 回归与验证（真实命令输出，非推断）：
  - `node --test "apps/web/tests/**/*.test.mjs"` → **50/50 通过**（10-16 增量 2 后为 44；本增量 +6：新增 `app-flow.test.mjs` 3 个、`view-model.test.mjs` 由 10 增至 13 个）。另 `node --test tools/mock-api.test.mjs` → **1/1 通过**，即全部测试文件合计 **51/51**。单跑 `node --test apps/web/tests/app-flow.test.mjs` → **3/3 通过，365 ms**。
  - HTTP 实测（对**当时正在运行的** `apps/web/dev-server.mjs`，未重启进程，静态服务每请求读盘）→ `/` 含 `data-tone="muted" role="status"`：True；`/app.js` 含 `connectStatusView`：True、含 `state.mode = 'error'`：True；`/styles.css` 含 `#health-text[data-tone="err"]`：True。
  - 测试自身踩到并修掉的坑（已写进 `apps/web/DECISIONS.md` 第 22 条）：包装 `globalThis.fetch` 未 `bind` 原函数导致自我递归爆栈（当时表现为"页面连不上 mock"，实际是测试桩的错）；桩的 `textContent` 必须是纯文本，否则 `textContent +=` 会重写整棵子树；`server.close()` 需配 `closeAllConnections()`，否则 keep-alive 连接让测试进程挂住（实测挂过一次）。
- 未验证：**仍没有真实浏览器点击走查**（DOM 桩能验逻辑、验不了布局与 CSS），真实浏览器这一条继续记"未验证"；未接 live 服务，以上全部属于 mock 环境。
- 遗留：`config.json` 不存在时页面仍默认 8787（A 交 live 地址后只改配置）；连接失败时状态行不可点击跳转到第 8 节（目前是文字指引）；其余同增量 2。
- 接收人（A）现在可以做的：刷新一次 `http://127.0.0.1:5173`（服务已在 8787/5173 运行时）→ 点"连接服务"，顶部应显示"模拟 mock"、按钮下方显示"已连接 …"；再点第 3 节地图上的"图书馆"地标，应出现 25 分钟建议并可接受/完成。若先把 `npm run mock` 停掉再刷新，应看到红色"连接失败"与可照做的下一步提示，而不是"没反应"。
- **本增量的成因判断随后被增量 4 修正**：用户看到的是静态初始文案，说明页面从未执行 JS（真因是 `index.html` 缺 `<script>` 标签）。本增量修的失败可见性本身有效、保留，但它不是当时现象的原因，详见[增量 4](#2026-10-16-增量-4真根因页面从未加载-appjsb)。

## 2026-10-16 增量 4：真根因——页面从未加载 `app.js`（B）

- 触发来源：A 再次反馈"为什么还是这样啊"并附第二次截图。截图内容与第一次一致：徽标"未连接"、提示"尚未连接到服务。"、按钮下方状态行空白。
- 实测原因（有据，不是猜的）：
  1. 截图里那三处文字**逐字等于** `index.html` 里的静态初始文案（`index.html:13`、`:16` 写死的"未连接"/"尚未连接到服务。"，`#health-text` 静态为空）→ 说明浏览器**从未执行 `app.js`**，事件根本没绑定，所以"连接服务/进入场景"全都没反应。
  2. `Select-String -Path apps/web/index.html -Pattern '<script'` → **0 条命中**；`git show 556c4a6:apps/web/index.html | Select-String '<script'` → **同样 0 条命中**，即**从 v1 骨架提交起页面就是纯静态 HTML**，不是本次改动引入的回归。
  3. 成因：`tests/page-safety.test.mjs` 原断言 `/<script[^>]+src=/.test(pageHtml) === false` 本意是"禁外部 CDN"，却把所有本地 `<script src>` 一起禁掉——于是页面的"合规"方式就是不要脚本标签。**这条断言等于亲手把页面焊成了静态页**，而当时的页面测试只做字符串断言，没有任何一条会因此失败。
  4. 排除项（避免误判）：静态服务器**已发** `Cache-Control: no-store`，不存在浏览器长期缓存旧文件的问题；`loadConfig()` 有 try/catch，不会吞掉初始化；`node --check` 与测试全绿，`app.js` 语法与逻辑无异常——唯一缺的就是"没人加载它"。
- 版本/分支：`feat/web`，HEAD 仍为 `556c4a6`（增量 1–4 都还是**未提交的工作树改动**）；未强推、未改队友历史、未动契约与公共接口。
- 改动文件：`apps/web/index.html`（`</body>` 前加 `<script type="module" src="./app.js"></script>`）、`apps/web/tests/page-safety.test.mjs`（改断言意图 + 新增 2 用例）、`apps/web/tests/app-flow.test.mjs`（新增 1 条真实 HTTP 用例）、`apps/web/{README.md,DECISIONS.md}`。
- 回归与验证（真实命令输出，非推断）：
  - `node --test "apps/web/tests/*.test.mjs"` → **53/53 通过、0 失败**（增量 3 后为 50；本增量 +3：页面安全 +2、页面脚本行为 +1）。日志：`tests 53 / pass 53 / fail 0`。
  - HTTP 实测（对**正在运行的** 5173 静态服务器，未重启进程）→ `/` 返回 200、`Cache-Control: no-store`，正文含 `<script type="module" src="./app.js"></script>`；`/app.js` 返回 200、`Content-Type: text/javascript; charset=utf-8`、内容含 `connectStatusView`。
  - 新增用例覆盖：①必须恰好一个脚本标签、`type="module"`、`src="./app.js"`、位于 `</body>` 前；②页面引用的本地脚本/样式/图片都真实存在；③真实起静态服务器取 `/`、提取脚本地址、取回并校验 200 与 JS 内容类型（防"页面变静态"回归）。
- 未验证：**仍没有真实浏览器点击走查**（本机无无头浏览器）；上述 3 条测试只能证明"页面会去加载脚本且脚本能取到"，不能证明真实浏览器里交互一定生效。未接 live 服务，全部属于 mock 环境。
- 遗留：CSS 布局/滚动/移动端尺寸仍未验证；连接失败时状态行不可点击跳转到第 8 节（目前是文字指引）；其余同增量 2/3。
- 接收人（A）现在可以做的：**先 Ctrl+F5 强刷** `http://127.0.0.1:5173`（旧标签页必须手动刷新）→ 此时页面顶部徽标应不再是写死的"未连接"：mock 在跑就显示"模拟 mock"+"已连接 <地址>（本地会话已建立）"；mock 没跑就显示红色"连接失败"+ 下一步命令。之后点第 3 节地图"图书馆"地标应出现 25 分钟建议。如果强刷后仍是旧的静态画面，请把浏览器控制台（F12 → Console）里的报错发我，那属于另一个问题（如脚本被拦截），我再查。



## 2026-10-16 增量 5：4 只宠物形象全部接入 + favicon（B）

- 触发来源：队长（A）10-16 确认"现有素材能用的直接用、不用再纠结来源"。据此不再去 GitHub 找外部图，直接把旧原型已有的 4 只 × 7 动作全部用上。
- 版本/分支：`feat/web`，HEAD 仍为 `556c4a6`；本增量与增量 1–4 同属**未提交的工作树改动**（未强推、未改队友历史，契约与接口零改动）。
- 改动文件：`apps/web/{index.html,app.js,styles.css,lib/view-model.mjs}`、`apps/web/assets/pet-ui/pet-{turtle,cat,sheep}-*.webp`（新增 21 个）、`apps/web/favicon.png`（新增）、`apps/web/tests/{pet-assets,view-model,app-flow,page-safety}.test.mjs`、`apps/web/{README.md,DECISIONS.md}`、`tools/convert-legacy-pets.py`（新增）、`content/assets/pet-ui/{source-register.csv,README.md,ART_BRIEF.md}`。
- 做了什么：
  1. **素材**：新增可复现脚本 `tools/convert-legacy-pets.py`（Python 3.12 + Pillow 12.3.0），把旧原型小龟/猫咪/小羊各 7 个 GIF 转成 512×512 透明底动画 WebP（12 帧均匀抽样、83 ms/帧、无限循环、q70 method=6、底边统一对齐 y=500），与已验收的小狗口径完全一致；小狗 7 张保持原样未重跑。**28 个贴图单文件 159.1–253.5 KB（预算 ≤300 KB），合计 5.62 MB**，全部通过脚本自带 `--check` 体检（512×512 / 含 `ANIM` 块 / 四角 alpha=0）。
  2. **页面**：第 4 节新增"宠物形象"下拉（小狗/小龟/猫咪/小羊）；`view.petAssetFile(action, kind)` 要求形象与动作**双白名单**命中，否则不显示贴图；本地存储与下拉值一律过 `view.knownPetKind()`（白名单外回落小狗）；换形象时先用 `idle` 给一眼预览、**不发任何请求**；换图判重 key 改为"形象/文件名"。
  3. **favicon**：`--favicon` 从 `pet-dog-idle.webp` 首帧裁切生成 `apps/web/favicon.png`（512×512 透明调色板 PNG 27.8 KB），`index.html` 相对路径引用。
  4. **实测后不接入**（有数据）：拍立得相框 4 张是竖版约 5:8（604×953 / 1163×1819 / 1190×1848 / 1159×1742，透明像素占 61–64%、四角与中心透明），与 512×512 正方形贴图不匹配且本轮没有相机/合拍流程；`3334.jpg`（1204×1484 RGB）来源与用途不明；两个 `.ogg`（约 2.2 MB / 0.95 MB）内容不明。理由与数据已写进 `content/assets/pet-ui/README.md`、`ART_BRIEF.md`、`DECISIONS.md` 第 27 条。
- 回归与验证（真实命令输出，非推断）：
  - `"C:\Program Files\nodejs\node.exe" --test "apps/web/tests/*.test.mjs" tools/mock-api.test.mjs` → **58/58 通过**（网页 57 + mock 1）。相比增量 4 的 54：新增 3 个用例（4 形象 × 7 动作贴图 + 整套体积上限、形象白名单与回落、换形象 DOM 端到端：切换立刻给预览贴图 + 随后动作用同一只 + 写进 localStorage）+ 1 个 favicon 用例；原"7 个动作"用例扩成 28 个文件的校验。
  - `python tools/convert-legacy-pets.py --check --kinds dog,turtle,cat,sheep` → **28/28 ok，不合规范 0 个**（每行输出画布 512×512、`animated: True`、帧数、时长 83、loop 0、四角 alpha=[0,0,0,0]、含 `ANIM` 块）。
  - favicon 实测：`512×512`、`mode P`、`28463` 字节、四角 `(0,0,0,0)`、透明像素占 28.1%。
  - 静态服务器 HTTP：新贴图 `./assets/pet-ui/pet-cat-idle.webp` → **200 / `image/webp`**（用例在真实 HTTP 上断言，取代只查文件存在）。
- 未验证：真实浏览器点击走查（本机无无头浏览器）——4 只形象的切换动画效果、透明底与浅底的观感都还没有真人目视确认；请 A 强刷 `http://127.0.0.1:5173` 后反馈。
- 遗留问题：素材来源仍为"旧原型历史文件、未提供许可"（队长已决定先用；进提交材料的措辞仍由 A 定）；合拍/相机未做（相框素材已盘点并给出"要 1:1 窗口版"的需求）；本增量相关改动**全部仍未提交**——工作树现有 13 个已跟踪文件被修改（本增量 11 个，另 2 个属增量 2 的校园地图素材）+ 8 个未跟踪条目（其中 `apps/web/assets/` 内含 28 个 WebP），`feat/web` HEAD 仍停在 `556c4a6`。
- 接收人（A）可继续做什么：①按上文命令复现 58/58；②打开 5173 在"4. 宠物与动作"里切换 4 只形象，看预览贴图与动作贴图是否都跟着变；③确认这 28 张 + favicon 能否进提交材料（登记表 `status` 均写"已接入网页（来源未提供）"）。

## 给 A 的需求清单（2026-10-16 更新，最晚 16 日上午；逾期 B 的联调、试用与材料整体顺延）

本节合并上面第 28–36 条的要点，A 只需看这一节。截至 2026-10-16，A 侧仍为 0：`agent/PLATFORM_CHECK.md` 九项全部"未验证"、`docs/handoffs/A/current.md` 仍是空模板（全"待填写"）、`services/api/` 只有 README。因此第 1 条是当前唯一总阻塞。

| # | 需要 A 提供 | 影响 | 最晚 |
| --- | --- | --- | --- |
| 1 | 真实 NK-GeniOS **能否被外部调用**，以及已发布的**体验 URL** | 决定 B 的路线：能外接→B 接 live；**不能外接→B 停止在 `apps/web` 继续投入，改走平台内体验**（比赛 R2 硬要求"必须填写智能体URL"） | 16 日上午 |
| 2 | live 服务地址、启动方式（无密钥）、字段与错误码表是否与 mock 一致 | B 只改 `apps/web/config.json`，不动页面逻辑 | 16 日上午 |
| 3 | live 下 `preferences.remember` 是否仍必须为 `false` | 若允许 `true`，需先给授权/删除/验收口径，B 再开 | 16 日 |
| 4 | 用**另一台设备/非开发者账号**打开体验 URL 的步骤与网络条件 | B 据此核对"评审可直接点击体验"，并用于视频/截图同一版本 | 17 日 |

需 A 确认的错误码命名：`NO_LOCAL_SESSION`、`TASK_NOT_FOUND`、`ORIGIN_NOT_ALLOWED`、`INVALID_EVENT`、`SUGGESTION_NOT_FOUND`、`INVALID_ACCEPT`、`INVALID_COMPLETE`。

**不在本表、由 B 自己核对**（不推给 A）：飞书全文、准确截止时刻、提交入口、申报模板、评审访问方式，见[B任务卡](../../assignments/B_web.md)第 2 条。未取得就写"未核实"，不默认午夜。

**这 4 条到位前 B 并行做（不等 A）**：真实浏览器点击走查并修 UX（本机无无头浏览器）；旧宠物素材盘点与登记（已完成，见"增量 1"）；校园地图接入（已完成，见"增量 2"）；试用记录准备（`content/pilot/`，暂无人数是正常的）；材料提纲。视觉/合拍等增强排在核心链路之后，只做一个。

与 A 沟通用的 PR 描述草稿见[pr-draft.md](pr-draft.md)。
