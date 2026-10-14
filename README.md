# 校宠伴行

校园宠物陪伴与成长智能体，面向南开大学 2026 年“华为杯”AI 应用创新大赛软件赛道。

本仓库于 2026-10-14 初始化，当前包含脱敏后的历史原型、协作方案、接口草案和本地模拟服务。**真实 NK-GeniOS 智能体、业务服务、评审访问地址和参赛材料尚待团队完成。** 模拟服务不连接模型，不能作为已完成作品提交。

## 每个人从哪里开始

| 成员 | 暂定职责 | 先读 | 主要修改目录 |
| --- | --- | --- | --- |
| 你（仓库负责人） | 业务服务、数据与合并统筹 | [三人分工](docs/TEAM_PLAN.md)、[接口约定](contracts/README.md) | `services/api/`、`tests/integration/`、`docs/release/` |
| Seventy（[zhaozishi123](https://github.com/zhaozishi123)） | 网页客户端与宠物交互 | [客户端任务](apps/web/README.md)、[接口约定](contracts/README.md) | `apps/web/` |
| 张祺昌 | NK-GeniOS 智能体、知识库与平台发布 | [智能体任务](agent/README.md)、[平台确认单](agent/PLATFORM_CHECK.md) | `agent/` |
| 另外一位同学 D | 宠物/场景/界面美术资源及来源许可 | [材料清单](docs/MATERIALS.md) | `content/assets/pet-ui/` |
| 另外一位同学 E | 校园图文资料、试用及提交材料整理 | [材料清单](docs/MATERIALS.md) | `content/knowledge/`、`content/assets/campus/`、`docs/submission/` |

这是按工作依赖提出的分工，不代表已确认每个人的技术特长。Seventy 与张祺昌可整体互换岗位；先不拆散目录责任。Seventy 的 GitHub 用户名为 `zhaozishi123`，张祺昌的用户名待提供；尚未发送协作邀请或设置账号指派。

## 交付范围已收紧

根据团队 2026-10-14 的明确要求：只做参赛所需的智能体、必要网页和最少业务联通，不开发手机 App、Electron 桌面版或应用商店发布。若平台自带页面能完成核心体验，可进一步减少自建页面和服务。复杂账号系统、长期记忆、完整商城和多端适配均后置。

## 第一版要跑通什么

用户选择校园场景或表达近况 → NK-GeniOS 结合情境给出回复与可选行动 → 用户接受或拒绝 → 业务服务记录任务与完成情况 → 宠物反馈，并在得到授权时用于后续互动。

首轮实现范围建议：一只宠物、一个宿舍入口、手动场景选择、专注与放松两类行动、一次完整任务反馈；校园事实必须可溯源。完整愿景保留在简介中，暂不把所有功能同时列为交付承诺。详见 [范围与验收](docs/SCOPE.md)。

## 独立开发

使用 Node.js 22 或更新版本（当前工具不需要安装第三方依赖）：

```sh
npm run check
npm run mock
```

模拟服务只监听 `127.0.0.1:8787`，支持 `http://localhost:5173` / `http://127.0.0.1:5173` 的本地客户端。请求与响应都标有模拟状态。前端可先完成页面；智能体负责人用相同 JSON 样例调工作流；后端负责人根据相同约定实现真实服务。

历史原型在 `legacy/prototype/`，其中旧模型凭据已清空。这里保留既有代码供迁移，包含尚未修复的旧登录、直连模型、桌面权限等实现，不作为部署入口。不得把它直接放到公网当成参赛版。

## 项目入口

- [三人异步分工和 10 月 14—18 日排期](docs/TEAM_PLAN.md)
- [比赛要求及原文依据](docs/REQUIREMENTS.md)
- [需要收集的材料](docs/MATERIALS.md)
- [任务卡与验收条件](docs/TASKS.md)
- [分支与合并方式](CONTRIBUTING.md)
- [提交清单](docs/submission/CHECKLIST.md)
- [当前进展](docs/STATUS.md)

仓库保持私有；来源待确认的历史素材不视为已获开放许可。真实用户数据、学校账号、API 密钥和签字申报材料不入库。
