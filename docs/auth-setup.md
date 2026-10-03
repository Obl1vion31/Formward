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

## 建表与创建账号

在仓库根目录执行：

```bash
pnpm db:migrate
pnpm account:create
```

第一条命令只执行 `drizzle/` 中已纳入版本控制的 migration；重复执行不会重复建表。第二条命令依次询问邮箱和密码，终端密码输入不显示，数据库只保存 Better Auth 的 scrypt 哈希。内部账号支持 6–128 字符密码。重复创建同一个邮箱会返回已有账号，不重置密码。网站不提供公开注册。

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

没有 Neon 时可在一个终端运行 `pnpm db:local`，保持服务运行，并使用 `postgresql://postgres:postgres@127.0.0.1:5432/postgres` 作为本机 DATABASE_URL，再执行 migration 和账号创建命令。这个 PGlite 开发数据库持久化在被 Git 忽略的 `data/postgres/storage/`，只监听本机。

本机数据库和 Neon 互相独立。切换连接串不会自动迁移账号；需要在目标数据库执行 migration 并创建内部账号。不要把开发数据库服务暴露为正式网络数据库。

## 验证

运行 lint、typecheck、`pnpm test` 和 production build。认证集成测试使用独立内存 PostgreSQL 和虚构账号；`pnpm test:browser` 也自行启动隔离的数据库和 production 测试服务，覆盖登录、动画顺序、跨账号访问、退出和手机模式。浏览器环境准备见 [tests/README.md](../tests/README.md)。测试不连接 `.env.local` 指向的数据库。
