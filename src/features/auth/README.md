# Auth

## 目的

负责邀请制邮箱密码登录、Session、账号管理、当前用户和退出。网页入口与 HTTP 认证接口使用同一 Better Auth 配置；独立可撤销 AI Token。

## 当前内容

- `auth.ts`：Drizzle adapter、密码登录、会话验证、可信来源与限流。公开注册关闭；cookie 为 HttpOnly / SameSite=Lax，HTTPS 下使用 Secure。会话有效期 7 天，不启用客户端会话缓存，数据库撤销立即生效。登录按来源限流为每分钟 5 次，存储在数据库 rate_limits；多实例共享原子计数，重建实例不重置限制。
- `login-return.ts`：普通网页登录只允许本站业务路径作为返回目标；proxy清除外来同名头后记录实际路径，requirePageUser保留目标，首页认证成功后回原确认页。OAuth登录不走此返回逻辑。
- `next.config.ts`保留 proxy 的原始网址和 RSC 头，区域服务证明始终校验完整路径及全部查询；不能通过忽略业务查询来放宽签名。
- `web-entry.ts`：FORMWARD_SINGLE_WEB=1时将海外普通网页GET／HEAD跳转到固定CN入口；OAuth、API、静态文件、旧页RSC和POST保存保持原路径。人工确认链接统一CN，OAuth issuer及MCP resource保持。跳转不转交Cookie、Authorization或未保存请求体，不信任外来Host。
- `site-url.ts`：公网链接采用 BETTER_AUTH_URL 的 HTTPS 根地址，忽略代理内部地址和请求 Host；本机兼容 localhost、127.0.0.1 与 IPv6。`site-url.test.ts` 覆盖审核链接、OpenAPI、错误配置和云服务默认时区。
- `server.ts`：Next.js 的 server-only 入口，避免认证配置被客户端导入；currentPageUser 使用 React cache 在同次 Server Component 请求中复用身份查询，不跨请求缓存。页面和 Server Actions 继续分别验证身份。
- `client.ts`：浏览器登录与退出请求、超时与中文错误提示；不保存密码或令牌。
- `password-policy.ts`：浏览器表单、认证配置、邀请激活、密码重设、本人改密和维护脚本共用6–128字符限制及提示；不修改已有密码。
- `provision.ts`：维护脚本创建普通账号，规范化邮箱并在事务中写用户和 credential，密码保存 scrypt 哈希；重复请求不创建重复账号或重置密码。
- `auth.test.ts`：独立内存 PostgreSQL 的正常、无效、重复、跨账号、撤销、过期、来源检查和限流验证。

## 维护约定

`account-management.ts` 提供受限 owner、会话再次验密、账号列表、72 小时邀请、15 分钟密码重设、本人账号设置与本地 owner 引导／恢复。一次性原文只生成时返回，数据库保存 SHA-256 摘要；预览不消费，兑换、密码与审计同事务。没有邮件或自助注册，手动激活不验证邮箱。网页不提供健康记录、代登录、角色编辑和删除用户。

`account-security.ts` 集中检查停用状态、会话版本、十分钟近期验密、共享限流和全部访问撤销。`request-identity.ts` 将已验证的本次会话绑定到服务端异步上下文；现有网页写入在账号行锁内复核，防止撤销后的在途请求继续保存。AI／OAuth 的令牌与连接保留永久撤销状态，恢复不复活旧授权。登录按账号和来源分别限流；新会话不继承管理解锁。

`admin-panel.tsx`、`account-panel.tsx`、`claim-panel.tsx` 与 `account-ui.tsx` 提供管理、本人设置、公开链接和共享交互。`account.module.css` 沿用石墨／暖金与紧凑手机布局。入口在 `/admin`、`/dashboard/account`、`/account/claim`；feature 不承载 Next.js Server Actions。

身份来自已验证的会话 cookie，不能采用客户端提交的 user_id。AI Token 独立 Bearer 鉴权、只保存不可逆摘要，映射到同一 user_id。内部账号通过 `pnpm account:create` 创建；数据库和配置说明见 [接入指南](../../../docs/auth-setup.md)。

`ai-tokens.ts` 提供30天read／write令牌创建、列表、撤销和即时鉴权，原文只创建时返回。`ai-access.tsx`只保留一个页面标题，以ChatGPT、豆包两条紧凑行展示状态、权限入口及详情；当前AI名称18px、操作14px，触控44px。`ai-access-panel.tsx`在电脑提供就近浮层，在手机复用底部面板；权限默认收起，多连接逐个列出，不合并或自动扩权。历史与撤销留在管理内容，豆包注明内测白名单，失效时提供重新接入。手动令牌及其他MCP／HTTP位于高级接入；创建后聚焦一次性原文，关闭高级区后清除。AI提交记录默认收起，按真实来源和审核状态筛选，电脑五列单行、手机业务日期短摘要；首帧固定标题、两条AI位置及操作槽，未知状态局部等待。字号、密度和验收以设计规范D14为准。

`ai-access-model.ts` 定义本页视图及状态、时间显示，`ai-access-overview.ts` 按账号批量读取连接、令牌和提交来源。连接按当前同意与原scope的交集显示，停用、过期、撤销和缺少同意均不可用。原业务子操作和训练授权决定发起来源；缺失、冲突或其他账号凭据显示来源未知，不猜测AI名称。初始化保留在饮食页；AI提交跨类型按时间排序，默认收起，展开后可按来源和审核状态筛选，预览采用真实期限。连接先显示，历史与令牌异步接管且保留已展开内容；按账号重建状态，不跨账号缓存。`ai-access.module.css`只作用于设置页，不改变审核页。

