# 公网 HTTPS 部署

正式域名为 [Formward](https://formward-ten.vercel.app)，Next.js 由 Vercel Hobby 托管，数据库沿用 Neon PostgreSQL。AI 使用正式 [OpenAPI](https://formward-ten.vercel.app/api/v1/openapi.json) 或 `https://formward-ten.vercel.app/api/mcp`，不能使用受 Deployment Protection 保护的单次部署／预览地址。

当前正式部署为 `dpl_AVq1tUVotcUNUkmSYK5yxNvr9gX4`，READY 并绑定正式域名。当前协议为 OpenAPI 1.6.0／MCP 1.3.0，共 9 个工具；数据库已执行 0015，29 张业务／认证表及迁移账本。正式版本包含 20 MiB 私有原图、浏览器直传、缺图审核、营养明细／可展开依据、每日三色堆叠图、食材简表和滚动条稳定处理。今日概况保持原样。

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

新增 migration 先提交版本控制，再保存私有一致性备份、执行和核对旧字段／值。构建不自动迁移，旧共享 migration 不修改。0015 只增加 nullable meal_items.review_explanation，并将 meal_images_size_valid 提高至 20 MiB；旧记录不补造依据。

```bash
node --network-family-autoselection-attempt-timeout=1000 --env-file=.env.local --import tsx scripts/backup-database.mts data/exports/私有备份.json
pnpm db:migrate
vercel deploy --prod
```

备份与迁移优先 DATABASE_MIGRATION_URL；直连不可达而 pooler 可用时，可在该进程将 DATABASE_MIGRATION_URL 设为既有 DATABASE_URL，保留 prepare:false，不改本机凭据文件。0015 前后已核对原 29 张表全部旧字段和值一致，旧 review_explanation 全为 null，账本只新增一次。备份及报告：

- `data/exports/database-before-meal-review-2026-10-15.json`
- `data/exports/database-after-meal-review-2026-10-15.json`
- `data/exports/meal-review-migration-verification-2026-10-15.json`

以上文件权限 0600，Git 与部署忽略。0013／0014 等较早迁移的私有备份与报告保留，不改共享迁移。`.vercelignore` 排除 data、环境文件、凭据、Git、本机工具、依赖和构建缓存。

## 验收与维护

公网检查首页、OpenAPI、OAuth discovery／PKCE／CIMD／公钥、MCP 未授权 401 challenge、三个主页面登录保护及私有路径 404。OAuth、HTTP API 与网页登录分别认证；手动令牌及账号连接可撤销，AI 所有正式写入需网页登录确认。

真实连接排查已经复现旧版对 5,072,913 字节虚构 PNG 返回 image_size／4 MiB；68 字节同类文件可成功。原用户照片没有保留具体响应，不能倒推其实际大小、格式或失败阶段。新版日志记录上传阶段、字节数、错误码与 requestId，避免仅凭 GPT 的自然语言报错判断。

正式原图验收使用虚构文件与临时账号，测试结束删除仅属于这些测试的附件、Blob、账号与会话，不写真实餐次或修改既有健康记录。Runtime Logs 查错误与上传诊断，但不打印 URL、文件名、健康内容或凭据。既有账号的独立待确认预览不能因另一提交保存成功而自动取消。

部署成功后验证正式别名实际指向 READY 版本，再更新交接。失败时别名保留上一个成功部署；需要回滚时保留新增 nullable 列和约束，不删除数据或修改旧 migration。ChatGPT 已有连接需刷新工具列表，以获取 20 MiB、expectedImageCount 和详细依据协议；只在缺饮食权限时重新授权。真实手机／微信观感与用户原图最终复测由用户完成。

最终正式部署的 Runtime error 查询返回 0 条，查询区间无排除片段，报告在 `/tmp/formward-azure-url-errors.jsonl`。正式别名的 OpenAPI 1.6.0、OAuth metadata、登录保护和私有备份 404 均已复核。

当前部署标识及上线验收记录见 [项目交接](../handoff.md)，产品与测试范围见 [当前状态](status.md)。

正式原图验收已通过：真实 GPT 上传 5,072,913 字节有效 PNG、重复复用相同附件、原始字节一致；临时虚构账号的浏览器直传同一大图、完整 20 MiB 有效 PNG、重复、超过上限拒绝、来源校验、匿名读取拒绝、private/no-store 和 320px 切换稳定均通过。测试未保存餐次，虚构附件、Blob、账号与会话已清理；最终存储为 Private、仅 Production、敏感标记保持。验收报告在 `/tmp/formward-production-image-review-check.json`，虚构截图在 `/tmp/formward-production-images-visual`，公开 HTTP 报告在 `/tmp/formward-public-meal-review-http.json`；均不提交 Git。真实 GPT 验证用过的虚构附件也已核对原图后单独清理。

原图下载兼容实际ChatGPT使用的oaisdmntprnznorth.blob.core.windows.net，按完整主机名精确匹配且重定向逐跳验证。生产虚构地址检查确认该账号已进入下载阶段（不存在的样本返回image_url_expired），其他Azure账号仍返回image_url；没有上传或关联用户照片。临时测试账号／令牌已清理，报告在/tmp/formward-azure-url-check.json。原用户临时文件地址未保留，午餐原图需由GPT重新传入并按已有餐次审核关联；晚餐按用户要求保持无图。
