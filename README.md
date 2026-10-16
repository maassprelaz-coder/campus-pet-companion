# 校宠伴行：真实智能体接入分支

以 Seventy 的 feat/web（556c4a6）为基础，接入真实南开 GeniOS、Cookie/SQLite 任务服务和 HTTPS 域名部署准备。网页版本 web-0.1.2-domain；本地来源提交 0fd386a34311de11bd87a5eebdd7f43a6e107561。

本分支同步运行代码、测试、提示词和部署说明。本地测试截图、原始调用记录、密钥、业务 Cookie 和数据库不公开上传；不是平台导出或正式用户试用记录。

## 当前状态

真实平台合成输入上的建议、任务接受、真实计时后的完成与反馈已通过；最新本地回归 73 项通过。模型曾有一次结构不符，服务拒绝该输出并支持重试。

既有域名为 nkupet.fun，阿里云域名状态正常，公网 A 记录为 47.243.247.189。源站服务器、现有网页和部署工作流尚待确认；本分支上传不代表网站已更新。main 与 feat/web 不由本次同步改写。

## 运行

Node.js 24 及以上，无第三方依赖：

```powershell
npm run check
npm run api
```

真实服务需要服务器私有配置；不要在网页填写平台凭据。独立合成联调用 npm run api:demo，不能将其当作真实平台。

第二个终端：

```powershell
$env:TASK_API_ORIGIN = 'http://127.0.0.1:8788'
node apps/web/dev-server.mjs
```

本机打开 http://127.0.0.1:5173/，服务地址填同一地址。本机验证和公网网页实机验收分别记录。

## 域名发布

[阿里云与 nkupet.fun 发布交接](docs/release/nkupet-domain-2026-10-16.md)；HTTPS 入口为 npm run api:production，配置示例在 services/api/deploy/。需先确认现有源站，核对路径与证书后部署，不能直接覆盖原网站。

仅开放 focus_25，长期记忆关闭，积分固定为 0。自愿用户试用、素材核对、展示材料和比赛提交仍需完成。
