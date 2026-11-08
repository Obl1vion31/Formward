# 公网 IP 测试环境

## 入口与数据范围

测试入口为 [https://43.142.148.58](https://43.142.148.58)，部署在腾讯云上海轻量服务器 lhins-pnkjkh1o。HTTP 仅处理证书验证和 HTTPS 重定向；网页登录后才可读取测试账号的数据。

测试库为服务器本机的独立 PostgreSQL 数据库 `formward_ip_preview`，测试账号为 `ip-preview@example.test`。初始化夹具与网页验收记录均为虚构数据。密码位于服务器 `/etc/formward/ip-preview/access.json` 与本机被忽略的 `.codex/ip-preview/access.json`，不写入仓库或 public。测试账号与正式账号独立。

正式 Vercel 网站、Neon 连接、原 `formward_preview` 私有环境与域名解析保持原状。测试版未配置生产照片存储、Garmin 连接或 MCP OAuth 客户端，这些外部接入不属于本轮已迁移或已验收范围。

## 服务与发布包

- 发布目录：`/srv/formward-ip-preview/releases/ip-preview-b0155db-20261109/app`，`current` 指向当前发布。
- 服务：`formward-ip-preview.service`，独立系统用户 `formward-ip`，Node.js 24.21.0，仅监听 `127.0.0.1:3100`。
- Nginx：`/etc/nginx/sites-available/formward-ip-preview.conf`，将指定 IP 的 HTTPS 请求代理至新服务。
- 配置：`/etc/formward/ip-preview/app.env`，仅根用户可读；认证密钥与数据库口令独立生成。
- 应用角色 `formward_ip_preview_app` 获得测试库日常读写权限；迁移角色 `formward_ip_preview_migrator` 执行既有 Drizzle migrations。专用 HBA 规则拒绝这两个角色连接其他数据库，数据库继续仅监听回环地址。
- 源提交：`b0155db236a636ee45965555eefe9b66f9c8b7e6`；页面版本：`ip-preview-b0155db-20261109`；构建标识：`FwDebefP5Hpfj-uHre695`。
- 发布包 SHA-256：`16baf31bc8d7e9480349397fbd33115202730053e594f2aca20073c53b58c2fd`。归档、安装脚本与临时账号文件收回 `/var/lib/formward/ip-preview/uploads` 根用户私有目录。

仅在构建时设置 `FORMWARD_STANDALONE=1` 才启用 Next.js standalone，默认 Vercel 构建保持。发布包包含 standalone、public、静态构建文件、既有 drizzle 文件与打包后的初始化器；不含环境文件或密码。`scripts/prepare-ip-preview.mts` 仅允许本机指定测试库和虚构邮箱；已有测试账号与记录不重置。不从区域原型库导入迁移账本，不复制正式用户数据。

## HTTPS 与备份

已安装的 acme.sh 通过 Let's Encrypt shortlived profile 签发 IP 证书，SAN 为 43.142.148.58，初次证书有效期至 2026-11-15 11:48:45 UTC。`formward-ip-certificate-renew.timer` 每六小时检查续期，独立使用 `/var/lib/formward/acme-ip-preview`；证书安装回调先检查 Nginx 再重载。原域名证书配置保持。

`formward-ip-preview-backup.timer` 每天服务器时间 03:30 备份测试库至 `/var/backups/formward-ip-preview`，目录与文件仅根用户可读。首次备份已生成并通过 `pg_restore --list` 检查；尚未做完整恢复演练，生产迁移前需单独验证恢复与切换。

## 运行维护

查看服务使用 `sudo systemctl status formward-ip-preview.service`，日志使用 `sudo journalctl -u formward-ip-preview.service`。手动备份使用 `sudo systemctl start formward-ip-preview-backup.service`。维护任务使用 `sudo systemctl list-timers 'formward-ip-*'`。

停用测试入口时停止新服务，并禁用 IP 专用 Nginx 站点后检查、重载 Nginx；保留数据库、审计与备份。代码回滚只切换本服务 current；数据库回退须按备份与 migration 兼容性另行评估。原私有环境保持。

实际检查结果见 [验收记录](maintenance-verification.md)。
