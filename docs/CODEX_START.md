# 两人各自给Codex的开工说明

当前只有A（你）和B（Seventy），旧C/D/E任务不再执行。先读对应任务卡，再把以下文字交给自己的Codex：

```text
我负责校宠伴行的【A或B】岗位。先读AGENTS.md、docs/TEAM_PLAN.md、我的任务卡、docs/REQUESTS_CHECKLIST.md、docs/SCORE_PLAN.md、docs/EXISTING_PROJECT.md和docs/HANDOFFS.md。
先用直白的话说清本次要做成什么，再执行详细步骤。18日截止，以比赛评分为准；旧项目有收益才复用，不机械照搬，也不无依据推倒重写。
只改我负责的目录；共享接口由A维护并给B样例。A负责GeniOS、知识、必要业务服务、发布；B负责网页、素材、赛务核对、试用和材料整合。不等待原C/D/E。
平台能力必须真实核实，不能猜校园接口或制造导出。mock和真实运行分开；不得编造素材许可、试用数据或已实现状态。原文件和legacy只读，不输出密钥。
如果这轮只要求改计划，就只改计划。实际开发时每次交付写自己docs/handoffs目录：版本、启动方法、实测、文件、交给谁、阻塞、下次交付。
```

| 岗位 | 任务卡 | 主要目录 |
| --- | --- | --- |
| A | [你的任务](assignments/A_integration.md) | agent、content/knowledge、services/api、contracts、tests/integration、docs/release、handoffs/A |
| B | [Seventy任务](assignments/B_web.md) | apps/web、content/assets、content/pilot、docs/submission、handoffs/B |

本地模拟：npm run mock；代码/接口检查：npm run check。只是协作工具，不是已运行产品。各开自己的功能分支，A合并；不同时修改同一平台配置或同一交接记录。
