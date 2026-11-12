# 上海服务器与数据库查看

## 当前部署状态

日常网页只有[上海公网IP入口](https://43.142.148.58)。Vercel保留GPT／MCP、OAuth和海外图片后台，普通旧网页自动转国服；两部分共用上海formward_primary，59张应用表加Drizzle账本（共60表）／37条migration。旧 Neon 项目已删除，旧源只保留私有归档。恢复和连接验收见[验收记录](regional-acceptance.md)。

候选应用服务按唯一发布编号命名，退出后停止并清理该临时服务；不同发布不共用候选服务名。近期已经成功且完成异地回读的备份可供同结构的界面补丁复用，避免重复启动触发备份频次限制。

数据库结构变更以专用管理身份运行已提交的Drizzle migration。运行账号没有建表权限，不应通过扩大它的CREATE权限来发布；新表单独授予业务所需权限。迁移前备份，迁移后核对旧结构、事实、来源、审计及账本，回退保留合法更新。

## 入口和数据位置

~~~mermaid
flowchart LR
  CN["国服网页 · 上海公网 IP"] --> APP["上海 Formward 业务"]
  GPT["GPT 等海外客户端"] --> GLOBAL["Vercel 海外后台"]
  OLD["原网页地址"] -->|"临时跳转"| CN
  GLOBAL -->|"已签名业务请求"| APP
  APP --> PG["上海 PostgreSQL · 仅回环监听"]
  GLOBAL --> BLOB["海外私有 Blob"]
  CN --> COS["上海私有 COS"]
~~~

PostgreSQL 保存账号、授权、饮食、身体、训练、Garmin 来源与附件关联。图片原件保存在 Blob 或 COS，不放在数据库字段、Git 或 public 目录。GPT 原图由海外图片服务下载，上海负责归属、状态和附件登记。

所有正式入口写入同一上海主库；旧 Neon 最终源归档保存在服务器切库证据目录及本机私有 `data/exports/`，不再作为日常开发或正式恢复目标。开发与测试继续使用隔离数据库，不把本机演练副本当成正式数据源。

## 旧 Neon 项目退役

2026年11月11日，Neon 旧项目 Formward（plain-feather-67562814）已删除，项目列表仅余独立的 FRONTEND。平台显示一个项目待恢复期结束后永久删除；本次未执行提前永久清除。上海主库、原 GPT／MCP、OAuth、Blob／COS 及其他项目保持原职责。

本机 `.env.local` 已改为隔离 PGlite 回环连接，migration 沿用本机连接；其他配置保持。Vercel 全部环境变量经 API 核对，无 DATABASE／POSTGRES／NEON 连接或 BETTER_AUTH_SECRET，无需修改或重发网关。已有项目进程环境中也未发现旧 Neon 数据库连接。新开发环境按[账号接入](auth-setup.md)启动本机数据库，不复用正式库。

删除前已完成两项实际恢复，而非仅检查文件存在：

- 使用2026年11月9日切库隔离停写后的最终源归档 `dual-entry-final-20261109T111422336Z.dump`，核对 SHA256 并在全新本机 PostgreSQL 18 隔离库完整恢复；54表、33条源迁移、全部行摘要、列、约束、索引及序列与原始 manifest 一致。
- 从私有 COS 重新下载2026年11月11日03:20的主库备份，校验密文摘要、AES-256-GCM认证解密及原生归档摘要后，完整恢复到另一个隔离库；55表、36条migration，未发现无效约束或索引。此次完整恢复独立记录，不改写日任务原有的 `fullRestoreForThisDailyRun=false`。

两份原生归档及摘要另存本机私有 `data/exports/`、文件权限0600；旧源原件继续留在服务器 `/var/lib/formward/dual-cutover/final-data/data/exports/`，正常主库备份与 COS 副本按既有策略保留。临时恢复集群已清理，图片原件不包含在数据库归档中。配置核对、完整恢复结果、检查日志及删除后的公网记录在主工作区私有 `.codex/neon-retirement/`，截图在用户电脑私有可视化目录；不提交健康内容或密钥。

634项单元／集成、lint、typecheck、production build和目录结构检查通过。删除后11项公网探测通过：三入口版本及OAuth发现信息与删除前一致，两个海外匿名MCP请求均401；上海业务、Nginx、PostgreSQL及备份timer均active。此次仅配置、注释和文档收尾，没有应用行为或数据库结构变更，不重发应用。

## CPU、内存和网络

打开[这台实例的监控页](https://console.cloud.tencent.com/lighthouse/instance/detail?rid=4&id=lhins-pnkjkh1o&tab=monitor)，选择实时、近24小时、近7天或指定日期。可查看 CPU、内存、公网出带宽、内网带宽、TCP 连接数、磁盘读写与 IOPS；某项显示无数据时，不能按零使用量解读。

[腾讯云实例监控文档](https://cloud.tencent.com/document/product/1207/46856)说明了各入口和告警设置。实例概要另提供套餐和流量包信息。网络带宽单位为 Mbps，流量累计通常以 MB／GB 计，两者不能直接比较。

这里显示整台服务器的使用量，包含网页、数据库、国际回源、Garmin 和备份。它不等于单个 PostgreSQL 数据库的 Network Transfer。自建 PostgreSQL 不会自动获得 Neon 控制台的数据库计费／网络面板。

## 查看表、字段与容量

当前 PostgreSQL 是安装在轻量服务器内部的原生服务，不是另外购买的腾讯云托管数据库。轻量云侧栏的“数据库”列表不会自动列出服务器内部安装的实例。

在腾讯云这台服务器的 OrcaTerm 终端执行：

~~~sh
sudo -u postgres psql -X -d formward_primary
~~~

进入后先开启只读事务，再使用以下命令：

~~~sql
BEGIN READ ONLY;
SELECT current_database(), version();
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;
\dt public.*
\d public.training_sessions
SELECT datname, numbackends, xact_commit, xact_rollback, deadlocks
FROM pg_stat_database WHERE datname = current_database();
ROLLBACK;
\q
~~~

当前正式库名称为 formward_primary；隔离恢复库不能代替正式库。表与字段的完整中文解释见[数据库字典](database.md)。

图形管理器可通过 SSH 隧道连接数据库回环地址，适合查看关系、筛选和只读 SQL；应用密码及迁移角色密码不放入文档或聊天。当前迁移不对公网开放 5432，也不部署公开的数据库管理后台。

## 运行位置

| 内容 | 服务器位置 |
|---|---|
| 业务服务 | formward-primary.service，回环端口3200 |
| 当前程序 | /srv/formward-primary/current |
| 原始授权及运行配置 | /etc/formward/primary.env，root 0600 |
| PostgreSQL | 18/main，回环5432 |
| 国服入口与证书 | Nginx 443、现有 IP HTTPS 证书与续期任务 |
| 独立演示库 | formward_ip_preview，和正式库分开 |

服务状态可通过 systemctl is-active formward-primary.service nginx postgresql 查询。读取日志时只检查必要错误与请求状态，避免把健康内容、临时图片链接或凭据贴到公开位置。备份和恢复的实际验证结果见双入口验收；同盘备份与异机备份分别记录。

## 备份和定时任务

每日03:20（上海时间）运行 formward-primary-backup.timer，生成原生归档与AES-256-GCM加密副本，再自动上传至私有上海COS；云端完整回读及SHA核对通过才报告成功。失败每5分钟重试，1小时最多3次，保留本机文件。匹配命名的本机日备份保留14天，COS备份暂不自动删除。每日06:00运行 formward-primary-source-sync.timer。两项均已启用并实际执行成功。

在[腾讯云对象存储](https://console.cloud.tencent.com/cos/bucket?bucket=formward-images-1520483841&region=ap-shanghai)进入“文件列表 → database-backups → formward-primary → v1”，可查看加密备份文件、大小和生成时间。该目录仅向原服务器存储子账号授予上传和读取权限，没有新增删除或公开权限；不能把备份地址当作公开下载链接。

原生与加密备份位于 /var/backups/formward-primary（root 0700）；密钥为 /etc/formward/backup-key（root 0600），另有用户电脑受限目录中的独立密钥副本，不能与备份一并上传COS或贴入聊天。电脑中保留的单次离线副本已认证解密并核对SHA。数据库备份不含Blob／COS图片原件。

本次实际日任务的云端副本已重新下载、认证解密，并完整恢复到新隔离库，54表、34条migration及约束／索引检查通过。恢复时保留root专有归档权限，由root运行pg_restore读取归档，再将SQL流送入以postgres身份运行的psql；目标必须是全新隔离库，不能直接覆盖正式主库。首次文件读取权限失败及后续通过证据均私有保留。日常任务自动校验归档和云端回读，不是每天自动完整恢复。

证书续期timer每6小时检查，当前已启用；自然到期后的下一轮续证和长期保留周期仍需按日常运维观察。工具与恢复边界见[服务器维护工具](../scripts/self-hosting/README.md)，本次实际结果见[双入口验收](regional-acceptance.md)。
