# 公网 HTTPS 部署

Formward 使用 Vercel 托管 Next.js，继续连接现有 Neon PostgreSQL。正式域名为 [https://formward-ten.vercel.app](https://formward-ten.vercel.app)，公开协议位于 [OpenAPI](https://formward-ten.vercel.app/api/v1/openapi.json)，AI API 基础地址为 `https://formward-ten.vercel.app/api/v1`，MCP 为 `https://formward-ten.vercel.app/api/mcp`。来源确认／建议管理、MCP／OAuth 与手机调整已发布；当前部署为 `dpl_4NK3G9GXn4kfcPWNKjC8saaZ6Msa`，0012 migration 已执行。

网页通过内部账号登录，MCP 通过 OAuth Bearer，HTTP API 通过独立手动令牌鉴权。公开协议不含健康数据或令牌。AI 提交只生成预览，保存仍由用户在网页登录确认；完整格式见 [AI 接入](ai-api.md)。

## 平台配置

- Vercel 项目名称 `formward`，Framework Preset 为 Next.js，Root Directory 为仓库根目录。
- Node.js 使用 24.x；`ENABLE_EXPERIMENTAL_COREPACK=1` 让平台使用 package.json 指定的 pnpm 9.15.9。
- `vercel.json` 固定安装命令 `pnpm install --frozen-lockfile`、构建命令 `pnpm build`、函数区域 `cle1`。现有 Neon 位于 us-east-2，与此区域一致。
- 使用 Vercel Hobby 个人计划和平台域名，HTTPS 证书由平台管理。当前通过 CLI 手动发布，没有关联 Git 自动部署。
- Deployment Protection 使用 Standard Protection：保护预览和单次部署地址，正式域名保持可访问。外部 AI 使用上述正式域名，不能使用受平台登录保护的预览链接。

## 生产环境变量

在 Vercel 项目的 Environment Variables 中仅为 Production 配置：

| 变量 | 内容 |
| --- | --- |
| `DATABASE_URL` | 现有 Neon pooler 连接串，保留 TLS 参数，保存为 Secret |
| `BETTER_AUTH_SECRET` | 现有随机认证 secret，保存为 Secret |
| `BETTER_AUTH_URL` | `https://formward-ten.vercel.app` |
| `FORMWARD_TIMEZONE` | `Asia/Shanghai` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` |

不把真实数据库配置复制到 Preview。生产变量不使用 NEXT_PUBLIC_ 前缀；不上传环境文件，也不运行会覆盖本机 `.env.local` 的 env pull。新增或修改平台变量后需要重新部署。

Vercel 保留 TZ 变量，因此使用应用级 FORMWARD_TIMEZONE 定义 HTTP API 的服务默认时区。请求头 X-Formward-Timezone 优先，未提供时读取配置地区在请求发生时的准确偏移，未配置才读取系统偏移；地区时区仍按当次夏令时换算。网页新记录和 HTTP 助手继续采用设备当次时区，其他 AI 也可在候选中显式提供 timezone。

公网审核链接和 OpenAPI 的 servers.url 使用 BETTER_AUTH_URL 中配置的 HTTPS 根地址，忽略代理内部 HTTP 地址和请求 Host。本机仍兼容 localhost、127.0.0.1 和 IPv6 回环地址。

登录限流通过 Better Auth 的数据库存储维护，`rate_limits` 保存来源／入口的唯一键、计数和最后请求毫秒时间。多个实例共享计数，登录仍限制为每分钟五次；过期计数由认证存储清理。此表是登录前的服务运行状态，不保存健康记录。

## 发布与更新

首次在交互终端运行 `vercel login`，在浏览器完成设备授权，然后运行 `vercel link --yes --project formward`。本机 `.vercel/` 是工具生成的项目关联信息，被 Git 忽略。CLI 安装在本机工具目录或 `/tmp`，不加入应用依赖。

发布前运行 lint、typecheck、unit/integration test 和 production build，以及受影响的认证／AI 浏览器检查。已有 3000 开发服务时，在私有临时源码副本中构建和运行浏览器检查，使用独立端口和虚构数据库，不覆盖正在运行的 `.next`。

有新增 migration 时，先保存私有数据库备份，再执行已纳入版本控制的 migration，随后核对既有表和字段。构建命令不执行 migration；数据库演进见 [数据库字典](database.md)。限流表由 `0010_shared_auth_rate_limits.sql` 创建。MCP／OAuth 需要先执行 `0011_mcp_oauth.sql`，创建 9 张 OAuth／JWKS 表及稳定审核凭据归属；migration 前后核对全部旧字段和值，允许新增 nullable oauth_connection_id，既有操作仍绑定原令牌。跨区域备份连接较慢时可为 Node 加 `--network-family-autoselection-attempt-timeout=1000`，与应用连接入口的单地址尝试时限一致。

在关联项目的仓库根目录运行：

```bash
vercel deploy --prod
```

`.vercelignore` 排除整个 data、环境文件、密钥文件、Git 元数据、本机工具和构建缓存，私有导入文件与数据库备份不会进入远程构建。正式地址只由 public 静态资源和 Next.js 页面／API 提供。

## 上线验收与故障处理

正式域名已通过 HTTP 转 HTTPS、首页、OAuth discovery／PKCE／CIMD、公钥无私钥、MCP 缺失／无效令牌 401 + challenge、OpenAPI、未登录重定向、无会话响应、关闭公开 JWT 签发入口与私有路径 404。1440×900、390×844、320×740、844×390 与减少动态效果的公网浏览器确认桌面视频、手机无视频、纯石墨／normal、点击／顶部返回、输入保持、无横向溢出和无客户端异常；测试登录请求在浏览器中拦截。上线检查期间 Runtime Logs 没有 error 记录。完整认证、录入、AI 与加载回归在隔离虚构数据库执行；真实账号登录与 ChatGPT／其他 MCP 客户端连接由用户完成。

手机新实现只加载原始透明 PNG，不创建转身视频。验收首屏提示、点击立即进入、登录背景不返回、顶部返回保留输入、认证中禁用返回，以及纯石墨背景／normal 合成。横屏触屏仍使用手机模式，曲线默认 7D；桌面仍默认 30D，保留视频与滚轮。iPhone／微信实际观感由用户检查。

OAuth discovery 与 JWKS 200、resource／issuer／端点使用正式 HTTPS、未授权 MCP POST 返回 401 + WWW-Authenticate、不缓存响应均已验证。完整真实登录、同意、SDK 工具调用、预览确认、刷新及撤销已在虚构数据库测试；用户在自己的 ChatGPT 入口最终连接，不向真实账号提交测试健康记录。

- 正式域名的首页和图片／字体／视频正常加载，证书有效；OpenAPI 返回完整正式 API 地址。
- 未登录访问 dashboard 重定向到首页；没有令牌、无效或撤销令牌访问数据 API 返回 401，不接受网页登录 cookie 替代。
- 真实账号登录由用户核对；录入、审核、重复请求和跨账号测试在隔离虚构数据库执行，不向真实账号写测试健康数据。
- 在 Vercel Runtime Logs 中检查连接失败和服务错误，不打印连接串、令牌、密码或健康记录。通过平台 Usage 查看资源使用量。

更新失败时正式域名继续指向上一成功版本；已发布版本出现问题时在平台回滚到先前验证过的部署。新增限流表可以保留，不通过回滚业务代码删除已有数据或修改历史 migration。首次发布没有旧版本可回滚时，修复配置或构建后重新发布。

部署完成后，用户在 ChatGPT「插件 → 添加自定义 MCP」填写 `/api/mcp` 正式完整 URL 和 OAuth，登录 Formward 并明确授权；其他兼容客户端使用同一入口。连接可在“AI 接入”撤销。HTTP API、OpenAPI 和手动令牌继续使用。具体步骤见 [AI 接入](ai-api.md)。普通聊天仅获得网站链接不会建立账号连接。

0011 已共享，不再修改。迁移前后私有备份为 data/exports/database-before-mcp-oauth-2026-10-12.json 与 database-after-mcp-oauth-2026-10-12.json，核对报告为 mcp-oauth-migration-verification-2026-10-12.json；旧 12 张表的全部旧字段和值保持，measurement_operations 仅增加 nullable 连接字段并放宽 token_id，账本新增一次。公网上线报告在 /tmp/formward-public-mcp-http.json、/tmp/formward-public-mcp-browser.json，不包含真实健康记录或凭据。

来源建议管理使用 0012 migration 新增删除时间与操作者，执行前后私有一致性备份和核对确认 21 张既有业务表旧字段和值保持。当前 OpenAPI 1.3.0 提供 sourceUnspecifiedConfirmed 与 needsUserInput，来源补填／直接留空保存、点击来源输入框展开全部建议、桌面／320px 手机的“×”移除与草稿保留已在隔离 production 浏览器通过。正式网站需要用户刷新后核对真实 ChatGPT 的来源询问；现有来源由用户选择移除建议或编辑记录。

当前发布 dpl_4NK3G9GXn4kfcPWNKjC8saaZ6Msa 已 Ready 并绑定正式域名；公网协议、来源字段、OAuth resource discovery、MCP 未授权 challenge、登录保护与私有备份路径 404 通过，当前部署 Runtime Logs error 查询为 0 条。核对报告仅保存在 /tmp，不公开健康数据或凭据。

饮食页面与MCP／HTTP的当前发布为dpl_4NK3G9GXn4kfcPWNKjC8saaZ6Msa，正式入口[饮食记录](https://formward-ten.vercel.app/dashboard/meals)。0013已迁移，原21表字段和值核对一致；初始化预览及备份保持私有。已有MCP连接需刷新工具并重新授权饮食权限。
