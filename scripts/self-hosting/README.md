当前双入口主库、原授权保持与验收边界见[双入口部署](../../docs/mainland-deployment.md)。历史私有预览脚本继续只允许 formward_preview，不可直接用于正式主库。

# 服务器部署与维护工具

本目录提供Ubuntu 24.04 amd64的独立预览脚本、同源发布构建与正式主库维护工具。应用采用独立非登录用户和systemd，数据库为PostgreSQL18。preview脚本固定回环私有环境；当前正式应用回环3200、数据库回环5432，公网入口由Nginx443代理。正式状态、证书、备份及未测范围见双入口部署与验收文档，不把预览脚本直接用于正式主库。

## 文件与运行关系

- bootstrap.sh：显式使用 --apply 后安装必要软件、建立专用目录与数据库角色、配置本机代理及定时备份。初次运行拒绝接管既有应用、PostgreSQL 集群或 Nginx；重复运行只更新带本项目管理标记的配置。
- package-release.sh／build-regional-release.mts：仅从干净提交的源码归档重新构建，同时生成上海 standalone 与国际 Build Output 网关，输出在被忽略的 .codex/regional-releases。产物绑定源码、锁文件、migration、BUILD_ID及协议摘要，不复用工作区旧 .next，不复制环境文件；相同发布标识拒绝覆盖。
- activate-preview.sh：核对归档 SHA-256，安全解包到新的版本目录，原子更新 current 并重启；核对实际版本、构建及数据库readiness；失败时只回退到理解同一schema和协议的版本。首次发布失败时停止服务，不留下错误的 current。
- formward-preview.service：用 formward 用户运行 current/server.js，仅监听 127.0.0.1:3000；异常退出后重启，读取 root 专有的 /etc/formward/preview.env。
- nginx-preview.conf：仅监听 127.0.0.1:8080；将请求转给应用，并覆盖代理来源头。外部仅通过 SSH 转发本机 3300 访问。
- backup-preview.sh、formward-backup-preview.service、formward-backup-preview.timer：每天 UTC 19:00（北京时间次日 03:00）后随机延迟最多 15 分钟，备份 formward_preview，保留 14 天。

服务器路径为 /srv/formward/preview/releases/<发布标识> 与 current 符号链接。发布包须包含 Next.js standalone 产物、.next/static 和 public；每个发布目录中的 .next/cache 应归 formward 可写，其他程序文件建议由 root 持有并允许 formward 读取。应用配置不进入发布包。

## 执行前提

