# Database

## 目的

本目录集中管理 Drizzle 数据库连接和 PostgreSQL schema。

## 当前内容

- `client.ts`：通过 postgres.js 连接 Neon 或本机 PostgreSQL，按服务端进程复用连接池。创建连接池时将 Node 的单地址自动选择尝试时限设为至少 1000ms，保留进程已有的更长设置；数据库连接时限为 15 秒。
- `schema.ts`：Better Auth 的 users、accounts、sessions、verifications 表，邮箱与凭据唯一约束、user_id 外键和时间字段。

## 维护约定

Feature 可以直接使用 Drizzle。数据库结构变化必须生成 `drizzle/` migration，并分别在开发、测试和生产环境执行。

运行配置与账号创建见 [数据库与账号接入](../../docs/auth-setup.md)。健康记录和 AI Token 尚未创建表；OAuth 登录未启用，account 的 OAuth 字段保持空值。
