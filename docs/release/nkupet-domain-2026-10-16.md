# nkupet.fun 访问与发布交接

2026-10-16，A交Seventy。用户提供既有域名nkupet.fun，说明在阿里云管理，并要求完成访问、代码推送与接入工作。域名控制台截图确认注册状态正常；这不是服务器、网页或自动部署已完成的证据。

## 实际查到的情况

- Google与Cloudflare公开DNS均返回A记录47.243.247.189；NS为dns17.hichina.com、dns18.hichina.com。本机网络返回198.18.0.141，不能把本机这个地址当源站。
- 本机按域名访问HTTPS和HTTP失败；按公开源站IP保留Host及TLS域名校验复查，两者ECONNRESET。Web读取工具也未能读取站点。因此尚未确认现有线上页面内容，不能据此断言所有网络下网站不可用。
- 可访问仓库maassprelaz-coder/campus-pet-companion中，B的feat/web仍为556c4a6，main仍3f98081。仓库未找到nkupet.fun、服务器部署工作流或域名配置；不能把推GitHub当成网站自动更新。
- 本机无已配置的SSH主机或阿里云CLI配置。服务器所属产品、实例、现有网站目录、发布分支和登录方式尚未确认；未登录或修改源站，没有改DNS。

## 已准备的接入

- 网页web-0.1.2-domain在公网HTTPS页面自动使用该页面origin；本机开发保留配置。旧存储的127.0.0.1不会误用于手机。
- 新增`npm run api:production`：PUBLIC_ORIGIN默认https://nkupet.fun；要求GENIOS_CONFIG_PATH、TASK_DB_PATH为不同的绝对私有路径，校验服务端APPID及结构化验证标记。只监听127.0.0.1，Cookie开启Secure，Origin只接受本站。
- `services/api/deploy/nginx-locations.conf.example`准备既有HTTPS站点的/api/v1/与/health转发，保留内部Host校验，不替换原root或证书。
- `services/api/deploy/nkupet-api.service.example`是Linux/systemd示例；Node绝对路径、站点路径和运行用户须在源站核对，尚未安装。
- `npm run check`共73项通过：业务31、网页42。新增实际HTTP Secure Cookie/Origin/Host检查及公网地址回归。不是源站HTTPS实机验收，Nginx/systemd尚未在目标主机执行。

## 获得服务器入口后的发布顺序

1. 在阿里云定位A记录对应实例，确认ECS/轻量等实际产品、有无宝塔。若只有域名，先找到现有服务器管理入口。
2. 只读核对现有站点目录、配置、Git仓库/分支、Node版本和进程，确认/api/v1、/health是否冲突。原站点可能不是本仓库的联调骨架，不能直接覆盖。
3. 备份配置，将审核的集成分支部署到独立release目录。密钥与SQLite放站点目录之外，不通过GitHub或前端传递。凭据写入自有服务器时须记录新的私有存放位置。
4. 按实际路径安装后台进程，添加HTTPS代理，配置检查通过后加载。验证https://nkupet.fun/health为live且agent_configured=true，再做真实聊天、接受/拒绝、刷新、手机及匿名访问。实际通过才标线上完成。
5. 失败时恢复原配置和之前release，保留任务数据库；记录实际部署版本。GitHub分支上传不等于源站发布成功。

反向代理依据[Nginx官方文档](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)；阿里云可通过[Workbench](https://www.alibabacloud.com/help/en/ecs/user-guide/workbench-overview/)连接已确认的ECS实例。这些是入口说明，不代表已登录服务器。

当前接收点：独立集成分支用于代码交付；网站部署仍等待服务器位置与访问方式。原生匿名聊天链接保留，长期记忆关闭、无奖励。正式试用和比赛材料另行完成。