先将经过校验的 Node.js 24.21.0 amd64 解压到 /opt/node-v24.21.0-linux-x64。bootstrap 不下载或执行第三方安装脚本。PostgreSQL 仓库按[官方 Ubuntu 指引](https://www.postgresql.org/download/linux/ubuntu/)下载签名公钥，使用 signed-by 限定仓库密钥，再安装 postgresql-18。

复制本目录的所有文件到服务器同一目录，检查脚本后执行：

~~~sh
sudo bash /路径/self-hosting/bootstrap.sh --apply
~~~

脚本固定使用 PostgreSQL 18/main、5432 端口，以及 UTF8 / C.UTF-8 / libc 的 formward_preview 数据库。独立 formward_preview 角色无超级用户、建库、建角色或绕过 RLS 权限，初始没有密码。首次建库时由此角色持有数据库；启动网页前应由私密 provision 建立独立 migrator、移交数据库及 schema 所有权，应用角色仅保留所需 DML 和 sequence 权限。bootstrap 重跑保留此后权限收紧，不把所有者改回应用角色。通过私密输入设置 SCRAM 密码后，再以 root 创建 0600 的 /etc/formward/preview.env，至少配置：

~~~dotenv
DATABASE_URL=postgresql://formward_preview:私密密码@127.0.0.1:5432/formward_preview
BETTER_AUTH_SECRET=独立测试环境的随机秘密
BETTER_AUTH_URL=http://127.0.0.1:3300
FORMWARD_TIMEZONE=Asia/Shanghai
~~~

真实 Neon 数据的迁移演练须使用另一个独立数据库，不能连接到此网页实例。预览库使用虚构账号、授权和健康记录；Blob / COS 凭据未配置时，不把图片保存和读取算作通过。生产秘密、真实密码及完整图片链接不能进入命令行、Git 或日志。

完成版本化 migration 后，通过发布工具核对并启用版本：

~~~sh
sudo bash /路径/self-hosting/activate-preview.sh 发布标识 /路径/发布归档.tar.gz 归档SHA256
sudo systemctl status formward-preview.service --no-pager
~~~

发布工具要求归档、版本名和摘要显式给出，拒绝覆盖已有版本。归档由当前项目构建后用 `bash scripts/self-hosting/package-release.sh 发布标识` 生成；构建前修改的源码必须重新构建，打包不会代替构建或测试。

bootstrap 会 enable 应用服务；应用文件或环境文件尚未就绪时，systemd 条件会跳过启动。Nginx、数据库及备份 timer 由脚本启用。数据库和应用不会监听公网，UFW 只允许 SSH 的 22/tcp；脚本不调整 SSH 登录配置。

## 本机访问

在自己的电脑建立 SSH 隧道，把本机 127.0.0.1:3300 转到服务器的 127.0.0.1:8080，然后访问 http://127.0.0.1:3300。固定使用此 Host 与端口，以匹配可信来源、会话和审核链接；不要把代理任意改为信任客户端提供的 X-Forwarded-For。

~~~sh
ssh -N -L 127.0.0.1:3300:127.0.0.1:8080 -i 私钥路径 ubuntu@服务器公网IP
~~~

代理超时为 120 秒，关闭响应和请求缓冲，禁用访问日志；Nginx 错误日志仅记录 critical 级别。应用日志进入 journald，并设置本服务日志速率限制，不修改全局 journald 配置。查询日志时避免输出真实健康数据或凭据。

## 备份与恢复验收

备份目录 /var/backups/formward 为 root 0700，dump 和 SHA-256 校验文件为 0600。备份用 PostgreSQL 18 的 pg_dump custom 格式，固定只连接本机 Unix socket 的 formward_preview。脚本用锁避免并发；文件名包含 UTC 时间，已有文件不会覆盖；失败的临时文件清理后保留先前成功备份。仅清理本脚本命名且超过 14 天的预览备份。

备份服务以 root 管理受限归档目录，并用 runuser 切换到 postgres 做本机 peer 认证。因此该维护服务显式设置 NoNewPrivileges=false；其他文件系统及地址族限制保留，网页应用服务继续设置 NoNewPrivileges=true。必须通过 systemd 实际运行备份，单独以 root 手动执行脚本不能证明定时任务权限可用。

~~~sh
sudo systemctl start formward-backup-preview.service
sudo systemctl list-timers formward-backup-preview.timer --no-pager
sudo journalctl -u formward-backup-preview.service -n 20 --no-pager
~~~

预览脚本会验证dump目录可读取，但完整恢复验收还需把备份恢复到另一个隔离数据库，检查schema、迁移账本、行数与数据摘要，再验证应用读写。此预览库任务只做本机备份；正式主库的私有COS加密异机备份已经启用，见下方正式主库维护工具。数据库备份均不包含Blob／COS图片原件，不能把同盘副本当作异机恢复保障。

## 维护

修改部署配置后先做 bash 语法检查、Nginx 与 systemd 配置检查，再在隔离服务器验证。已有数据库只通过 Drizzle migration 演进，bootstrap 不修改业务 schema。升级 Node 或 PostgreSQL 大版本应先核对兼容性、备份及恢复流程；当前参数不用于直接开放正式公网网站。

## 双区发布与私有HTTPS

当前网关固定iad1：香港回源公开版本接口实测TCP超时，iad1的TCP、TLS及HTTP200通过。国际产物的项目与函数配置均写iad1，发布命令仍须显式传`--regions iad1`，并核对部署API、两个别名和实际回源；仅本地配置或Ready状态不足。业务网关代码、JWT、issuer和resource不因区域改变。

- build-regional-release.mts 通过 pnpm release:regional 唯一发布标识执行；兼容已有表单时传入先前构建的 NEXT_SERVER_ACTIONS_ENCRYPTION_KEY 和 FORMWARD_BUILD_SOURCE_PATH，并核对原 action 标识全部保留。稳定源码路径只接受同仓库已登记 worktree 的私有发布目录下尚不存在的 source-* 子目录，不覆盖已有目录；国际包包含网关、海外图片处理与公开静态 CDN 文件，不包含数据库驱动、schema或COS SDK。源码归档单独保留用于追溯，不作为部署公开文件。
- activate-preview.sh 需先将 check-release.mjs 安装到 /usr/local/lib/formward，并在 root 专有的 preview.env 配置独立 FORMWARD_READINESS_SECRET。上一代不兼容时失败后停服，不回退到会错误读取COS的版本。当前与上一代自有哈希资源共存，缺失资源仍为404。
- regional.env.example 给出两节点分工。国际实例禁止配置数据库连接和 Better Auth secret；两区独立 Cookie，共用上海业务校验。
- nginx-regional.conf 仅监听回环8443，明确TLS1.2／1.3并拒绝未知SNI／Host；备案前不替换公网监听。
- install-certificate.sh --apply fullchain.pem privkey.pem 检查四个SAN、系统信任链、有效期与公钥匹配，版本化安装，测试或reload失败时恢复旧入口。check-certificate.sh 在十五秒总期限内等待 Nginx worker 完成切换，验证实际四个SNI、信任链、主机名、安装指纹与十四天期限。
- formward-certificate-renew.service／timer 为已验证安装的 /opt/formward-acme/acme.sh 及 root私有 /etc/formward/dns.env 准备。只有限定formward.top记录权限的DNS接口配置和固定版本客户端就绪后才启用；未实际签发／续期不能记录为通过。
- cleanup-images.mts 私有环境文件 blob|cos 不可变位置 [--apply] 默认为只读预览，只处理v2命名空间超过24小时的对象，账号行锁内核对数据库；不清理旧照片前缀。加--apply才删除确认未登记对象。
- rehearse-migration.mts 私有环境文件 check|migrate|backup 只接显式REHEARSAL_DATABASE_URL，限制回环独立演练库，不读取.env.local，也不使用父进程DATABASE_MIGRATION_URL。正式切换仍需停写、最新一致性备份、恢复核对和两区同时切换，不能直接回退旧快照。

固定ACME客户端为3.1.6，源码提交与SHA见acme-pin.json。install-acme-client.sh --apply 已下载官方归档验证摘要后离线安装，不签发证书。issue-certificate.sh通过私有EnvironmentFile注入Tencent_SecretId／Tencent_SecretKey，先独立staging验证，再签发正式证书与安装；只有实际握手、自动续期和失败恢复验证后才启用续期timer。


check-dns.mjs 使用专用 EnvironmentFile 默认只读查询 formward.top，区分平台 NS 与网站记录。--cleanup-issue /var/lib/formward/certificate-issue-attemptN.log 默认为预览；再加 --apply 才删除日志中准确匹配的四个签发域名、TXT 类型和验证文字，不删除其他操作或网站记录。node --test scripts/self-hosting/check-dns.test.mjs 验证此边界。私密原始响应和密钥不输出。

issue-certificate.sh 使用官方 --dnssleep：staging 等待 180 秒、正式等待 60 秒，避开上海访问海外公共 DoH 的不稳定性；仍由证书机构完成真实 DNS 验证，保留证书信任链和主机名验证。签发过程中需从两台权威 DNS 核对验证记录；失败记录按原值清理，不能清空全部 TXT。

实际强制续期通过后移除仅用于演练的 systemd override，再启动正常服务并启用 timer。固定客户端的 account.conf 设置 AUTO_UPGRADE=0；日常任务只检查到期与 ARI 建议窗口，不每天重签。生产切换前先统一停写，再核对国际 Vercel 环境仅含网关与 Blob 所需配置，移除旧数据库连接和 Better Auth 签名秘密后部署国际网关，不让旧业务实例继续写入。


首次HTTPS入口使用 formward-certificate-issue.service：先安装 nginx-regional.conf 到 /etc/formward/nginx-regional.conf.prepared，再安装 issue／install／check／prepare 四个证书脚本和 service。由 systemd 的私有 EnvironmentFile 注入凭据，执行 systemctl start formward-certificate-issue.service。prepare-certificate-preview.sh 拒绝非回环监听，先签发并安装证书，再配置回环TLS并检查真实握手，避免首次启动时配置引用尚不存在的证书；已有配置失败时恢复原文件。acme.sh 返回2只表示未到续期时间，仍需已有正式证书与实际握手通过，其他错误不计为成功。首次服务不 enable，不承担日常续期；日常使用独立 renew.timer。

## 正式主库维护工具

primary-backup.py固定备份formward_primary，原生归档、清单与SHA保存在root专用目录，匹配的本机日备份保留14天；backup-crypto.mjs以AES-256-GCM加密并拒绝越界和覆盖，密钥单独保存在root 0600文件。备份随后调用backup-offsite.mjs上传加密副本到既有上海私有COS的专用database-backups/formward-primary/v1前缀，完整回读并核对SHA后才报告成功。COS凭据只从root私有配置读取，不上传密钥和明文，也不改照片目录、桶权限或生命周期。

远端同名对象内容一致时复用，不一致时拒绝覆盖；请求携带禁止覆盖头。远端备份暂不自动删除，本机清理只在本次异机校验成功后执行。网络失败保留本机副本，formward-primary-backup.service每5分钟重试，1小时内最多3次，下一次日计划仍可正常启动。[腾讯云PUT Object说明](https://intl.cloud.tencent.com/document/product/436/7749?lang=en)定义禁止覆盖语义；桶版本控制开启时该请求头无效，因此仍先检查现有对象与完整回读，且任务本身由本机锁串行执行。

恢复时用backup-offsite.mjs download 备份文件名 /var/backups/formward-primary/recovered-备份文件名取回并核对密文；backup-crypto.mjs decrypt解密后，再恢复到全新隔离库验收。恢复命令拒绝已有文件、符号链接与路径越界，不能直接覆盖正式库。root专有归档不能直接交给postgres读取：由root运行pg_restore --no-owner --no-acl --single-transaction --file=-，将SQL流送入以postgres身份连接新隔离库的psql，并开启ON_ERROR_STOP及显式目标所有者；不要为恢复放宽备份目录权限。实际日任务的COS副本已用此方式完整恢复，结果见验收文档。node --test scripts/self-hosting/backup-offsite.test.mjs覆盖上传、重复、损坏、断网、权限、明文误传和恢复边界。

primary-sync.py读取本机正式配置调用定时同步入口，不输出上游凭据。正式库、维护开关和账号规则与预览脚本分开，不能将本目录旧预览脚本直接改名后用于正式库。实际定时器启用、异机备份与恢复演练状态见[双入口验收](../../docs/regional-acceptance.md)；监控、表结构与维护入口见[查看指南](../../docs/server-operations.md)。
