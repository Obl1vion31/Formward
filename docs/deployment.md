# 公网 HTTPS 部署

正式域名为 [Formward](https://formward-ten.vercel.app)，Next.js 由 Vercel Hobby 托管，数据库沿用 Neon PostgreSQL。AI 使用正式 [OpenAPI](https://formward-ten.vercel.app/api/v1/openapi.json) 或 `https://formward-ten.vercel.app/api/mcp`，不能使用受 Deployment Protection 保护的单次部署／预览地址。

当前正式站READY部署dpl_4ftctbpujyRJjuwGYnT6rK6tGocv，运行代码35479cf（分支codex/latest-records-energy-sources，已推送、尚未合入main），数据库0025，共39张应用表加Drizzle账本。本轮餐次输入对齐和本次总营养无migration；已做发布前后私有备份，正式域名15项公开／保护入口、虚构账号双浏览器五种宽度及保存／AI审核验收通过，测试数据已清理。40表原有结构、账本、健康事实、请求与审计完全保持；正常OAuth使用和刷新轮换元数据单独核对保留。OpenAPI1.12.0／MCP1.10.0、13工具；Node.js24.21.0、pnpm9.15.9、Next.js16.3.7。证据在.codex/meal-total-release/，具体结果见[验收记录](maintenance-verification.md)。

## 平台与变量

Vercel 项目 `formward`，Framework Next.js，仓库根目录，Node.js 24.x。`ENABLE_EXPERIMENTAL_COREPACK=1` 使用 package.json 的 pnpm 9.15.9。`vercel.json` 固定 frozen-lockfile 安装、`pnpm build` 和函数区域 cle1，靠近 Neon us-east-2。

通过 CLI 手动发布，没有 Git 自动部署；Git 推送不会更新正式网站。Standard Protection 保护 Preview 和单次部署地址，正式别名公开。项目关联信息在被忽略的 `.vercel/`。

Production 变量：

| 变量 | 内容 |
| --- | --- |
| DATABASE_URL | 原 Neon pooler 连接串，保留 TLS，敏感变量 |
| BETTER_AUTH_SECRET | 原认证 secret，敏感变量 |
| BETTER_AUTH_URL | https://formward-ten.vercel.app |
| FORMWARD_TIMEZONE | Asia/Shanghai |
| ENABLE_EXPERIMENTAL_COREPACK | 1 |
| BLOB_STORE_ID | Private Blob 连接自动配置；SDK 使用部署 OIDC |
| BLOB_WEBHOOK_PUBLIC_KEY | 平台自动维护，当前预签名流程不依赖 webhook |

真实数据库与存储不连接 Preview，不使用 NEXT_PUBLIC_ 变量保存秘密，不覆盖本机 `.env.local`。变量变化后重新部署。确认链接和 OpenAPI 使用 BETTER_AUTH_URL，忽略代理内部地址和请求 Host。默认时区使用 FORMWARD_TIMEZONE，HTTP 请求 X-Formward-Timezone 优先，按发生时的夏令时计算偏移。

## 私有原图

Blob 必须为 [Private](https://vercel.com/docs/vercel-blob/private-storage)，只关联 Production。当前 SDK @vercel/blob 2.8.1，通过 BLOB_STORE_ID 与平台 OIDC 认证，无生产静态读写令牌；不要把存储改成 Public。

网页原图最大 20 MiB、最多 8 张，JPEG／PNG／WebP。prepare 为当前账号签发限定路径、摘要、类型、大小和 10 分钟期限的凭据；SDK 取得受限预签名后，浏览器直接上传私有 Blob，complete 再校验实际内容并登记。大图不进入 Function 请求体；旧 multipart 入口只兼容 4 MiB，需刷新使用新版网页。该流程没有上传回调，不需要开放 webhook 路由。

MCP／HTTP 通过 ChatGPT 临时文件 URL 下载并存入同一私有库。API 函数最长 120 秒，单批上传设置 85 秒截止、最多两张并行下载，返回逐图结果；成功附件保留，失败项可单独重试。私有文件只由 `/api/meal-images/[id]` 校验会话与归属后返回，private/no-store；存储原始地址不提供匿名读取。

本机 OIDC 是 Development 身份，即便 `vercel env run -e production` 拉取变量仍不能访问 Production-only 存储。若必要的维护测试临时连接 Development，必须保留原连接快照，关闭敏感标记才能添加该环境，并在 finally 中恢复仅 Production 与敏感标记；不创建静态凭据、不连接 Preview。不要输出、提交或发送 OIDC／下载 URL／密钥。

Hobby 配额遵守 [Blob 用量规则](https://vercel.com/docs/vercel-blob/usage-and-pricing)，超过配额明确失败，不自动升级。

## 迁移与发布

修改前读根 README、AGENTS 和对应 README、当前 Next.js 本地文档。发布前运行 lint、typecheck、unit/integration test、production build、结构检查及受影响浏览器检查。浏览器使用独立 PGlite、端口和虚构账号；同一个 `.next` 构建目录不同时用于构建和正在运行的浏览器服务。

新增migration先纳入版本控制，再保存私有一致性备份、执行和核对旧字段／值。0024只新增份数、可靠包装与运动包含关系六列及CHECK；旧餐默认consumed_total，旧运动关系为空，保留原计算结果。迁移核对40表原字段和值保持，账本只增加对应一次。指定包装元数据通过私有维护预览／版本／事务审计更新，旧营养、食用量、快照和原始请求不改。0023日完整状态的历史初始化限定授权账号与固定截止日期，不在migration或未来默认中执行。0022及更早共享migration保持，构建不自动迁移。

```bash
node --network-family-autoselection-attempt-timeout=1000 --env-file=.env.local --import tsx scripts/backup-database.mts data/exports/私有备份.json
pnpm db:migrate
vercel deploy --prod
```

备份与迁移优先DATABASE_MIGRATION_URL；直连不可达而pooler可用时，在单次进程内使用DATABASE_URL，不改凭据文件。

Vercel的生产敏感变量不能下载，env pull的[SENSITIVE]占位符不能用于连接。发布维护使用已有本机生产数据库凭据，并通过既有迁移账本和备份核对目标；不覆盖.env.local或生产环境变量。

正式站验收结束再次备份与核对：全部结构及既有行值保持，只允许正常限流、令牌使用时间和会话续期元数据变化；会话身份与令牌字段仍须一致。虚构记录全部清理，既有健康记录、原始请求和审计保持。

0017仅为foods新增category（meal／ingredient，NOT NULL默认ingredient，CHECK），旧字段与记录保留，账本仅新增1次。已授权将Pasta Express和KL套餐两条当前记录标为meal，其他7条为ingredient；不修改营养、单位、说明或任何历史餐次。全库核对27张其他表以及全部既有操作／审计保持，仅新增1个维护操作和2条事件。

本批私有一致性备份为data/exports/database-before-stage3-2026-10-25.json、database-after-stage3-migration-2026-10-25.json、database-after-stage3-package-2026-10-25.json、database-after-stage3-production-2026-10-25.json；对应stage3-migration-verification.json、stage3-package-verification.json、stage3-production-verification.json全部通过。正式站虚构账号、OAuth客户端及数据已清理；15项公开／保护入口、MCP13工具和五种宽度操作验收通过，实际截图在.codex/stage3-release/。验收时段最近10分钟Runtime error／fatal为0，请求5xx与客户端异常为0。

以下为既有私有备份归档，均0600、Git与部署忽略，不输出健康值或凭据：

- `data/exports/database-before-record-review-2026-10-17.json`
- `data/exports/database-after-record-review-migration-2026-10-17.json`
- `data/exports/record-review-migration-verification-2026-10-17.json`
- `data/exports/database-after-record-review-production-2026-10-17.json`
- `data/exports/record-review-production-storage-verification-2026-10-17.json`
- `data/exports/database-before-unified-overview-2026-10-16.json`
- `data/exports/database-after-unified-migration-2026-10-16.json`
- `data/exports/database-after-unified-categories-2026-10-16.json`
- `data/exports/unified-migration-verification-2026-10-16.json`
- `data/exports/food-categories-2026-10-16*`、`food-categories-verification-2026-10-16.json`
- `data/exports/unified-categories-storage-verification-2026-10-16.json`

分类和说明维护通过scripts/maintain-foods.mts／food-maintenance.ts指定账号、ID／版本及摘要，updateMealDescriptions:false保持历史餐项。较早的food-editor-cleanup、food-analysis-correction、food-analysis-cut-specification私有请求／结果和database-before／after-food-analysis备份仍保留，历史营养、克数／勺数和原始请求／审计不改。ON当前每1勺约30.4g；Pasta保留原成分估计克数及汇总区间；牛排保留“可能保留中央筋膜”的原不确定措辞。

.vercelignore排除data、环境文件、凭据、Git、本机工具、依赖和构建缓存。

## 验收与维护

公网检查首页、OpenAPI、OAuth discovery／PKCE／CIMD／公钥、MCP 未授权 401 challenge、三个主页面登录保护及私有路径 404。OAuth、HTTP API 与网页登录分别认证；手动令牌及账号连接可撤销，AI 所有正式写入需网页登录确认。

真实连接排查已经复现旧版对 5,072,913 字节虚构 PNG 返回 image_size／4 MiB；68 字节同类文件可成功。原用户照片没有保留具体响应，不能倒推其实际大小、格式或失败阶段。新版日志记录上传阶段、字节数、错误码与 requestId，避免仅凭 GPT 的自然语言报错判断。

正式原图验收使用虚构文件与临时账号，测试结束删除仅属于这些测试的附件、Blob、账号与会话，不写真实餐次或修改既有健康记录。Runtime Logs 查错误与上传诊断，但不打印 URL、文件名、健康内容或凭据。既有账号的独立待确认预览不能因另一提交保存成功而自动取消。

部署成功后验证正式别名实际指向 READY 版本，再更新交接。失败时别名保留上一个成功部署；需要回滚时保留已发布的新列和约束，不删除数据或修改旧 migration。ChatGPT 已有连接需刷新工具列表，以获取分类、历史餐项引用、20 MiB、expectedImageCount 和详细依据协议；只在缺饮食权限时重新授权。真实手机／微信观感与用户原图最终复测由用户完成。

当前部署的Runtime与公开入口检查见handoff.md，不以本机资源hash推断线上版本。实际核对正式别名READY、协议字段和浏览器行为。保留版本绑定、私有备份、审计与回滚；真实原图及手机体验由用户最终核对。

食材客观分析规则、照片逐项失败和缺图审核要求见docs/meals.md，正式站使用独立虚构账号验收并清理。

统一审核专项报告保留在 `/tmp/formward-record-review-production.json`：混合审核与草稿并发、独立取消入库保留摄入、统一保存与自动返回、双PFC口径、旧链接和跨账号保护已验证，虚构账号清理完成。审核时间首屏统一UTC，再切设备时区，UTC服务端／东八区浏览器回归及正式站均无水合错误。当前总览、消耗及正式部署验收以下节为准。


## 既有0021消耗模式发布归档

以下描述0021发布时的验证；当前结果以上方0024与验收记录为准。该批已通过业务、安全、构建、目录README和文档链接检查。独立数据库的消耗、统一审核、饮食及身体／来源／AI／加载反馈浏览器回归通过；消耗覆盖两种录入模式、两种活动模式、未知与0、活动编辑、删除恢复、公式独立对照、正负盈余、严格相邻晨重、全部区间、键盘、触屏及减少动态效果。

正式站使用独立虚构账号，通过消耗模式及分项来源、运动累计、身体／饮食／消耗混合审核、双层独立整齐刻度、相邻晨重、跨账号保护、1440／1100／390／320px与减少动态效果验收，客户端异常0。最终部署另验证隐藏模式的无效数字草稿不阻断当前模式保存，也不写入未采用的值；1440／390／320px编辑器通过。全部虚构账号及其健康事实、操作、审计、令牌和会话已清理。

0021在版本控制中提交后执行；迁移核对36张应用表原字段和值保持，账本只增1条。正式交互验收后全库核对既有健康事实、原始请求、来源和审计保持，仅正常认证元数据变化。以下私有文件均0600，受Git及部署忽略：

- `data/exports/database-before-energy-modes-2026-10-22.json`
- `data/exports/database-after-energy-modes-migration-2026-10-22.json`
- `data/exports/energy-modes-migration-verification-2026-10-22.json`
- `data/exports/database-after-energy-modes-production-2026-10-22.json`
- `data/exports/energy-modes-production-verification-final-2026-10-22.json`
- `data/exports/database-after-energy-modes-history-preview-2026-10-22.json`
- `data/exports/energy-modes-history-preview-verification-2026-10-22.json`

正式交互报告`/tmp/formward-energy-modes-production.json`及`/tmp/formward-energy-modes-editor-production.json`；READY别名核对`/tmp/formward-energy-modes-inspect-final.log`。13项公开入口及认证保护通过，见`/tmp/formward-energy-modes-http.json`；MCP未授权challenge使用POST测试，GET的405不代表认证故障。最终部署Runtime error／fatal与请求5xx均0，见`/tmp/formward-energy-modes-runtime-errors.jsonl`和`/tmp/formward-energy-modes-server-errors.jsonl`。

既有一次性历史补齐批次已核对为confirmed，由用户完成网页登录确认；不能重新初始化或代确认其他预览。预览后另做全库核对，只新增统一审核及消耗子审核各1条，原健康事实保持；固定清理日没有正式静息记录，其错误默认派生已消失，无须删除健康事实。具体范围、私有请求和后续核对见[交接](../handoff.md)。

双层关联图已通过最终正式站1440／1100／390／320px截图复核、全部范围、键盘、减少动态效果与缺记录切换位置稳定检查。虚构账号及所属数据已清理；13项公开入口／认证保护通过，客户端异常、Runtime error／fatal和请求5xx均0。截图与报告位于被忽略的`.codex/overview-verification/final/`。本轮无数据库迁移、权限或健康计算变化。

本次发布前后私有备份为`data/exports/database-before-overview-release-2026-10-22.json`及`database-after-overview-release-2026-10-22.json`；`overview-release-storage-verification-2026-10-22.json`核对37张表结构和既有数据保持，仅排除正常限流及指定认证使用／续期元数据。全部文件0600，不提交或公开。

## 手机布局验收

手机四栏导航与48px页头、最近10日直接补录、单份有效消耗读数、单餐服务端合计及局部线图刻度使用现有数据库和协议，无迁移。隔离浏览器验证320／390／430px及矮视口、触屏横屏、1100／1440px，图片只含虚构数据；软键盘以缩小视口模拟，真实手机浏览器仍需用户复核。最终版本、305项测试、正式站虚构验收、备份与清理证据见[交接](../handoff.md)。

手机最终版本的正式域名验收通过，Runtime error／fatal及请求5xx均0，13项公开入口通过。虚构账号及其数据已清理，`.codex/mobile-verification/`归档实际截图与报告。发布前后备份`data/exports/database-before-mobile-2026-10-23.json`、`database-after-mobile-2026-10-23.json`及`mobile-release-storage-verification-2026-10-23.json`核对37张表结构与既有数据保持，只排除指定认证使用／续期和正常限流元数据；全部0600、Git与部署忽略。无migration。


总览首屏维护不涉及migration。正式站双浏览器、四个手机竖屏、桌面、触屏横屏、150% CSS放大和减少动态效果均复验；14项公共／保护入口通过。发布前后overview-compact私有备份与40表核对保持原数据，虚构账号清理完成。当前设计与视觉验收统一依据为[既有设计文档](design-reference.md)，截图和条目结果见[验收记录](maintenance-verification.md)。

## 运动分项版本的回退

0026为加列迁移，旧行保持NULL，不回算历史。若上线后已有分项运动写入，需要保留本轮分项计算与字段支持，采用修正版本回退界面；不能直接切回不认识运动分项的旧部署，以免旧代码把期间静息再次计入。不得删新列或改旧migration。

## 身体与运动分项发布核对

正式域名 https://formward-ten.vercel.app 已核对 READY 部署 dpl_HeNMUADh26b3D68zZPgx2kdgeNfm，运行代码 b654847，数据库0026；功能分支codex/latest-records-energy-sources已推送，尚未合入main。已合并32be0cd，保留此前餐次字号、列宽、单位及详情定位修正。OpenAPI1.13.0、MCP1.11.0，13个工具与既有权限种类保持。

379项单元／集成、lint、typecheck、production build、312项本地链接和15项章节锚点、60个团队目录README及diff检查通过。隔离Chromium／WebKit验证运动分项、AI修改不正式保存、单项删除、跨窗口保留输入与明确覆盖、自定义取消、慢图登录；四页矮屏、横屏、键盘、减少动态效果及历史回归通过。正式站两浏览器各五种宽度重走实际保存和更新提醒，Chromium发出真实浏览器触屏事件验证横拖选日及纵向滚动。16项入口保护通过；最终验收客户端异常与请求5xx为0，部署最近10分钟Runtime error／fatal和请求5xx均0。WebKit首轮捕获一次跨页请求错误，诊断保留；补充跳转前后等待请求完成后，无过滤重跑通过，不将首轮记为通过。真实iOS及系统软键盘未作实机测试。

正式报告与虚构截图在私有.codex/body-energy-release/，Chromium／WebKit分别为production-chromium.json与production-webkit.json；READY见.codex/body-energy-inspect-final.log。测试账号及所属记录、待确认操作、令牌与会话已全部清理。发布前、迁移后和发布后三份私有备份为data/exports/database-before-body-energy-2026-10-28.json、database-after-body-energy-migration-2026-10-28.json和database-after-body-energy-production-2026-10-28.json，均0600、Git与部署忽略。

body-energy-migration-verification.json与body-energy-production-verification.json核对40表原有列、健康事实、请求和审计保持，0026只加三列及一条账本，旧运动新列保持NULL。期间已有账号正常新增的图片、待确认提交及授权轮换均保留，未代确认、删除或回滚；body-energy-concurrent-verification.json单独核对新增归属与测试数据清理。回退必须保留运动分项计算及新列，不切回无法理解components的旧后端。
