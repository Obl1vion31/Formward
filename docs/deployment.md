# 公网 HTTPS 部署

正式域名为 [Formward](https://formward-ten.vercel.app)，Next.js 由 Vercel Hobby 托管，数据库沿用 Neon PostgreSQL。AI 使用正式 [OpenAPI](https://formward-ten.vercel.app/api/v1/openapi.json) 或 `https://formward-ten.vercel.app/api/mcp`，不能使用受 Deployment Protection 保护的单次部署／预览地址。

正式地址[Formward](https://formward-ten.vercel.app)，当前READY部署`dpl_9EzsQGNQB5resJpqztfmviHWUWvH`，功能提交`68b9a29`。OpenAPI1.10.0／MCP1.7.0，共12工具；数据库0020，36张应用表加Drizzle账本。Node.js24.21.0、pnpm9.15.9、Next.js16.3.7。静息＋活动按原值使用，全天总量可覆盖；综合图采用摄入／消耗／盈余三柱与相邻次晨差，四类图共用原生动效。

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

新增 migration 先提交版本控制，再保存私有一致性备份、执行和核对旧字段／值。构建不自动迁移，共享 migration 不修改。0019新增5张消耗相关表和统一审核2个可空关联字段；迁移前后核对30张旧表全部原字段和值保持，账本仅新增对应1次，新表初始为空。0017食材分类、0016 reference来源、0015可展开依据和20MiB约束保持。

```bash
node --network-family-autoselection-attempt-timeout=1000 --env-file=.env.local --import tsx scripts/backup-database.mts data/exports/私有备份.json
pnpm db:migrate
vercel deploy --prod
```

备份与迁移优先DATABASE_MIGRATION_URL；直连不可达而pooler可用时，在单次进程内使用DATABASE_URL，不改凭据文件。

Vercel的生产敏感变量不能下载，env pull的[SENSITIVE]占位符不能用于连接。发布维护使用已有本机生产数据库凭据，并通过既有迁移账本和备份核对目标；不覆盖.env.local或生产环境变量。

正式站验收结束再次备份与核对：全部结构及35张表的行值保持，仅正常认证限流数据变化；虚构记录全部清理，既有健康记录、原始请求和审计保持。

0017仅为foods新增category（meal／ingredient，NOT NULL默认ingredient，CHECK），旧字段与记录保留，账本仅新增1次。已授权将Pasta Express和KL套餐两条当前记录标为meal，其他7条为ingredient；不修改营养、单位、说明或任何历史餐次。全库核对27张其他表以及全部既有操作／审计保持，仅新增1个维护操作和2条事件。

私有备份／报告均0600，Git与部署忽略，不输出健康值或凭据：

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

当前正式验收报告为 `/tmp/formward-record-review-production.json` 和 `/tmp/formward-record-review-final-http.json`：四种宽度／三个区间、混合审核与草稿并发、独立取消入库保留摄入、统一保存与自动返回、双PFC口径、共同零点、旧链接重复操作和跨账号保护均通过，客户端异常0，两组虚构账号及记录清理完成。正式别名READY见 `/tmp/formward-record-review-final-inspect.log`，运行时error／fatal与请求5xx均0，分别见 `/tmp/formward-record-review-runtime-errors.jsonl`、`/tmp/formward-record-review-server-errors.jsonl`。审核时间首屏统一UTC，再切设备时区，UTC服务端／东八区浏览器回归及正式站均无水合错误。


## 当前消耗版本验收

本次已完成lint、typecheck、288项单元／集成、production build、目录README和文档链接检查。独立数据库的消耗、统一审核、饮食、身体及认证／OAuth浏览器回归通过；消耗覆盖1440／1100／390／320px、总量覆盖、未知与零、活动编辑、删除恢复、资料回溯确认、正负柱、相邻次晨、键盘及减少动态效果。

0019迁移前后备份为`data/exports/database-before-energy-2026-10-22.json`、`data/exports/database-after-energy-migration-2026-10-22.json`，核对报告`data/exports/energy-migration-verification-2026-10-22.json`；均0600。30张旧表原字段及值保持，5张新表初始为空，账本仅增1条。正式别名READY见`/tmp/formward-energy-inspect.log`，13项公开入口和保护检查见`/tmp/formward-energy-final-http.json`；正式站虚构账号交互验收、清理和最终数据核对均完成，见[交接](../handoff.md)。

正式站使用两组虚构账号通过消耗录入、覆盖清空、活动编辑、删除恢复、公式资料回溯、身体／饮食／消耗混合确认、正负柱、相邻晨重、键盘、减少动态效果及1440／1100／390／320px验收，客户端异常0。所有虚构账号及所属事实、操作、审计、令牌和会话已清理。再次备份核对29张既有非限流表的原值保持、5新表为空，只有正常认证限流状态变化；全部字段结构和迁移账本与迁移后备份一致。

正式交互报告`/tmp/formward-energy-production.json`；终验备份`data/exports/database-after-energy-production-2026-10-22.json`及`data/exports/energy-production-verification-2026-10-22.json`均0600。Runtime error／fatal及请求5xx为0，日志在`/tmp/formward-energy-runtime-errors.jsonl`和`/tmp/formward-energy-server-errors.jsonl`。


日常默认值版本0020在已提交后执行，新增energy_defaults和日记录active_estimated／notes，35旧表原字段和值保持。290项自动测试、lint、typecheck、build和四种宽度消耗浏览器验收通过。正式站虚构账号验证默认值、公式对照、估算标记及API，异常0，虚构数据清理完成。终验核对既有健康数据和全库字段保持，仅保留用户请求的统一／消耗待审核批次，以及正常限流／请求令牌使用时间。私有备份与核对定位见交接。
