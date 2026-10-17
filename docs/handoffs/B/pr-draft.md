# PR 描述草稿：`feat/web` → `main`

> 用法：在 GitHub 从 `feat/web` 向 `main` 开 **Draft PR**，把从下面 `## 本次交付` 起的整段粘进 PR 描述。栏目照 `.github/pull_request_template.md` 填，未新增格式（依据 `CONTRIBUTING.md` 第 4、5 条）。
> 本文件由 B 维护，与交接记录 [current.md](current.md) 配套；不替代 A 的 `docs/handoffs/A/`。

---

## 本次交付

负责模块及对应任务卡：B（Seventy）—— `apps/web/`；[B任务卡](../../assignments/B_web.md) 第 3–5 条（网页主流程、状态覆盖、边界路径）。

提交：`feat/web` @ `556c4a6`

## 怎样运行和验收

命令/入口：

```sh
npm run mock                                  # 终端一：http://127.0.0.1:8787
node apps/web/dev-server.mjs                  # 终端二：http://127.0.0.1:5173
node --test "apps/web/tests/**/*.test.mjs"    # 44/44
```

打开 `http://127.0.0.1:5173` → 点"连接宠物" → 输入内容并选场景 → 发送 → 接受或拒绝建议 → 看任务 → 完成任务看反馈 → 刷新页面确认任务状态恢复。

实际验证结果（标明 mock 或真实平台）：

- **mock**：8787 起服务后 `/health` 返回 `mode=mock` 与"仅本地联调；无真实智能体、存储或积分"；5173 返回静态页并带"模拟"徽标。
- **mock** 端到端（真实 HTTP）：会话 → 事件（library 场景返回 `focus_25` / 1500 秒建议）→ 接受（`active`）→ 查询（同一 `task_id`）→ 完成（`points_awarded: 0` + 显式警告，`completed`）→ 反馈事件无建议；关闭主动建议时 `scene_enter` 无建议；跨会话取任务 404 `TASK_NOT_FOUND`；非白名单 Origin 403 `ORIGIN_NOT_ALLOWED`；非法场景 400 `INVALID_EVENT`；`/api/v1/memory` 501（记忆关闭）。
- **测试**：`apps/web/tests/` 44 个用例通过（含真实启动 `tools/mock-api.mjs` 的端到端，以及宠物贴图、校园地图两组静态资源用例）。
- **素材与资源**：页面新增小狗 7 个动作的动画 WebP（旧原型 GIF 转码）与校园地图示意插画（AI 生成，源图带"千问AI生成"水印与 AIGC 元数据，成品保留 XMP 标识），均为仓库内相对路径、零外部 CDN；登记见 `content/assets/pet-ui/source-register.csv`（7 行）与 `content/assets/campus/source-register.csv`（1 行）。地图页面静态标注"AI 生成示意插画／非精确导航"；地标按钮只复用已有 `scene_enter`，未改契约。
- **真实平台**：无。未接 A 的 live 服务；本机无无头浏览器，未做真实浏览器点击走查，DOM 交互目前只有源码级断言。

## 影响和交接

- [x] 只修改负责目录，或已说明公共改动
- [x] 接口变更已单独说明并更新样例（本次未改 `contracts/`，无接口变更）
- [x] 无密钥和真实私密用户数据
- [x] 说明已实现内容、未完成内容和依赖

需要哪岗提供什么（最晚 16 日上午，逾期 B 的联调、试用与材料整体顺延）：

1. 真实 NK-GeniOS 能否被外部调用 + 已发布的体验 URL —— 决定 B 是否继续在网页上投入。
2. live 服务地址、启动方式（无密钥）、字段与错误码表是否与 mock 一致。错误码：`NO_LOCAL_SESSION`、`TASK_NOT_FOUND`、`ORIGIN_NOT_ALLOWED`、`INVALID_EVENT`、`SUGGESTION_NOT_FOUND`、`INVALID_ACCEPT`、`INVALID_COMPLETE`。
3. live 下 `preferences.remember` 是否仍必须为 `false`；若要开 `true`，先给授权、删除与验收口径。
4. 用另一台设备/非开发者账号打开体验 URL 的步骤与网络条件（17 日）。

未完成内容：真实服务联调；宠物合拍/相机；手机尺寸与无障碍专门验证；真实试用记录；提交材料。（小狗贴图与校园地图已接入；此段对应当前工作树的改动，提交后请同步 `提交：` 行的 hash。）
