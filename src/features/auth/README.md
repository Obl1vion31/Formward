# Auth

## 目的

负责邀请制邮箱密码登录、Session、账号管理、当前用户和退出。网页入口与 HTTP 认证接口使用同一 Better Auth 配置；独立可撤销 AI Token。

## 当前内容

- `auth.ts`：Drizzle adapter、密码登录、会话验证、可信来源与限流。公开注册关闭；cookie 为 HttpOnly / SameSite=Lax，HTTPS 下使用 Secure。会话有效期 7 天，不启用客户端会话缓存，数据库撤销立即生效。登录按来源限流为每分钟 5 次，存储在数据库 rate_limits；多实例共享原子计数，重建实例不重置限制。
- `site-url.ts`：公网链接采用 BETTER_AUTH_URL 的 HTTPS 根地址，忽略代理内部地址和请求 Host；本机兼容 localhost、127.0.0.1 与 IPv6。`site-url.test.ts` 覆盖审核链接、OpenAPI、错误配置和云服务默认时区。
- `server.ts`：Next.js 的 server-only 入口，避免认证配置被客户端导入；currentPageUser 使用 React cache 在同次 Server Component 请求中复用身份查询，不跨请求缓存。页面和 Server Actions 继续分别验证身份。
- `client.ts`：浏览器登录与退出请求、超时与中文错误提示；不保存密码或令牌。
- `provision.ts`：维护脚本创建普通账号，规范化邮箱并在事务中写用户和 credential，密码保存 scrypt 哈希；重复请求不创建重复账号或重置密码。
- `auth.test.ts`：独立内存 PostgreSQL 的正常、无效、重复、跨账号、撤销、过期、来源检查和限流验证。

## 维护约定

`account-management.ts` 提供受限 owner、会话再次验密、账号列表、72 小时邀请、15 分钟密码重设、本人账号设置与本地 owner 引导／恢复。一次性原文只生成时返回，数据库保存 SHA-256 摘要；预览不消费，兑换、密码与审计同事务。没有邮件或自助注册，手动激活不验证邮箱。网页不提供健康记录、代登录、角色编辑和删除用户。

`account-security.ts` 集中检查停用状态、会话版本、十分钟近期验密、共享限流和全部访问撤销。`request-identity.ts` 将已验证的本次会话绑定到服务端异步上下文；现有网页写入在账号行锁内复核，防止撤销后的在途请求继续保存。AI／OAuth 的令牌与连接保留永久撤销状态，恢复不复活旧授权。登录按账号和来源分别限流；新会话不继承管理解锁。

`admin-panel.tsx`、`account-panel.tsx`、`claim-panel.tsx` 与 `account-ui.tsx` 提供管理、本人设置、公开链接和共享交互。`account.module.css` 沿用石墨／暖金与紧凑手机布局。入口在 `/admin`、`/dashboard/account`、`/account/claim`；feature 不承载 Next.js Server Actions。

身份来自已验证的会话 cookie，不能采用客户端提交的 user_id。AI Token 独立 Bearer 鉴权、只保存不可逆摘要，映射到同一 user_id。内部账号通过 `pnpm account:create` 创建；数据库和配置说明见 [接入指南](../../../docs/auth-setup.md)。

`ai-tokens.ts` 提供 30 天 read／write 令牌创建、列表、撤销和即时鉴权，原文只创建时返回，列表不含摘要或原文。`ai-access.tsx` 首先展示连接状态、实际三类权限、MCP接入操作和最近提交；业务日期／类型摘要与提交时间分开，过期状态随时间更新。连接教程默认收起，手动令牌与HTTP配置位于高级接入。新令牌创建后自动展开并聚焦一次性原文，关闭或刷新后不再显示；创建、复制、撤销反馈贴近相应操作。`ai-access.module.css`仅调整设置页，不影响审核页。用户数据与确认由各业务feature处理。

登录验证、退出与令牌创建／撤销绑定实际异步状态，按钮立即变字并防止重复提交，超过 200ms 使用 components 的全站模态加载层。认证成功先收起提示，完成首页既有最终动画后才导航；失败显示原错误并保留输入。站内页面入口使用 LoadingLink，协议文件仍为普通链接；后台预取和本地展开不触发遮罩。

## MCP OAuth

`auth.ts` 配置 JWT、MCP OAuth Provider 与 CIMD，提供授权码 + S256 PKCE、轮换刷新、客户端元数据发现与动态注册。凭据和客户端密钥保存摘要，JWT 私钥加密保存。公开 signJWT／网页登录取 JWT 入口关闭，访问令牌只从有效 OAuth 授权签发。

`oauth-connections.ts` 保存稳定连接、权限、期限与撤销；撤销立即阻止 MCP、续期和旧审核。`ai-identity.ts` 统一手动令牌与 OAuth 身份，measurements 不另写授权逻辑。`oauth-pages.ts` 验证签名 query，`oauth-form.tsx` 展示登录／继续／同意／拒绝，不信任客户端账号标识。`ai-access.tsx` 同时提供 MCP 地址、连接管理及原手动令牌。设置页按顺序读取列表以兼容 PGlite socket。

`oauth.test.ts` 使用实际 OAuth HTTP 和两代 SDK 客户端覆盖发现、签名请求、PKCE、刷新轮换、幂等、网页确认、只读、跨账号、到期、伪造签名和撤销。`tests/oauth.browser.mjs` 验证手机登录授权及完整预览确认／撤销流程，均使用虚构数据库。

饮食OAuth使用meals:read／meals:write，与身体权限独立；原连接需重新授权。owner-lock.ts为新增业务共用账号行锁。requireActiveAiToken及requireOauthConnection按业务域复核授权，旧身体调用保留默认域。AI设置同时列出身体与饮食审核，手动令牌仍为统一read／write。

AI接入按连接实际scope以同一格式显示身体、饮食／食材及消耗的查询与提交权限，缺失时提示在客户端重新授权；不自动扩展旧连接。query_energy要求energy:read，统一消耗预览要求energy:write。

完整接入使用authorize_formward统一检查并申请身体、饮食／食材、消耗的查询与提交预览权限。该工具只返回连接状态，不读取健康内容、不生成预览或保存事实；OAuth同意仍由用户完成。缺权限时保留原有授权，并合并申请三类记录权限；只有读取权限的连接在日常查询补授权时只申请三类读取，明确调用完整接入或提交工具才申请提交权限。已有令牌不会因请求授权而自动扩权，旧客户端与单类授权继续可用。

AI新增和修改由ai-write-policy.ts统一限制：不允许整条删除／恢复，网页手工操作保留。新申请、统一审核更新与旧申请最终写入均校验；取消草稿不删除事实。
