# 任务服务交接 v0.1.1

2026-10-16，A交Seventy。这是团队业务接口，非学校API。原聊天请求/响应的schema_version仍为0.1，八个响应字段不变；新增会话恢复、拒绝建议、偏好保存及任务时间字段。A在独立集成分支适配B网页，旧npm run mock和X-Demo-Session继续兼容；见[网页集成记录](../docs/release/web-integration-2026-10-16.md)。

## 启动和会话

Node.js 24以上，无第三方依赖。`npm run api`运行SQLite业务服务，未配平台时events返回503。`npm run api:demo`使用相同任务实现、独立demo数据库及合成回复，所有响应标mode: mock。两者均只监听http://127.0.0.1:8788，选其一运行，不能把回环地址交评审。

业务库data/private/tasks.sqlite，合成联调库data/private/demo-tasks.sqlite，均已由.gitignore排除。首次POST /api/v1/sessions发送`{}`，由服务写HttpOnly、SameSite=Lax Cookie；后续fetch携带`credentials: 'include'`，不读/存令牌。再次POST sessions恢复已有会话。首个建会话无需重试键，其余POST必须提供Idempotency-Key。

页面与API使用相同主机名：127.0.0.1配127.0.0.1，localhost配localhost。只允许这两个主机的5173网页来源及API自身来源，修改请求为application/json。当前没有公网部署；HTTPS、域名、持久卷与访问条件需另验。

| 方法/路径 | 输入 | 行为 |
| --- | --- | --- |
| GET /health | 无 | agent_configured及可执行模板，不代表模型调用成功 |
| POST /api/v1/sessions | `{}` | 建立/恢复会话，返回偏好、active_task、last_completed_task、expires_at、server_time |
| GET /api/v1/session | 无 | 刷新恢复，不重复accept |
| POST /api/v1/companion/events | 原v0.1事件 | 校验模型结果并保存建议；event_id与重试键各自去重 |
| POST /api/v1/tasks/accept | `{suggestion_id}` | 接受本会话10分钟内的有效建议，重复接受同一建议返回同一任务 |
| POST /api/v1/suggestions/:id/reject | `{}` | 不建任务，拒绝本会话建议并抑制后续建议10分钟 |
| GET /api/v1/tasks/:id | 无 | 查询本会话任务 |
| POST /api/v1/tasks/:id/complete | `{}` | 服务端满1500秒才完成，积分固定0 |
| POST /api/v1/preferences | `{proactive,remember:false}` | 保存主动建议开关，关闭时使待接受建议失效 |

任务响应外层含mode和server_time；task保留task_id、template_id、status、started_at、duration_seconds，并增加ends_at及completed_at（未完成为null）。完成响应增加`receipt:{already_completed,points_awarded:0}`。同键返回原响应包括原server_time；新键重复完成时already_completed=true、完成时间不变。需要最新时间时GET state/task。

## B的切换步骤

可复制或导入[浏览器调用样例](../services/api/examples/browser-client.mjs)，它不改你的组件、动作或素材。

1. 保留旧mock入口，新transport明确选择8788并bootstrap。
2. 在api:demo发送“合成联调：专注”取得建议，点击接受后才开始实际25分钟计时。没有提前完成或缩短计时的HTTP开关。
3. 刷新读取state.active_task；用ends_at和server_time估算剩余时间，可用performance.now累计当前页面经过时间。最终由complete接口判断。
4. 点拒绝调用reject，关闭主动建议调用preferences。业务层还对“只想聊天/聊聊/休息”“不想做任务”“不要…任务/专注/建议”等少量明确短语保守抑制10分钟，模型失败后重试同事件不会延长抑制；这不是通用意图识别，其他措辞仍须真实模型回归。
5. 先complete并显示结果，再发送task_completed事件取宠物反馈；反馈失败只重试事件，不回滚完成。
6. 重试保留event_id、Idempotency-Key及负载。同键换内容/端点返回409；REQUEST_IN_PROGRESS稍后按原键重试。

统一错误`{mode,error:{code,message}}`。401会话失效；404资源不存在或属于别人；409包括TASK_TOO_EARLY、SUGGESTION_EXPIRED、SUGGESTION_REJECTED、KEY_REUSED、EVENT_REUSED、REQUEST_IN_PROGRESS和CONTEXT_CHANGED；502平台/结构失败；503未配平台；504超时。模型等待时任务/偏好仍能修改，过时生成结果返回CONTEXT_CHANGED，不保存可接受建议。

只实现focus_25，每会话最多一个active任务，不采用旧pomodoro的10币；relax_2仅旧mock。计时验证服务端经过时间，不证明用户始终专心。会话7天失效，服务启动/新建会话时清理失效会话及关联记录，不承诺跨设备同步。库内保存任务、偏好、请求摘要和幂等响应；响应可能含模型复述，原输入不单独存成日记，没有跨会话画像。

本轮为合成适配器、临时SQLite、真实本地HTTP和可控时钟测试，不是一次真实25分钟用户专注或学校模型调用。真实结构化配置、本轮来源元数据、受控API凭据和公网部署仍待验证。
