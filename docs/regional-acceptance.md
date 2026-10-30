# 双区私有验收

## 范围与产物

本轮仅为工作分支开发、虚构数据库与私有预览。应用代码来自 e7f3db408f0d9e3315a1c9b2caf0fadf79be8357，BUILD_ID 为 E0QQPwKOnOocE3KRSnUxO，协议 formward-regional-v1，schema 0028_regional_image_storage。未合入 main，未执行正式迁移或生产切换。

统一构建保留源码、依赖锁、Drizzle 树、构建 ID 及两种归档摘要。迁移摘要为 44f683fe5c706332b9aa2bad4b749a3692b7de0aa33acee10fbcd02cb363d058；国际包没有数据库驱动、schema、COS SDK 或认证签名密钥。两产物移到仓库外启动，依赖符号链接均相对且落在产物内，避免父目录依赖掩盖问题。

上海仅运行一个业务实例和 PostgreSQL。私有国际网关在本机运行，经 SSH 转发到受保护回源；它不代表真实 Vercel 公网回源已经通过。预览只包含 .test 虚构账号，凭据、数据库报告和截图均 Git 忽略。

## 技术与行为检查

| 项目 | 结果及实际范围 |
| --- | --- |
| 基础门槛 | lint、typecheck、415 项完整既有与新增单元／集成、2 项 DNS 清理边界测试、生产构建、目录规范通过 |
| 业务网关 | HMAC 方法／路径／来源／时间绑定、伪造头剥离、host-only Cookie、多个 Set-Cookie、流式响应、解压头与禁止写请求重放通过 |
| 权限与账号 | 两入口独立登录、owner 分会话验密、停用／恢复不复活授权、国内改密后国际旧密码失效通过 |
| OAuth 兼容 | 真实 production Next 验证旧访问／刷新、DCR 私钥断言、CIMD 授权与同意、兑换、公钥轮换、错误签名、重放及并行材料隔离通过；未修改 SDK 文件或验签规则 |
| 存储与并发 | 独立 PostgreSQL 多连接和真实 HTTP 模拟存储通过；上传成功→撤销→迟到重复完成保留原附件和正式对象，撤销竞争拒绝登记，不确定提交保留对象 |
| 审核追加图片 | 原凭据、归属、revision、只追加、不可变请求、父审核版本同步与重复请求保护通过 |
| 图片界面 | 真实准备接口验证 Blob 旧图去重说明；COS 缺配置失败保留成功附件。原图 GET 使用虚构 PNG，不冒充真实对象存储 |
| 实际上海服务 | 两入口登录／四业务页、国际提交与人工确认后国内读取、两区私有 Excel 导出、国际网页撤销后两区旧令牌 401，通过；客户端异常和 5xx 均 0 |
| 发布回退 | 实际故意失败包触发回退，恢复当前兼容版本并重新验证版本／构建／数据库／schema；不回滚数据库 |
| 数据兼容 | 0028 仅用于虚构预览库；41 张业务表、147 行的旧字段值保持，新字段明确为旧 Blob |
| DNS | 两台权威服务器读回网站 A／AAAA／CNAME 均未启用；签发验证记录按准确原值移除，平台原有 NS 保持；Vercel 域名所有权验证通过，CNAME 取平台实际返回值 |
| HTTPS | 正式四域名证书、SAN／期限／私钥一致、四 SNI 实际信任链握手、TLS1.2／1.3、旧协议与未知 SNI 拒绝、systemd 强制续期更换证书、正常日常服务、私钥错误拒绝与 Nginx 失败恢复通过；timer 已启用，自动升级关闭 |
| 正式迁移 | 现有原生备份／空库恢复与摘要工具可用于演练；正式停写、最新归档、权限收紧和流量切换未执行 |

完整测试日志位于 .codex/mainland-setup/regional-tests-verified.log、regional-concurrent-final.log、regional-acceptance06-{chromium,webkit,oauth}.log。服务器报告为 .codex/regional-domain/server-smoke/report.json 和 rollback-regional-live.json。迁移前后旧值核对位于 preview-{before,after}-migration.json。

