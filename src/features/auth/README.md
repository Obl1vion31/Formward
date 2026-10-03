# Auth

## 目的

负责内部邮箱密码登录、Session、当前用户和退出。网页入口与 HTTP 认证接口使用同一 Better Auth 配置；AI Personal Access Token 尚未接入。

## 当前内容

- `auth.ts`：Drizzle adapter、密码登录、会话验证、可信来源与限流。公开注册关闭；cookie 为 HttpOnly / SameSite=Lax，HTTPS 下使用 Secure。会话有效期 7 天，不启用客户端会话缓存，数据库撤销立即生效。登录按来源限流为每分钟 5 次，当前存储在服务进程内存；扩展为多实例部署时需共享限流存储。
- `server.ts`：Next.js 的 server-only 入口，避免认证配置被客户端导入。
- `client.ts`：浏览器登录与退出请求、超时与中文错误提示；不保存密码或令牌。
- `provision.ts`：管理员账号创建，规范化邮箱并在事务中写用户和 credential，密码保存 scrypt 哈希；重复请求不创建重复账号或重置密码。
- `auth.test.ts`：独立内存 PostgreSQL 的正常、无效、重复、跨账号、撤销、过期、来源检查和限流验证。

## 维护约定

身份来自已验证的会话 cookie，不能采用客户端提交的 user_id。未来 AI Token 必须单独鉴权、只保存不可逆摘要，并最终映射到同一 user_id。内部账号通过 `pnpm account:create` 创建；数据库和配置说明见 [接入指南](../../../docs/auth-setup.md)。
