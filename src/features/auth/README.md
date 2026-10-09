# Auth

## 目的

负责内部邮箱密码登录、Session、当前用户和退出。网页入口与 HTTP 认证接口使用同一 Better Auth 配置；独立可撤销 AI Token。

## 当前内容

- `auth.ts`：Drizzle adapter、密码登录、会话验证、可信来源与限流。公开注册关闭；cookie 为 HttpOnly / SameSite=Lax，HTTPS 下使用 Secure。会话有效期 7 天，不启用客户端会话缓存，数据库撤销立即生效。登录按来源限流为每分钟 5 次，当前存储在服务进程内存；扩展为多实例部署时需共享限流存储。
- `server.ts`：Next.js 的 server-only 入口，避免认证配置被客户端导入；currentPageUser 使用 React cache 在同次 Server Component 请求中复用身份查询，不跨请求缓存。页面和 Server Actions 继续分别验证身份。
- `client.ts`：浏览器登录与退出请求、超时与中文错误提示；不保存密码或令牌。
- `provision.ts`：管理员账号创建，规范化邮箱并在事务中写用户和 credential，密码保存 scrypt 哈希；重复请求不创建重复账号或重置密码。
- `auth.test.ts`：独立内存 PostgreSQL 的正常、无效、重复、跨账号、撤销、过期、来源检查和限流验证。

## 维护约定

身份来自已验证的会话 cookie，不能采用客户端提交的 user_id。AI Token 独立 Bearer 鉴权、只保存不可逆摘要，映射到同一 user_id。内部账号通过 `pnpm account:create` 创建；数据库和配置说明见 [接入指南](../../../docs/auth-setup.md)。

`ai-tokens.ts` 提供 30 天 read／write 令牌创建、列表、撤销和即时鉴权，原文只创建时返回，列表不含摘要或原文。`ai-access.tsx` 提供令牌表单、复制说明和最近身体操作；用户数据和确认由 measurements feature 处理。

登录验证、退出与令牌创建／撤销绑定实际异步状态，按钮立即变字并防止重复提交，超过 200ms 使用 components 的全站模态加载层。认证成功先收起提示，完成首页既有最终动画后才导航；失败显示原错误并保留输入。站内页面入口使用 LoadingLink，协议文件仍为普通链接；后台预取和本地展开不触发遮罩。
