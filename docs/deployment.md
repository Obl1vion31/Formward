# 公网 HTTPS 部署

## 当前正式版本

正式站[formward.top](https://formward.top)运行`dual-entry-a82db923-chat-reliability-20261117`，源码`a82db923833a863e16d382f33e9e51f834678709`，BUILD_ID `pbK1ryDsyEmyrjxDdv4R6`；北京时间2026-11-17 02:46:27切换。功能已推送main，后续文档提交不改变运行源码。

普通聊天与本餐识图由独立后台进程执行；切后台、断网、刷新或收起只影响页面接收，返回后读取同一任务和已有回答，不自动收费重发。主动停止仍取消任务；服务器异常保留已生成内容及未知费用，必须人工选择继续或重试。没有重新开启已结束的旧任务。

图片固定关联真实问题、引用或补充来源，读取时检查本人归属、格式、大小与SHA256，保留原字节及顺序；逐轮私有记录请求摘要、实际配置模型、图片摘要及供应商可用请求标识，不记录Key、Cookie或完整图片正文。模型选项只影响下次发送，历史回答继续显示原模型。

lint、typecheck、818项单元／集成及production build通过。最终兼容运行包在隔离原生PostgreSQL、虚构账号与独立worker下，通过Chromium／WebKit的断网恢复、生成中刷新、收起重开、主动停止和模型归属检查；每项核对同一任务、一次替身请求和结算。WebKit主动断网／重载引起的两条本机fetch错误单列为预期中断，其他异常不忽略。

版本化0042仅为assistant_runs新增持久参数、领取状态及请求诊断。切换前完成原生备份、加密异机回读及独立恢复迁移；60张既有表原列／值保持，迁移重复无操作。正式升级41→42，服务身份、账号凭据和运行配置保持；新旧应用分别以实际服务身份通过就绪。51项旧Server Action及原绑定密钥保留，补留993项旧静态文件。应用与formward-chat-worker均active、重启计数0；四公网入口版本一致，HTTP1.15.1、MCP2.0.2／18项及匿名拒绝保持，国际网关无需重发。

完整兼容运行包75,072,618字节，SHA256 `31725b4dc90355d4dc1c76e91c1f121409c610dcdeec90e4a889d9c994757f73`，永久归档在原入口`.codex/backups/regional-releases/chat-reliability-20261117`。即时回退为`energy-popover-20261117`（f57d42f5）；先停worker再切应用，保留0042、聊天、费用和健康数据，不恢复旧库。

香蕉答复的历史排查确认：库中牛奶、鸭锁骨原图登记摘要与实际字节一致，两次重传解码像素一致；千问两个请求的usage均含4992图片tokens。历史未留出站正文，不能据此证明上游实际收到的像素，也不能宣布识图错误已根治。未追加收费复现。

未实测真实iPhone锁屏／切后台、系统软键盘、系统字号或屏幕阅读器，不把WebKit模拟记作真机通过。没有新增收费模型调用，没有写正式健康测试数据；不以隔离回放证明模型识图准确率。此前已实施的食量规则、参数容错和修改保留规则继续保留。

本轮日志、原始故障、诊断、截图及HTML／Markdown／JSON报告保存在原入口`.codex/chat-reliability-20261117`；可读报告及最终截图另存Windows私有`C:/Users/14878/.codex/visualizations/2026/11/11/01a1c95d-1339-7623-a50d-637f95b00bff/chat-reliability`，不进入public或部署依赖。

## 迁移与发布

先核对最新main、实际公网和其他未提交任务。运行lint、typecheck、真实测试文件清单、production build及受影响浏览器全过程；不能以最终截图、DOM存在或误展开4个文件代替。隔离PostgreSQL和虚构账号不连接正式库，不自动调用收费模型。

结构仅由版本化Drizzle migration演进，已发布迁移不修改；新迁移先备份、加密异机回读、隔离恢复排演和旧值／重复检查。构建不自动迁移。当前schema0042、42项账本；0041及0042均保留旧应用读写兼容，不反向迁移。启用0042时同时启动独立chat-worker，回退先停worker。

先保存本机永久运行包并验摘要，保留旧Server Action、密钥和静态资源，验收后，先以服务账号核对新目录可进入、文件可读取，并在私有端口启动正式配置完成readiness；顶级目录权限不得因私有umask变为0700。通过后才原子切应用指针；核对readiness、源码／schema／数据库及正式版本、健康和凭据摘要。失败只回切兼容应用，不恢复旧库或删数据。Vercel专用网关沿用下方归档工具与明确别名范围；Git推送不自动发布，不用根Next产物当网关，不以项目级promote接管其他别名。无网关改动时核对既有READY绑定和实际回源即可。

## 正式运行包归档与旧部署清理

GitHub 保存源码历史，本机永久保存每次正式发布的运行包；Vercel 保留最近三个成功 Production 版本、最近三个部署，以及域名绑定、当前目标、回滚目标和本机最近观察到的两个正式版本。实际保留数量可能超过三个。旧预览地址随部署删除失效；应用包不等于真实数据或密钥备份。

统一工具为 `scripts/vercel-releases.py`（Python 3，Linux／WSL，无新增 Python 依赖）。两个仓库的工具和专用测试保持相同实现。先激活既有 Node 环境；CLI 不在 PATH 时用 `VERCEL_CLI` 指向现有可执行文件，不另行全局安装。工具核对当前仓库和项目，只操作指定项目；所有动作默认预检，写入使用显式 `--apply`。

```bash
python3 scripts/vercel-releases.py inspect --project formward
python3 scripts/vercel-releases.py archive --project formward --deployment dpl_ID --apply
python3 scripts/vercel-releases.py verify --project formward --deployment dpl_ID
python3 scripts/vercel-releases.py publish --project formward --deployment dpl_ID --apply
python3 scripts/vercel-releases.py cleanup --project formward --limit 20 --apply
python3 scripts/vercel-releases.py policy --project formward --apply
```

正式发布顺序为：沿用本项目现有构建生成不接正式域名的 READY 候选 → 完成对应功能验收 → 通过 `publish` 归档原始产物、切换版本、只读核对并清理。不能绕过归档直接切正式域名；本工具不替代候选功能验收、不重新构建，也不调整应用或数据库配置。

归档按项目和部署 ID 区分，包含压缩的原始运行目录、源码快照、依赖锁、运行时、文件摘要和配置键的 ID／更新时间。部署元数据与包内 SOURCE_COMMIT 不同时保留两个源码快照，不声称 Git 提交等同于当时可能有未提交内容的构建。已有包校验通过后复用；损坏、下载失败、空间不足或配置缺失均停止发布与清理，不覆盖旧包。SHA256SUMS 支持独立校验；恢复时仍须核对数据库版本和另存的密钥。

清理先核对所有正在使用的域名均有完整本机归档，再检查正式服务；每次最多二十个，每个删除前重新核对发布清单和域名。发布变化、构建进行中、接口错误或检查失败即停止，不自动修改域名或回滚。每批私有日志保留具体删除 ID 和前后检查结果。七天自动保留策略仅为补充，平台例外仍可能保留更多部署。

本机运行包不自动删除。云盘由用户处理；电脑／WSL 损坏的风险仍存在，但不作为删除无用旧部署的前置条件。秘密单独私有保存，不进入 Git、公开日志或归档元数据；本次不追溯下载所有更早的运行包。

归档位于 Git 公共目录所属工作区的 `.codex/backups/vercel-releases/formward/`，不随临时 worktree 删除。国际候选继续使用现有双区工具并显式部署到 iad1；`publish` 只更新原国际正式版本承担的别名，保留仍指向其他部署的项目域名，不用项目级 promote 接管它们。既有上海服务、数据库、issuer／resource、Server Action 兼容与回退流程不变。网关归档中的协议和 schema 摘要仍须与上海服务核对；本工具不把 Vercel 网关包当成上海全服务备份。受 Vercel 登录保护的旧项目域名只核对绑定和保护入口，不声称完成应用功能验收。


## 平台与变量

上海业务使用 Node.js 24 和 PostgreSQL 18。Vercel 项目 `formward` 使用专用国际 Build Output 产物，发布区域显式指定 `iad1`；不能用根目录完整 Next.js 构建替代网关产物。`ENABLE_EXPERIMENTAL_COREPACK=1` 使用 package.json 的 pnpm 9.15.9，安装继续使用 frozen-lockfile。正式运行包归档和发布入口见本文开头，双区构建见[国服与海外后台](mainland-deployment.md)。

通过 CLI 手动发布，没有 Git 自动部署；Git 推送不会更新正式网站。Standard Protection 保护 Preview 和单次部署地址，正式别名公开。项目关联信息在被忽略的 `.vercel/`。

当前正式变量按运行位置分配：

| 变量 | 上海业务／维护 | Vercel 海外网关 |
| --- | --- | --- |
| DATABASE_URL | 仅回环连接 formward_primary，应用运行身份 | 不配置 |
| DATABASE_MIGRATION_URL | 仅维护进程使用独立管理身份 | 不配置 |
| BETTER_AUTH_SECRET | 保留原认证 secret，只在上海读取 | 不配置 |
| BETTER_AUTH_URL | https://formward-ten.vercel.app，保留原 issuer／resource | 相同公开入口 |
| FORMWARD_GATEWAY_SECRET／FORMWARD_IMAGE_SECRET | 私有共享的服务证明和图片能力配置 | 对应独立敏感变量 |
| FORMWARD_ORIGIN_URL／区域入口 | 已验证的回源和国服入口 | 同一套已验证入口，实际函数区域 iad1 |
| FORMWARD_TIMEZONE | Asia/Shanghai | Asia/Shanghai |
| ENABLE_EXPERIMENTAL_COREPACK | 构建时按既有流程设置 | 1 |
| BLOB_STORE_ID | 按海外图片职责调用网关 | Private Blob 自动关联，SDK 使用部署 OIDC |
| BLOB_WEBHOOK_PUBLIC_KEY | 当前预签名流程不依赖 webhook | 平台自动维护 |

真实数据库与存储不连接 Preview，不使用 NEXT_PUBLIC_ 变量保存秘密。本机 `.env.local` 仅连接隔离开发库，不再保留 Neon 连接；示例见[账号接入](auth-setup.md)。国际项目不配置 DATABASE／POSTGRES／NEON 连接或认证签名 secret；变量变化后重新部署。确认链接和 OpenAPI 使用 BETTER_AUTH_URL，忽略代理内部地址和请求 Host。默认时区使用 FORMWARD_TIMEZONE，HTTP 请求 X-Formward-Timezone 优先，按发生时的夏令时计算偏移。


## 私有原图

聊天／饮食共用一次读取的原图，JPEG／PNG／WebP，20MiB、最多8张；不缩放重编码。每批探测受控国内／国际通道，手动仅覆盖本批，历史照片不搬迁。国内COS限定精确来源，海外使用官方预签名一次PUT；Private Blob只关联Production，不改Public，不发静态凭据。

票据15分钟，传输总期限10分钟／连续60秒无新增字节停滞；100%后complete核对登记。取消、失败保留草稿，换路由用户明确点击，不静默重传。国内同源备用走回环3201及660秒；普通业务3200和代理120秒保持，20MiB大图不进旧4MiB入口。外部下载规则不与网页传输期限混用。

原图读取校验会话与归属，private/no-store。诊断只记阶段、通道、耗时、字节和受限错误，不记照片、文件名、签名或凭据。真实存储、备用、浏览器回放和真机分别记录；具体见[饮食](meals.md)及[助手验收](assistant-chat-verification.md)。

## 验收与维护

公开检查首页、HTTPS跳转、OpenAPI、OAuth／MCP resource、匿名拒绝及实际版本；真实登录会话只读核对。报告和上传原图私有，模拟、回放、存储实传及物理设备分开记。应用包不等同数据库／密钥备份，保留兼容回退。账号安全与权限见[账号接入](auth-setup.md)，当前检查及边界见[实现状态](status.md)。
