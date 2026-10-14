# 客户端任务

主责 Seventy（暂定）。先用原生 HTML/CSS/JS 迁移，不引入整套框架重写。此目录目前是待开发入口。

从 `legacy/prototype/` 选取宿舍、宠物动作映射、场景页和资源，避免整体复制旧 app.js 的模型请求、登录和积分逻辑。先用一只宠物和少量素材。

本地先启动根目录 `npm run mock`，客户端固定在 localhost:5173 调试。服务地址做配置项，不写死生产地址。接口详见 `contracts/README.md`；mock 没有真实身份、存储或智能体，页面要区分模拟环境。

第一份 PR：宿舍/宠物/输入框/手动场景，调用 companion/events 并显示 reply、pet_action、suggestion 和 sources。第二份 PR：接受/拒绝任务、倒计时和完成反馈、主动建议开关、错误与空态。首版 remember 固定 false，不开发长期记忆管理页。

动作仅使用 contracts 白名单；消息用 textContent；不要根据模型字符串直接拼 HTML 或执行代码。拒绝定位/摄像头仍能用基础功能，不自动上传草稿。可选手势合拍放到核心联通之后。

交接：运行方法、服务地址配置、三条操作路径、截图、本模块实际自测结果。
