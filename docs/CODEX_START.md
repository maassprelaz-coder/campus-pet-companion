# 给Codex的开工说明

先确认自己负责哪一岗，把下面文本中的角色和任务卡换成自己的，再发给Codex。这里是未来开发时使用的启动说明；当前这一轮正在修订计划，并未替任何成员宣称完成产品。

```text
我负责校宠伴行项目的【A/B/C/D/E】岗位，个人任务卡是【docs/assignments/对应文件】。
请先读仓库AGENTS.md、我的任务卡、docs/REQUESTS_CHECKLIST.md、docs/SCORE_PLAN.md、docs/EXISTING_PROJECT.md和docs/HANDOFFS.md。
目标是按比赛评分在10月18日前完成交付。先核查已有项目和当前代码，再决定保留、改造、替换哪些部分；旧项目有利才复用；重做需要明确收益，不无依据推倒重写或机械照搬。
先用直白语言告诉我这次要做出什么、需要别人提供什么，再按任务卡推进。我负责目录之外的修改先说明依赖，不擅自改公共接口或其他人的模块。
需要真实平台信息时先核实，不能猜GeniOS接口。用mock时明确标记，不能声称真实联通。
完成后在我的docs/handoffs目录写交接：运行步骤、实际测试、文件和版本、交给谁、遗留问题。不要修改原始文件或输出密钥。
```

| 岗位 | 任务卡 | 工作目录 | 交接记录 |
| --- | --- | --- | --- |
| A | assignments/A_integration.md | services/api、tests/integration、docs/release；公共契约由A维护 | handoffs/A/current.md |
| B Seventy | assignments/B_web.md | apps/web | handoffs/B/current.md |
| C 张祺昌 | assignments/C_genios.md | agent和本人获准操作的平台配置 | handoffs/C/current.md |
| D 美术 | assignments/D_art.md | content/assets/pet-ui | handoffs/D/current.md |
| E 资料与展示 | assignments/E_materials.md | content/knowledge、content/assets/campus、content/pilot、docs/submission | handoffs/E/current.md |

表内任务卡和交接路径相对docs目录。公共模拟工具无需第三方依赖，根目录npm run mock启动、npm run check检查；它只帮助独立开发。非技术同学也可让Codex整理本地资源包和清单，再由负责人入库，不强制使用命令行。
