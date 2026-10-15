# 网页端取舍记录（B）

记录 2026-10-15 建 v1 骨架时做的决定与理由。改动公共接口或契约前先同步 A。

## 技术选择

1. **不引入框架，继续用原生 HTML/CSS/ESM**。理由：旧原型就是原生 HTML/CSS/JS，页面规模小；加构建链会占用 16–18 日的试用与材料时间，也增加 A 的复现成本。页面拆成 `app.js` + 两个 `lib/*.mjs` 模块，用 `node --test` 直接测，无需打包。
2. **服务地址可配置但默认 mock**。`config.json`（gitignore）> 页面输入框 > 默认 `http://127.0.0.1:8787`。A 交 live 地址后只改配置，不改页面代码。
3. **自己写本地静态服务器**（`dev-server.mjs`）。理由：只需固定 5173（mock 白名单）、只监听 127.0.0.1、能被测试 import 复用；不引第三方 dev server，避免新依赖。
4. **数据只在内存和 `localStorage`**。会话 id 与当前任务 id 存本地，刷新后可恢复任务状态；不建数据库，长期记忆不在本轮范围。

## 契约与安全

5. **只发契约允许的字段**，`preferences.remember` 硬编码 `false`；场景限定 `dorm|library|sports|canteen`；事件类型限定 `chat|scene_enter|task_completed`。多一个字段就可能被服务端 400，早点对齐比事后放宽安全。
6. **幂等键由业务 id 推导**：`event:<event_id>`、`accept:<suggestion_id>`、`complete:<task_id>`。重试和 401 重发用同一个键，服务端只做一次副作用。
7. **401 自动重建会话后原样重发**。避免用户看到假失败；重建会换 `X-Demo-Session`，任务归属随之改变，因此刷新恢复失败时页面明确提示重新开始，而不是假装任务还在。
8. **拒绝建议不调任何接口**，只在页面记录"已拒绝"；页面从不自行加积分，积分只显示服务端返回的 `points_awarded`（mock 恒为 0 并带警告文案）。测试里专门断言了这两条。
9. **文本一律 `textContent` 渲染**（`page-safety.test.mjs` 断言），模型和用户输入不当 HTML 执行；`source.url` 只有 `https://` 开头才渲染成链接。
10. **权限拒绝照常可用**：定位/摄像头/通知被拒时只降级对应功能，基本聊天与任务不受影响；页面不自动发送草稿，必须用户点发送。
11. **记忆接口关闭**：本轮没有任何 `/api/v1/memory` 调用；测试里显式验证该接口返回 501 且不可重试，防止后来者误以为已有长期记忆。

## 待 A 确认的开放项

- 真实服务的错误码表是否与 mock 一致（当前依赖 `NO_LOCAL_SESSION`/`TASK_NOT_FOUND`/`ORIGIN_NOT_ALLOWED`/`INVALID_EVENT` 等命名）。
- live 服务是否同样校验 `preferences.remember === false`；若允许 `true`，需要同步授权与删除路径再开。
- 真实截止时刻、飞书模板与评审访问方式（B 尚未核实，见 `docs/handoffs/B/current.md`）。
