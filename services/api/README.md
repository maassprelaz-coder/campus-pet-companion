# 连接与任务服务

Node.js 24及以上，无第三方依赖。业务Cookie、SQLite任务、服务端1500秒时长、幂等、归属及模型输出校验已实现。真实GeniOS合成任务流程在本机通过，原始记录不随本公开分支上传。

本机运行 npm run api，配套网页 http://127.0.0.1:5173/；合成联调用 npm run api:demo，返回mode=mock。真实服务需要经过验证的本机私有配置，缺配置不会回退为模拟成功。

公网准备入口 npm run api:production。PUBLIC_ORIGIN默认https://nkupet.fun，GENIOS_CONFIG_PATH、TASK_DB_PATH须为网站目录之外的不同绝对路径；只监听127.0.0.1，Secure Cookie和本站Origin由HTTPS代理配合使用。deploy/中为待核实的Nginx/systemd示例，尚未安装到源站。

[接口](../../contracts/task-api-v0.1.1.md)、[域名部署交接](../../docs/release/nkupet-domain-2026-10-16.md)。仅focus_25，积分0，长期记忆关闭，未接本轮来源元数据时sources为空。不要将密钥、Cookie或数据库提交Git。
