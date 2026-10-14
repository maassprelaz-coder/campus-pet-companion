# 校宠伴行协作规则

以当前用户请求为准。若本轮只要求修改计划，不擅自实现产品或重构代码。任务目标是按比赛评分交付可体验作品，旧项目可选择性复用，不是强制基线或必须丢弃的代码。

开始先读README.md、docs/REQUESTS_CHECKLIST.md、docs/SCORE_PLAN.md、docs/EXISTING_PROJECT.md、docs/HANDOFFS.md和当前成员任务卡。已有角色上下文时不重复确认；角色未知时先只读盘点，再询问缺失分工。

原始资料和legacy/prototype保持只读。复制有益内容到分配目录后修改；先判断功能现状与复用价值，不仅凭文档猜技术栈。不要输出旧源码里的密钥行，不读取、提交或传播用户私密数据。

目录主责：B负责apps/web；A负责services/api、tests/integration、docs/release以及公共contracts；C负责agent；D负责content/assets/pet-ui；E负责content/knowledge、content/assets/campus、content/pilot、docs/submission。各岗使用docs/handoffs下自己的目录。跨目录变更先说明交接影响，不静默改别人接口。使用独立功能分支，不重写他人提交历史。

NK-GeniOS能力须有真实平台证据，不能把公网Coze接口、配置草案、合成样例或mock当已运行作品。模型不决定积分和权限。依权限核实结果选择最少必要实现，避免新增手机App、桌面打包等题外工作。

增强功能若能改善评分且按时验证，可以做；先依据需求、已有代码、时间和测试成本取舍，避免为重构或堆功能牺牲真实试用和材料。

完成后提供具体改动、运行方法、对应验收、接口/资源交接、遗留问题。测试强度与改动匹配；本地通过不代表已部署、已评审或已提交。不得编造试点数据、平台导出或用户反馈。
