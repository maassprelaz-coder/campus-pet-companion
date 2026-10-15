# B岗交接记录

更新时间：2026-10-15。状态：第一版可运行骨架已交，未接真实服务；标"未核实"的都还没拿到准确信息，不能当已确认。

- 任务ID与负责人：B（Seventy / zhaozishi123）——网页主流程 v1 骨架，对应[任务卡](../assignments/B_web.md)第 3–5 条。
- 分支/提交或平台版本：工作区分支 `feat/integration`（A 的分支）。本次改动全部**未提交**：`apps/web/{app.js,index.html,styles.css,dev-server.mjs,config.example.json,DECISIONS.md,README.md}`、`apps/web/lib/`、`apps/web/tests/`。建议 A 拉 `feat/web` 后单独提交，我没有动旧成员历史，也没有强推。
- 已完成：
  1. 页面主流程可跑：连接会话 → 文字/场景输入 → 看建议 → 接受或拒绝 → 任务显示与刷新恢复 → 完成反馈。
  2. 状态覆盖：未连接、连接中（等待）、无建议（空）、失败可重试、权限拒绝、刷新恢复失败。
  3. 契约 v0.1 客户端与视图模型拆成可测模块；幂等键稳定，401 自动重建会话后原样重发；拒绝建议不发请求，页面不自行加积分、不自动发送草稿，模型与用户文本一律 `textContent`。
  4. 本地静态服务器固定 5173、只监听 127.0.0.1、带目录穿越防护。
  5. 测试 33 个用例全部通过（含真实启动 `tools/mock-api.mjs` 的端到端）。
- 未完成：真实服务联调；宠物贴图/动画/合拍；手机尺寸与无障碍专门验证；素材登记行（本页目前零图片依赖，故未新增）；真实试用记录；提交材料。
- 启动和操作步骤：
  ```
  npm run mock                                  # 终端一：http://127.0.0.1:8787
  node apps/web/dev-server.mjs                  # 终端二：http://127.0.0.1:5173
  node --test "apps/web/tests/**/*.test.mjs"    # 33/33
  ```
  浏览器开 `127.0.0.1:5173` → 点"连接宠物" → 输入内容并选场景 → 发送 → 接受或拒绝建议 → 看任务 → 完成任务看反馈 → 刷新页面确认任务状态恢复。
- 实际验证及环境（区分模拟与真实）：
  - 环境：Windows，Node v22.16.0（本机 `node` 不在 PATH，我用的是 IDE 自带 `node.exe`；A 在自己机器上用标准 Node ≥22 即可）。
  - 模拟链路：`npm run mock` 起 8787 后，`/health` 返回 `{"mode":"mock","message":"仅本地联调；无真实智能体、存储或积分"}`；8787 预检响应带 `Access-Control-Allow-Origin: http://localhost:5173` 与 `Allow-Headers: Content-Type, X-Demo-Session, Idempotency-Key`。
  - 静态页：`http://127.0.0.1:5173/` 返回 200，含 `mode-badge` 模拟标识。
  - 端到端（自动化，真实 HTTP）：会话 → 事件（library 场景返回 `focus_25`/1500 秒建议）→ 接受（任务 `active`）→ 查询（同一 task_id）→ 完成（`points_awarded: 0` + 显式警告、状态 `completed`）→ `task_completed` 事件返回 `strategy: feedback` 且无建议；`scene_enter` 且关闭主动建议时无建议；跨会话取任务 404 `TASK_NOT_FOUND`；非白名单 Origin 403 `ORIGIN_NOT_ALLOWED`；非法场景 400 `INVALID_EVENT`；`/api/v1/memory` 501（记忆关闭）。
  - **未验证**：没有用真实浏览器点击走查（本机无无头浏览器），DOM 交互只有源码级断言；没有真实 GeniOS/服务端参与，以上结论全部属于模拟环境。
- 文件、截图、录屏、来源：新增与修改文件见上；无截图与录屏；页面不含任何外部字体/图片/CDN，故 `content/assets/source-register.csv` 未新增行，等接入宠物贴图时再补。
- 接收者及对方可继续做什么（给 A）：
  1. 按上文命令在本机复现，确认 8787+5173 跑通；若换端口，需同步改 mock 的 Origin 白名单。
  2. 交 live 服务地址与字段/错误码表后，B 只改 `apps/web/config.json`，不动页面逻辑。需你确认的错误码命名：`NO_LOCAL_SESSION`、`TASK_NOT_FOUND`、`ORIGIN_NOT_ALLOWED`、`INVALID_EVENT`、`SUGGESTION_NOT_FOUND`、`INVALID_ACCEPT`、`INVALID_COMPLETE`。
  3. 确认 live 是否同样要求 `preferences.remember === false`；若允许 `true`，需先给出授权、删除与验收口径，B 再开。
  4. 决定是否把 `apps/web` 的测试并入根 `npm run check`。
- 阻塞、依赖和最晚需要时间：
  - 真实服务地址 + 字段/错误码确认：最晚 16 日上午（否则真实联调只能压到 16 日当天）。
  - 宠物形象方案（贴图/动画/合拍）与素材许可口径：16 日。
  - 截止时刻、飞书提交入口/模板、评审访问方式：**未核实**。仓库内 `docs/REQUIREMENTS.md`、`docs/evidence/` 的 PDF/JPG 读不出可执行时刻，按任务卡要求写"未核实"，请 A 用报名账号确认后回填，不要默认午夜。
- 下一步（B）：16 日接 live 服务并压失败/重试路径；补宠物形象与素材登记；整理试用记录并组织自愿试用；随后做截图与录屏。
