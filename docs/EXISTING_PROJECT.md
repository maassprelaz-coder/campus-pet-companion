# 已有项目与参赛价值评估

已有项目不是空壳，也不只是几张图片。已核查原生HTML/CSS/JavaScript代码、Electron启动配置及素材。仓库中的[历史副本](../legacy/prototype/)已清空发现的模型密钥；用户原文件保持不变。下表是**静态代码证据**，不是逐项运行通过证明。

| 已有部分 | 可定位证据 | 对参赛的潜在价值 | 初步处理建议及主责 |
| --- | --- | --- | --- |
| 四种宠物及动作 | app.js的PET_TYPES、PET_FACES、syncPetAnimation；四类GIF目录 | 降低制作成本，承接情境化宠物反馈 | B/D评估画风、加载和动作，好的保留，不合适的换；首轮验收一只不等于删除其他宠物 |
| 领养、宿舍、聊天、场景页面 | index.html的view-adopt、view-map、view-scene、view-closeup、dorm-room；style.css | 可直接作为页面起点，减少从零布局 | B先试跑再决定整页保留或局部替换，重做需有明确体验收益 |
| 地图与场景切换 | map.png；app.js的goToScene、getDistance、handleGPSPosition | 校园情境与场景感知基础 | B复核切换，E核实校区地标；不把原坐标当已准确验证 |
| 25分钟专注计时 | app.js的toggleTimer、changeFocusDuration | 可作为“建议→实际行动”的核心任务 | B保留好用的计时UI；A处理可信任务状态。后台节流/刷新恢复与固定25分钟进度算法需验证修复 |
| 签到、日记、专注、合拍任务及币 | TASKS、renderTasks、claimTask；原pomodoro任务奖励10币 | 已有任务语义和奖励展示，可少做一套系统 | A/B先核对旧规则再选用；奖励不能由客户端或模型随意传金额；首轮不必重做全部任务 |
| 家具店与宿舍摆放 | SHOP_ITEMS、renderFurniture、interactWithFurniture | 展示成长反馈和养成效果 | 稳定且好看的可保留，不扩大型商城；B/D按收益选择 |
| 宠物聊天与动作解析 | sendMessage、handleAIResponse、callDeepSeek | 交互和动作层可借鉴 | 当前直连DeepSeek，未见GeniOS接入；A换接入，B处理结构输出和直接可读回复，旧翻译扣币不阻挡基本交流 |
| 日记与模型留言 | renderDiaryHistory、analyzeDiaryMood、generatePetSummary | 可作情感场景补充 | 输入草稿自动发送等逻辑不直接复用；按用户明确操作和最少数据原则改造，否则暂不接入核心演示 |
| 手势跟随、虚实合拍、照片墙 | initHandsDetector、onHandsResults、saveFinalPhoto；MediaPipe脚本和相框目录 | 可增强创新和演示辨识度 | 有条件优先评估：现有代码若易恢复且稳定，可成为第二亮点；并不一律砍掉 |
| 现成素材 | 28个宠物动作GIF、4张相框图、map.png、背景图片及音频 | 减少搜图时间 | D/E先盘点来源、质量、尺寸和实际缺口；不强制沿用也不全套重找 |
| Electron桌宠 | main.js、preload.js、desktop-pet.html；app.js尾部require | 原项目已有桌面尝试 | 本次不增加桌面发布工作；网页适配必须隔离Electron调用；原桌面代码留存 |

主要文件：[app.js](../legacy/prototype/app.js)、[index.html](../legacy/prototype/index.html)、[package.json](../legacy/prototype/package.json)。函数名比固定行号更适合后续定位。

## 当前没有得到实现证据的参赛关键项

真实NK-GeniOS智能体和发布URL、可追踪的情境工作流、已确认的外部调用、可靠的任务闭环、跨使用者隔离、真实试用成效及最终提交包。仓库中的提示词/配置是草案，mock是模拟工具，不能填补这些证据缺口。

## 开工后的选择方式

B先提供模块运行结果，D评估视觉和素材，A评估接入/状态，C评估平台适配。每项在自己的交接记录中注明：现状证据→保留/改造/替换/暂缓→评分收益→估计耗时→如何验收。代码存在不代表一定值得留；重做也不能仅因为Codex更习惯另一套框架。