登录验证、退出与令牌创建／撤销绑定实际异步状态，按钮立即变字并防止重复提交。AI设置的读取和操作采用超过200ms才出现的局部反馈；登录沿用全站等待层。认证成功先收起提示，完成首页既有最终动画后才导航；失败显示原错误并保留输入。站内页面入口使用 LoadingLink，协议文件仍为普通链接；后台预取和本地展开不触发遮罩。

## MCP OAuth

`auth.ts` 配置 JWT、MCP OAuth Provider 与 CIMD，提供授权码 + S256 PKCE、轮换刷新、客户端元数据发现与动态注册。凭据和客户端密钥保存摘要，JWT 私钥加密保存。公开 signJWT／网页登录取 JWT 入口关闭，访问令牌只从有效 OAuth 授权签发。

`oauth-connections.ts` 保存稳定连接、权限、期限与撤销；撤销立即阻止 MCP、续期和旧审核。`ai-identity.ts` 统一手动令牌与 OAuth 身份，measurements 不另写授权逻辑。`oauth-pages.ts` 验证签名 query，`oauth-form.tsx` 展示登录／继续／同意／拒绝，不信任客户端账号标识。`ai-access.tsx` 同时提供 MCP 地址、连接管理及原手动令牌。设置页按顺序读取列表以兼容 PGlite socket。

`oauth.test.ts` 使用实际 OAuth HTTP 和两代 SDK 客户端覆盖发现、签名请求、PKCE、刷新轮换、幂等、网页确认、只读、跨账号、到期、伪造签名和撤销。`tests/oauth.browser.mjs` 验证手机登录授权及完整预览确认／撤销流程，均使用虚构数据库。

饮食OAuth使用meals:read／meals:write，与身体权限独立；原连接需重新授权。owner-lock.ts为新增业务共用账号行锁。requireActiveAiToken及requireOauthConnection按业务域复核授权，旧身体调用保留默认域。AI设置同时列出身体与饮食审核，手动令牌仍为统一read／write。

AI接入按连接实际有效scope以同一格式显示身体、饮食／食材、消耗和训练计划的查询与提交预览权限，补充权限仍在对应客户端发起并经网页同意；不自动扩展旧连接。query_energy要求energy:read，统一消耗预览要求energy:write。

完整接入使用authorize_formward统一检查并申请身体、饮食／食材、消耗和训练的查询与提交预览权限。该工具只返回连接状态，不读取健康内容、不生成预览或保存事实；OAuth同意仍由用户完成。缺权限时保留原有授权，并合并申请四类记录权限；只有读取权限的连接在日常查询补授权时只申请四类读取，明确调用完整接入或提交工具才申请提交权限。已有令牌不会因请求授权而自动扩权，旧客户端与单类授权继续可用。

AI新增和修改由ai-write-policy.ts统一限制：不允许整条删除／恢复，网页手工操作保留。新申请、统一审核更新与旧申请最终写入均校验；取消草稿不删除事实。


新邀请兑换与provisionAccount在创建账号同事务初始化personal_profiles的待填写状态。既有账号不补空行；密码重设和重复创建不重置引导。个人资料、教程和演练由onboarding feature负责，不新增AI权限。

preferences.ts管理按账号同步的体脂显示偏好，account_preferences与个人资料／引导版本独立；没有偏好行时按本人有效体脂实测推导默认，明确保存后优先。所有读写验证会话，写入再锁账号与核对版本；同值重试安全，跨账号拒绝。account-surfaces.tsx复用资料和安全业务用于手机底部面板；读取超过200ms仅显示局部状态，不生成整套表单骨架。取消及迟到响应不重开面板，密码不持久化，关闭有草稿／忙碌保护。独立页面保留同样的轻量反馈，菜单关闭后的导航等待显示在账号按钮旁。

账号全部撤销、改密和停用同时暂停数据连接、作废租约；恢复账号不会恢复旧上游访问。数据来源试运行资格仅由固定服务器 user_id 决定，owner 角色不自动获得。上游可复用凭据按账号／连接加密，与本平台只存摘要的访问令牌分开。

训练新增training:read／training:write，授权页与AI接入页单独展示。统一授权涵盖身体、饮食／食材、消耗和训练四类，旧连接不会自动扩权；训练预览确认复核原连接／令牌有效性。

双入口使用 regions、regional-transport、regional-gateway 与 OAuth 预检／材料隔离。国服 IP 与国际回源可共用同一 HTTPS 入口；回源验证服务证明后重建来源头，认证 issuer／resource 固定为原 Vercel 地址，原 Cookie、JWT／刷新与撤销规则保持。详见 docs/mainland-deployment.md。

国际网关经regional-http使用原生Node HTTPS访问部署配置中的上海回源，保留证书验证、服务签名、正文与响应流、多条Cookie、取消及手动重定向；不自动重放失败请求。该客户端仅用于固定回源，OAuth外部资料仍使用原有安全预检。真实HTTP测试覆盖压缩、流式提交、响应取消、来源限制与重复请求防护。
