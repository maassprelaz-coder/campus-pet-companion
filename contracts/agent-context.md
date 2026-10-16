# A侧内部适配边界 v0.1

2026-10-15新增，16日更新。网页聊天请求/响应的v0.1字段、mode与旧mock启动方式不变；本文件不定义学校API。HTTP/SQLite业务服务已实现，见[任务交接](task-api-v0.1.1.md)；GeniOS请求客户端已有合成检查，但真实平台调用尚未通过。

`services/api/agent-boundary.mjs`提供`validateEvent`、`suggestionPolicy`、`validateAgentOutput`和`createAgentBoundary`。生成结果是`agent-output.schema.json`中的内部五字段，不是对网页返回的封套。后续业务服务仍须生成request_id、suggestion_id及固定任务标题与时长。

## 可信状态从哪里来

`createAgentBoundary({agent, timeoutMs})`返回`generate(event, trusted)`。event是公开请求，trusted只能由服务端在认证、查库、查归属和检索后组装，不能从网页body透传。

```js
const trusted = {
  session_id: 'server-internal-owner', // 仅留业务层，不发送到模型
  preferences: { proactive: true, remember: false }, // 已保存开关
  now_ms: Date.now(),                 // 服务端时间
  available_templates: [],            // 默认空；真实任务服务完成后才开放focus_25
  active_task: null,                  // 或{owner_id, template_id, status:'active'}
  completed_task: null,               // 或{owner_id, task_id, status:'completed'}
  rejected_until_ms: 0,               // 拒绝后建议抑制截止时间
  last_suggested_at_ms: null,         // 上一次真正交付建议的时间
  retrieved_sources: []               // 本轮实际命中且按已核实表校验过的来源
};
```

这里没有自动查询数据库或检索知识库。来源元数据必须来自真实检索，不能把整个来源表无条件当作本轮命中；知识正文在平台检索节点提供。完成记录也须由业务查库确认，手工传入的合成对象只能用于测试。

适配器收到`{event,suggestion_policy,active_task,completion_verified,retrieved_sources}`及第二参数`{signal}`。只发送必要任务摘要，不发送session_id/owner_id或Cookie。适配器负责按已验证的南开API转换请求、解析真实响应，并尊重AbortSignal。模块不猜endpoint、鉴权头、流式事件名或模型。

## 失败行为

| code | 状态 | 意义 |
| --- | --- | --- |
| INVALID_EVENT | 400 | 请求超长、多余字段、错误授权或缺必要字段 |
| TASK_NOT_COMPLETED | 409 | 完成事件找不到当前主体已完成的对应任务 |
| INVALID_AGENT_OUTPUT | 502 | 模型结构、动作、模板、来源或完成策略越界 |
| PLATFORM_FAILURE | 502 | 适配器失败，只向页面给通用错误，不暴露内部异常 |
| PLATFORM_TIMEOUT | 504 | 请求超时并取消；不读写任务账务 |
| PLATFORM_NOT_CONFIGURED | 503 | 未提供真实适配器，不能用fixtures作为成功降级 |
| INVALID_TRUSTED_CONTEXT | 500 | 业务状态缺失或归属不一致 |

建议关闭、进行中任务、近期拒绝、10分钟冷却、已完成事件和空白名单都限制建议。用户主动聊天不受“关闭场景主动建议”限制，但仍受其他抑制条件约束。抑制时间与上次建议时间现由task-store.mjs持久化，本模块只计算规则。api-server.mjs只在提供适配器时开放focus_25；未配平台时白名单为空、events返回503。

输出检查只检查结构与明确权限；不能证明回复文本的事实、语义或情绪判断正确，仍须跑平台测试表。页面始终使用纯文本渲染。所有现有和新增自动测试使用合成输入，不计入GeniOS成功率或真实试用成效。

## 给B的影响

目前继续使用原有npm run mock和contracts/fixtures。focus_25对应旧pomodoro的25分钟专注；先不按旧规则发10币。relax_2仅是mock样例，不能写入参赛功能承诺。等待A提供真实适配证据和可执行任务接口后切换，不需要B自行申请模型Key。
