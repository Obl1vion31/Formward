# 数据库与账号接入

Formward 使用 Neon 托管 PostgreSQL，以 Drizzle 定义表和执行 migration，以 Better Auth 验证邮箱密码与管理网页登录会话。配置保存在根目录 `.env.local`，这个文件被 Git 忽略；`.env.example` 只保存空占位与填写说明。

## 创建 Neon 数据库

1. 打开 [Neon 控制台](https://console.neon.tech)，登录后创建名为 Formward 的项目。
2. 选择服务部署位置附近的区域。创建完成后点击 **Connect**，选择 branch、database 和 role。
3. 复制以 `postgresql://` 开头的完整连接串，保留 `sslmode` 等参数，填入 `.env.local` 的 `DATABASE_URL`。如果复制了命令形式的内容，只取引号内的连接串，不包含 `psql`。
4. 网站可以使用带 `-pooler` 主机名的连接串。需要单独的 migration 连接时，将 Neon 的直接连接串填入 `DATABASE_MIGRATION_URL`；留空时脚本使用 `DATABASE_URL`。[Neon 官方连接说明](https://neon.com/docs/get-started/connect-neon)

首次配置可复制 `.env.example` 到 `.env.local`；已有 `.env.local` 时只编辑对应变量，保留已有 secret 和其他配置。

```env
DATABASE_URL="这里填完整的 Neon PostgreSQL 连接串"
DATABASE_MIGRATION_URL=""
BETTER_AUTH_SECRET="这里填随机生成的 secret"
BETTER_AUTH_URL="http://localhost:3000"
```

`BETTER_AUTH_SECRET` 至少 32 个随机字符，不能使用账号密码。可在自己的终端运行下面命令，将输出填入此变量。保留已有随机 secret，可以避免无意使现有会话失效。

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`BETTER_AUTH_URL` 是用户实际访问网站的地址。本机开发允许同端口的 localhost 和 127.0.0.1；其他端口、转发域名或正式域名要更新此变量并重启服务。HTTPS 地址会启用 Secure cookie。

正式网站为 [https://formward-ten.vercel.app](https://formward-ten.vercel.app)，通过 Vercel 托管并使用现有 Neon。生产变量与本机配置独立；完整步骤见 [公网 HTTPS 部署](deployment.md)。登录限流使用数据库 rate_limits，多实例共享每分钟五次登录计数；此表由 0010 migration 创建，不修改账号或健康记录。

## 建表与账号管理

在仓库根目录执行：

```bash
pnpm db:migrate
pnpm account:create
```

第一条命令只执行 `drizzle/` 中已纳入版本控制的 migration；重复执行不会重复建表。第二条命令依次询问邮箱和密码，终端密码输入不显示，数据库只保存 Better Auth 的 scrypt 哈希。内部账号支持 6–128 字符密码。重复创建同一个邮箱会返回已有账号，不重置密码。网站不提供公开注册。

日常新增账号使用 `/admin` 的邀请页，`account:create` 只保留首次引导和维护兼容。0027 migration 新增账号管理字段、链接与审计表，不改既有密码、邮箱验证或健康事实。已有账号默认为普通用户、正常状态，未知的最近登录时间保持空值。

### 首个 owner

使用你已指定的现有账号邮箱预览；核对用户 ID 后执行，不自动把第一个登录／注册者设为 owner：

```bash
pnpm account:owner --preview owner@example.test
pnpm account:owner --write owner@example.test 预览中的用户ID
```

工具只允许首个 owner 和对同一账号重复初始化；不开放新增管理员的网页入口。生产执行须先完成备份、实际页面验收和本轮发布授权。owner 仍用原密码登录，从账号菜单进入管理，再次输入当前密码；确认绑定当前会话，10 分钟后过期，不因操作续期。

### 邀请与找回密码

后台有账号、邀请、操作记录三个页签。邀请有效 72 小时，普通账号密码重设链接有效 15 分钟；owner 复制链接后通过原联系渠道交给本人。重新生成使旧链接失效，关闭弹窗后不能找回原文。新账号在激活成功时才创建；已有邮箱不能用邀请覆盖密码。浏览器已有登录时须显式退出，激活或重设后不自动登录。

链接令牌使用 32 字节安全随机数和 SHA-256 摘要，原文位于 URL fragment，不进入普通 URL 查询与日志。预览不消费，保存以事务完成密码、消费和审计；重设另撤销全部旧访问。手动交付不证明邮箱所有权，新账号 `email_verified=false`，旧值不改。第一版不接邮件、不开放注册，登录页“忘记密码”提示联系邀请人。

账号设置位于 `/dashboard/account`，邮箱只读，提供修改密码、本人登录设备退出和 AI 接入入口。新设置／重设密码为 12–128 字符；已有短密码可继续登录。改密和全部撤销会退出所有网页设备、撤销手动 AI Token、OAuth 连接／刷新授权及未使用的恢复链接；恢复停用账号不恢复旧凭据或旧审核。

### owner 密码恢复

唯一 owner 忘记密码时，在受控交互终端运行；密码不得放入命令参数。先备份并预览目标，再执行：

```bash
pnpm account:owner --preview owner@example.test
pnpm account:owner --recover owner@example.test 预览中的用户ID
```

恢复工具核对目标邮箱，隐藏输入并确认新密码，事务撤销旧访问、记录维护审计。不能用于普通账号，也不删除任何健康记录。

### 权限与并发

Admin 插件使用受限 `owner`／`user` 角色，不使用 `adminUserIds`；直接管理、修改身份／密码与原生会话撤销入口对 HTTP 和内部 `auth.api` 同时关闭。所有管理读写另校验有效会话、角色和近期验密。管理列表不返回健康数据、令牌摘要或密码。

`access_version` 绑定账号与会话，撤销、停用和改密递增。登录保存密码验证前捕获的版本，网页写入在既有账号行锁中复核当前请求会话；OAuth 与 AI 在请求和确认时复核活动状态与原授权。后台不能停用、降权、删除或生成 owner 的重设链接。

新增或修改表结构时运行 `pnpm db:generate`，检查生成 SQL 后执行 `pnpm db:migrate`。已经进入共享数据库的 migration 不再修改；后续变化生成新 migration。

## 启动与登录

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)，向下滚动或使用键盘入口显示表单。填写邮箱和密码后点击 ENTER：

1. AUTHENTICATING 验证凭据，停留在第 12 帧，禁止重复提交与方向变化。
2. 验证成功后播放约 700ms 的 12 → 13 动画；reduced motion 为 240ms。
3. 收到实际 CSS 动画结束事件后导航到 `/dashboard`。

错误密码、连接失败或限流会显示中文提示并回到可重试的表单，不播放最终动画。主页每个请求都验证会话，未登录、过期或已撤销的会话返回登录入口。退出登录会撤销自己的会话并清空当前浏览器页面缓存。[Better Auth 的 Next.js 集成说明](https://better-auth.com/docs/integrations/next)

## 本机离线开发

没有 Neon 时可在一个终端运行 `pnpm db:local`，保持服务运行，并使用 `postgresql://postgres:postgres@127.0.0.1:5432/postgres?max=1` 作为本机 DATABASE_URL，再执行 migration 和账号创建命令。max=1 限制其单会话协议并发，Neon 默认连接池仍为 3。这个 PGlite 开发数据库持久化在被 Git 忽略的 `data/postgres/storage/`，只监听本机。

本机数据库和 Neon 互相独立。切换连接串不会自动迁移账号；需要在目标数据库执行 migration 并创建内部账号。不要把开发数据库服务暴露为正式网络数据库。

## 数据库连接超时

登录日志中若出现 `AggregateError`、`ETIMEDOUT` 和 `syscall: connect`，说明 TCP 连接尚未建立。这个阶段尚未执行账号查询或密码验证。Node 自动尝试域名的 IPv4 / IPv6 地址时，默认每个地址只等待 250ms；跨区域网络延迟接近这个值、IPv6 不可用时，可能提前放弃仍可连通的 IPv4 地址。[Node.js 网络连接说明](https://nodejs.org/download/release/v24.20.0/docs/api/net.html#netsetdefaultautoselectfamilyattempttimeoutvalue)

`src/db/client.ts` 在创建连接池时，将服务进程的默认单地址尝试时限设为至少 1000ms。网站、migration 和账号脚本使用同一入口，进程已有的更长设置会保留；数据库连接时限仍为 15 秒。这是 Node 的进程级设置，也适用于该进程内其他使用默认自动地址选择的 TCP 连接。

修改连接代码或 `.env.local` 后重启 `pnpm dev`，让进程缓存的认证实例和连接池重新建立。若仍超时，检查 Neon 域名解析和到 5432 端口的网络访问；仅增加数据库的 `connect_timeout` 不会改变 Node 的单地址尝试时限。

## 验证

运行 lint、typecheck、`pnpm test` 和 production build。认证集成测试使用独立内存 PostgreSQL 和虚构账号；`pnpm test:browser` 也自行启动隔离的数据库和 production 测试服务，覆盖登录、动画顺序、跨账号访问、退出和手机模式。浏览器环境准备见 [tests/README.md](../tests/README.md)。测试不连接 `.env.local` 指向的数据库。

## MCP OAuth 配置

完成 0011_mcp_oauth.sql migration 后，现有 BETTER_AUTH_SECRET、BETTER_AUTH_URL 与数据库配置即可启用 OAuth Provider，无须给每个客户端手动设置共享 secret。正式 URL 必须是外部可访问的 HTTPS 根地址；MCP resource／JWT audience 固定为该根地址的 `/api/mcp`。网页仍用已有内部邮箱密码，授权页仅在官方签名请求下显示。

客户端通过 CIMD 或 DCR 注册、授权码 + S256 PKCE 获取账号授权，1 小时访问令牌与最多 30 天连接、轮换刷新。用户在“AI 接入”撤销连接。OAuth 数据表属于私有认证数据，数据库备份包含这些内容；不要把 JWKS 私钥、令牌摘要或客户端密钥截图公开。完整客户端接入见 [AI 接入](ai-api.md)。
