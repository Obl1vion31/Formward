# 国服网页与海外后台验收

## 当前正式状态

正式站[formward.top](https://formward.top)运行`dual-entry-d90023df-security-admin-release-20261117`，源码`d90023dfda9433116d13d5e15d80a3376a552ddf`，BUILD_ID `1CdkLPkDiQdenML7PtNbh`；北京时间2026-11-17 20:15:28切换。功能已合入推送main，后续运维及文档提交不改变应用运行源码。

管理员通过`/admin`查看最近30天费用、任务／模型请求／Token、用户与模型／用途筛选、有效记录和登记图片数量；用户详情可按天查看、暂停／恢复站内AI、调整个人金额／识图额度或恢复档位默认。费用沿用原模型账本，已结算、预占与未知分别显示，后台不返回健康数值、餐食、照片或聊天正文。本轮没有收款、充值或支付账本。

## 技术与实际页面

lint、typecheck、830项单元／集成和干净production build通过，包含独立原生PostgreSQL的并发预算、个人策略、限流与图片额度，以及真实Better Auth TOTP／恢复码和OAuth／JWKS回归。最终运行包通过Chromium／WebKit的40项页面操作、12组令牌控件外观、验证到期保留输入／真实保存、200%网页文字及5次列表返回专项。双引擎、390／1440、深浅主题、正常／900ms慢读取的16组逐帧加载通过，固定槽位最大偏差1 CSS px；检查真实主题和首个内容绘制后的全部加载帧。五主页面、账号、安全、AI接入、邀请及安全记录均有实际页面证据。

海外网关已更新为`dpl_CgwJFnf4xJjpqVced4Lj74CJ48sC`，区域iad1；仅切换global.formward.top与formward-ten.vercel.app，原第三别名保持。正式域名、IP和两个海外入口实际版本一致；MFA保持当前来源、随机nonce CSP、HSTS与防嵌入均通过。HTTP1.15.1、MCP2.0.2／18项、原resource与公开JWKS保持，匿名HTTP／MCP拒绝401。未写正式健康测试数据，未调用收费模型。

## 数据、备份与安全恢复

0043／0044已由原migrator升级正式库42→44、60→66张表。切换前停写备份`formward-primary-20261117T121515612760Z.dump.json`完成原生校验和加密异机完整回读；此前异机归档已在隔离库完整恢复、重复迁移及实际角色权限演练。迁移与私有就绪检查期间，60张既有表的原列／值、凭据与运行配置保持；新应用和独立安全恢复包均以实际服务身份通过readiness，网页与worker正常运行。

55项当前受保护Server Action与原绑定密钥保留，51项旧动作返回409及刷新提示，不再合并旧执行代码；补留1104项旧静态文件。两个systemd服务安装ExecStartPre安全基线，旧的不含MFA／预算／动作门禁的运行包拒绝启动。仅切保留新安全门禁的兼容恢复包，不回退数据库、费用、授权或健康记录。

完整兼容运行包75,930,649字节，SHA256 `d9b78306cc6bd53f38f4d3eb9fe3d857a95c69a03462296a5f2429582d116642`，服务器与本机归档逐字节一致，永久保存在原入口`.codex/backups/regional-releases/security-admin-release-20261117`。安全恢复目录为`security-admin-release-20261117-recovery`，是独立物理副本并通过同一服务身份就绪；旧0042包仅保留审计，不作为可启动回退。

## 保留的协议与边界

原GPT／豆包OAuth、issuer、resource与JWKS保持；国际网关没有数据库或认证签名秘密。网页新开入口采用国服，MFA挑战留在原认证来源，Cookie不跨域转交。已有Garmin连接、Blob／COS图片及健康事实不重写；本轮未重复实传真实照片，也不把历史图片验证计作本轮重新通过。

本轮私有脚本、日志、参考图和虚构截图保存在原入口`.codex/security-admin-20261117`；Windows可读副本在`C:/Users/14878/.codex/private/formward-security-admin-20261117`。未实测真实iPhone／Android、系统软键盘、系统字号、屏幕阅读器及长期负载；WebKit与网页文字放大不冒充真机通过。
