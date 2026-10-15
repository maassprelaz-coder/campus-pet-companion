# 协作接口 v0.1 草案

这是团队自己的业务接口，不是 NK-GeniOS 官方 API。A 须验证真实平台能力，A 实现平台适配。两人确认后冻结第一轮字段；目前提供可运行 mock 作为交接样例。当前草案 preferences.remember 固定 false，未实现长期记忆；高收益增强可依评分计划另行确认，再同步修改契约、授权与验收。

## 请求和响应

`POST /api/v1/companion/events` 请求字段：

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| schema_version | string | 固定 `0.1` |
| event_id | string | 客户端生成的非敏感唯一标识；重试保持不变 |
| event_type | enum | `chat`、`scene_enter`、`task_completed` |
| user_message | string | 用户明确发送的文本，最长 2000 字；不发送输入中的草稿 |
| scene | enum | `dorm`、`library`、`sports`、`canteen` |
| mood | string/null | 用户自报，可不填；不当作心理诊断 |
| preferences | object | `proactive` 主动建议开关、`remember` 记忆意愿；服务端还须核对已保存的授权，不能凭此字段视为授权完成 |
| task_id | string | 仅 `task_completed` 必填；服务端须查任务已真实完成且属于当前会话 |

客户端不传 `user_id`、积分金额、模型密钥或任意工具名。正式系统使用服务端安全会话确定身份。

响应字段：`schema_version`、`mode`（mock/live）、`request_id`、`reply`、`pet_action`、`strategy`、`suggestion`、`sources`。准确结构见 JSON Schema 和 fixtures。无来源时 sources 为空，不能填虚构 URL。来源若有应为可检查的 HTTPS 资料链接和核对日期。

智能体内部只返回 `reply`、`pet_action`、`strategy`、`suggested_task`（focus_25/relax_2/null）、`sources`。A 的服务校验后生成请求和建议标识，并补充固定标题/时长；**不是让模型生成 task_id 或决定奖励**。内部草案另见 `agent-output.schema.json`。

focus_25/relax_2是协作样例，不是本轮必须同时实现的功能。A/B首次对接需按实际已接通任务固定可用子集，并统一旧pomodoro与新模板、中文宠物动作与动作枚举的映射。可用模板列表属于待确认的内部适配信息，当前公开schema未新增此字段；未开放任务不能进入真实建议。

## 任务接口

| 方法及路径 | 请求 | 响应与约束 |
| --- | --- | --- |
| POST `/api/v1/sessions` | `{}` | 建立会话；mock 返回 `demo_session`，实际系统设置安全会话 Cookie |
| POST `/api/v1/companion/events` | 上表 | 回复及至多一个可选建议 |
| POST `/api/v1/tasks/accept` | `{suggestion_id}` | `{task:{task_id,template_id,status,started_at,duration_seconds}}`；从服务端保存的建议生成任务 |
| GET `/api/v1/tasks/:id` | 无 | 当前会话自己的任务；支持刷新恢复 |
| POST `/api/v1/tasks/:id/complete` | `{}` | `{task,receipt:{already_completed,points_awarded}}`；真实服务校验时间和状态并原子结算 |
| 后续扩展 POST `/api/v1/preferences` | `{proactive,remember}` | 保存明确操作后的授权状态；正式版需版本/时间记录 |
| 后续扩展 DELETE `/api/v1/memory` | 无 | 只删除当前用户的长期记忆；保留必要任务账务的范围须说明 |

所有修改请求在正式服务要求 `Idempotency-Key`；同 key 同负载返回同一结果，同 key 不同负载返回 409。响应除核心字段外均带 mode，避免模拟结果混入实测。统一错误 `{mode,error:{code,message}}`；400 无效输入，401 无会话，404 资源不存在/不属于当前用户，409 状态/重复键冲突，502 平台失败，504 超时。

接受建议是用户主动动作；拒绝建议不调用 accept，不扣分。任务完成后客户端可发送 `task_completed` 事件取反馈；AI 失败不撤销已完成账务。

## 模拟环境的范围

根目录 `npm run mock` 启动 http://127.0.0.1:8787。先 POST sessions，后续把返回的 demo_session 放 `X-Demo-Session` 请求头。**这只是本机联调标记，不是可部署的鉴权方案。** 仅允许本地 5173 端口网页跨域；不对外监听。

模拟服务实现会话、场景事件、接受/查询/完成任务，任务保存在进程内，重启清空。为方便界面演示，mock 完成接口不等待实际时长，积分固定为 0；返回 warning 明示这一点。正式业务校验、持久化、真实 AI 和部署验收仍由 A 完成。长期记忆已后置；preferences 与 memory 返回 501，避免假装记忆能力已实现。

样例均为合成测试输入，不包含真实用户数据。前端写界面时保留 mode 标记；制作参赛演示和真实试用记录时切换已验证 live 服务。