## 视觉检查

Chromium 和 WebKit 各 33 张实际视口截图，报告均 errors=[]。两种引擎覆盖 1440×900 桌面、320×560／390×640／430×780 手机和 844×390 触屏横屏；服务器常规网页另有 10 张截图，真实域名私有代理另有 6 张截图。全部是虚构数据。

- D1／D2：选区先显示两入口与分别登录说明；手机纵排，首屏可见两入口。四业务页保留核心读数、日期与主要图形，矮屏自然滚动。
- D3／D4：桌面并排选区、手机触摸及键盘焦点可用；记住主动选择仅高亮，重新打开不自动跳转。照片失败与重试不丢成功附件。
- D5：旧国际图片如实说明未复制；未知不补 0，不因地区改变已有数据含义。
- D6／D7：实际查看选择页、两区四页、320／390／430 手机、横屏及图片复用／缺配置截图，无裁切或横向溢出；原有四页布局与编辑器未改动。
- D8：这些是开发自检，实际页面仍待用户确认；不构成生产发布授权。

截图与报告在 .codex/regional-visual/{chromium,webkit}/，上海实际页面在 .codex/regional-domain/server-smoke/。本机展示副本在 Codex 私有 visualizations 下的 formward-regional-preview 目录。

## 域名与证书实际结果

用户提交的首次备案处于腾讯云初审，尚未备案成功。网站 A／AAAA／CNAME 没有启用，公网仅 SSH。API 返回的两条记录是平台原有 NS；控制台网站记录为 0，不能把 NS 当作已经开放网站。

正式证书覆盖 formward.top、www.formward.top、cn.formward.top、origin.formward.top；有效至 2027-01-28，未复制上海私钥到国际节点。全链和私钥 root 0600，DNS 凭据同为 root 0600，不进入 Git、应用包或国际网关。Vercel global 的 CNAME 精确值已保存，待正式切换再添加。

实际 systemd 强制续期获取了新证书并触发安装和 reload，随后实际握手与新证书一致。初次续期验收发现 Nginx reload 返回时旧 worker 尚未退出的短暂窗口；握手校验改为十五秒总期限内重试，始终保留信任链、主机名和指纹检查。修复后重新通过实际强制续期，撤销强制参数，正常服务与日常 timer 通过。自然到期周期尚未经历，不能称为已长期观测。

staging 首次访问海外 DoH 超时；改用客户端官方 DNS 传播等待。一次 origin 验证遇到 NXDOMAIN，两个权威服务器与 DNSPod 公共 DoH 均查到准确当前值；延长 staging 等待后通过。失败尝试与签发过程的 TXT 均由原值清理，没有清空其他 DNS 记录。中断清理工具只匹配本次日志、四个固定验证主机及准确 TXT 值，其他操作与类型拒绝。

Chromium／WebKit 还通过私有 CONNECT 代理使用真实域名，验证选择页、www 固定跳转、两区 Secure host-only Cookie、固定原 MCP 地址与拒绝匿名 origin。国内网页与 gateway→origin 使用正式证书、正常验证信任链；global 前端使用本机测试证书，仍待 Vercel 正式证书。没有修改系统 hosts 或公开网站 DNS。测试后恢复原私有预览配置并重新验证健康。

证据为 .codex/regional-domain/certificate-acceptance.json、tls-protocols.json、real-domain-browser.json、certificate-dns-authorities.json、dns-owned-cleanup.log、server-final-state.json。实际证书和续期演练与本机测试 CA 的浏览器报告分开保存。

## 尚未计入通过

真实 COS 的桶、IAM、CORS、字节读写与清理；真实 Blob／GPT 海外图片链路；Vercel 实际部署回源和各运营商跨境网络；global 的 Vercel 正式证书；自然到期续期；真实 iOS 与系统软键盘；备案通过、正式库备份与异机副本、停写迁移、main 合入、生产切换，均未计入通过。不得把本机 HTTPS 测试 CA、模拟存储或私有网关当作这些项目的替代证据。
