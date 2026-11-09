# 上海服务器与数据库查看

## 当前部署状态

国服公网 IP 与 Vercel 国际入口均已连接上海正式库 formward_primary，2026年11月9日19:25（上海时间）开放写入。Neon 已隔离停写。恢复和连接验收见[双入口验收](regional-acceptance.md)。

## 入口和数据位置

~~~mermaid
flowchart LR
  CN["国服网页 · 上海公网 IP"] --> APP["上海 Formward 业务"]
  GPT["GPT 等海外客户端"] --> GLOBAL["Vercel 国际入口"]
  WEB["国际网页"] --> GLOBAL
  GLOBAL -->|"已签名业务请求"| APP
  APP --> PG["上海 PostgreSQL · 仅回环监听"]
  GLOBAL --> BLOB["海外私有 Blob"]
  CN --> COS["上海私有 COS"]
~~~

PostgreSQL 保存账号、授权、饮食、身体、训练、Garmin 来源与附件关联。图片原件保存在 Blob 或 COS，不放在数据库字段、Git 或 public 目录。GPT 原图由海外图片服务下载，上海负责归属、状态和附件登记。

所有正式入口写入同一上海主库；Neon 停写保留为切换备份材料。开发与测试继续使用隔离数据库，不把本机演练副本当成正式数据源。

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

每日03:20（上海时间）运行 formward-primary-backup.timer，生成原生归档与 AES-256-GCM 加密副本，匹配命名的日备份保留14天；每日06:00运行 formward-primary-source-sync.timer。两项已启用并实际执行成功。一次性完整恢复演练已通过；日常作业只自动校验归档目录，不应称为每天完整恢复。

原生与加密备份位于 /var/backups/formward-primary（root 0700）；密钥为 /etc/formward/backup-key（root 0600）。本次加密副本已经验证解密后 SHA-256 相同。异机自动归档尚未配置，单次异机下载结果见验收记录；数据库备份不含 Blob／COS 图片原件。
