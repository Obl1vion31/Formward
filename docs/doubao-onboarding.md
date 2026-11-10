# 豆包应用插件接入

## 当前状态

Formward 使用个人运营者施绪飞扬，联系邮箱 opg.obl1v@gmail.com。应用 AppID 为 `db_app_9m6xflq`。体验白名单已加入本人调试账号，平台显示“生效／永久”；真实 UID 只在平台中配置，不进入代码、文档或公开截图。

`https://global.formward.top` 的 request 与 WebView 两类合法域名均已在平台验证为“已生效”。平台拒绝公网 IP（`ip is not allowed`）；原 Vercel 子域名的初步检查返回 `ssrf blocked: the request address is forbidden`。自定义域名通过正常验证，未关闭证书或平台安全检查。

域名校验原文件为 `public/doubao_45g8h0ck.txt`，SHA-256 `69022224f241371df358c978cb28384ac663337448e6a939570ac30b7d4cdbe7`。已发布至 Vercel READY `dpl_72pneM6RmMENjooYjt8YnVC1aSnz`，只增加该文件，256个既有文件保持哈希不变；原网关函数仍为0f3434d。两个别名的校验文件与协议均匿名200且SHA一致，原GPT连接已核对保持可用。

官方 CLI 0.0.41 已经用户批准登录，前端 SDK 固定0.4.2。用户另已批准把现有 AppSecret 复制至上海服务器；私有凭据已经 root 0600 暂存，尚不表示业务已启用。代码、Manifest、运行态 Skill 与自定义登录已实现；服务发布、平台测试版本和真实 App 授权仍须逐项核对后记录，不能把本地编译当成已接通。

## 控制台资料

应用名称为 Formward。描述可填写：

> Formward 是个人饮食、身体与训练记录助手。连接账号并授权后，可查询饮食摄入、实测体重体脂、能量消耗及训练记录，查看阶段变化。新增或修改先生成预览，由用户登录 Formward 网页确认后保存，供日常记录与生活方式参考。

| 字段 | 已公开的正式链接 |
|---|---|
| 隐私协议 | https://formward-ten.vercel.app/privacy.html |
| 服务条款 | https://formward-ten.vercel.app/terms.html |

两份协议于2026年11月10日经用户确认公开并生效，匿名HTTPS返回200，无需登录。源码为 `public/privacy.html`、`public/terms.html` 与 `legal.css`；global别名提供同内容。页面说明个人运营者、健康记录类别、授权、私有图片、上海主库与境外 Vercel／Blob 处理、备份限制及权利请求方式，不承诺全部数据仅境内保存。

## 链路与隔离

豆包 App → 已验证的 Vercel 域名 → 签名回源 → 上海业务及现有主库。AppSecret 仅由上海服务向官方 OpenAPI 换取 OpenID，不放到网关、前端、Skill、Git 或日志。平台账号只保存带应用上下文的 HMAC 摘要；不收集宿主手机号、昵称或头像。

`integrations/doubao` 维护平台工程；`src/features/doubao` 维护身份与协议适配。18项工具调用现有 MCP 工厂及业务 feature，不新增健康计算、数据库结构、HTTP v1 或网页确认端点。

| 入口 | 用途 |
|---|---|
| `/api/doubao/login` | 校验 AppID，以宿主 login_code 换真实 OpenID，生成限时 PKCE 授权状态 |
| `/api/doubao/authorize` | 校验状态并进入独立的 Formward 登录／同意页面 |
| `/doubao/login`、`/doubao/consent` | 使用已有 Formward 邮箱账号，列出权限、接收方及处理位置，由用户选择 |
| `/doubao/callback` | 只向豆包 WebView 回传短期一次性开发者兑换码或拒绝结果 |
| `/api/doubao/fetch-token` | 平台消费实际 OAuth 授权码，取得只在服务端流转的令牌 |
| `/api/doubao/refresh-token` | 复用原 OAuth 刷新轮换与撤销，保持绝对最长30天期限 |
| `/api/doubao/mcp` | 匿名只公开工具定义；业务调用同时校验 OpenID、JWT、绑定、账号及当前授权 |
| `/api/doubao/delete-userinfo` | 幂等回应宿主资料通知；本接入未收集手机号等资料，不删除健康记录或账号 |

豆包连接复用现有 OAuth 表、授权码单次消费、刷新和网页撤销规则，具有独立的应用／OpenID／入口客户端。有效绑定不能直接覆盖其他 Formward 账号；原账号撤销后才可换绑。原 GPT 的 `/api/mcp`、issuer、resource、客户端、Cookie 和令牌不变。关闭豆包开关或缺少其配置，只影响豆包入口。

查询结果以 `formward_query_result` 实体中的 `result_json` 保留原结果；外层实体编号是查询容器，不是健康记录编号。写入仍只生成网页预览，重复请求保留 operationId，只有用户网页确认后才保存。确认链接沿用现有国服网页，真实 App 的链接打开行为需要实测，不能用本机结果代替。

## 服务配置与迁移

服务端配置 `FORMWARD_DOUBAO_ENABLED=1`、`FORMWARD_DOUBAO_APP_ID`、`FORMWARD_DOUBAO_APP_SECRET`、`FORMWARD_DOUBAO_ORIGIN=https://global.formward.top`；继续使用原有 `BETTER_AUTH_SECRET`，禁止更换它破坏既有授权。`DOUBAO_OPENAPI_BASE_DOMAIN` 默认官方正式地址；本地模拟器才使用官方沙箱地址，不能把沙箱 login_code 交给正式 OpenAPI。

未来迁国内时，先验证新 request／WebView 域名及独立豆包全链路，再更新原生客户端、Manifest和服务配置；保留过渡入口及兼容观察窗。原 GPT 地址继续保留，不能提前承诺迁移后全部豆包客户端免重新授权。

## 验证范围

隔离测试使用临时 PGlite 和虚构账号，实际执行 PKCE、OAuth 授权码、刷新轮换、重启后兑换、拒绝、绑定冲突／转移、撤销、错误应用／来源／正文、上游失败、现代／旧版 MCP 和原 GPT 独立连接。预览测试核对重复提交同一编号且正式身体表未写入。原生客户端测试覆盖重复成功、取消、迟到回传和成功途中退出。

H5 使用生产构建，通过 CUA 实际填写错误密码、重试、拒绝、再次发起、允许及失效请求，检查深浅主题、320／390／430／1100／1440及矮屏横屏。D6四种手机视口与横屏底部已补证，键盘焦点可见。证据在 `C:/Users/14878/.codex/visualizations/2026/11/10/formward-doubao-login`，平台域名及CLI证明在同日 `formward-doubao-setup`。Impeccable detector在正确工作目录运行，结果为空；独立review的返回状态与SDK恢复两项问题已修复并判为resolved，ship仅覆盖这两项。

返回组件的受控fixture直接引用实际源码，只替换SDK边界；CUA真实点击重新加载、实际等待8秒超时及重发后检查成功，普通浏览器和拒绝状态不再虚报处理中。12项豆包与桥接测试通过；完整590项测试及原生4项测试通过。初轮production构建通过，最后以干净兼容构建为准。fixture成功不等于官方SDK或真实WebView通过。

真实豆包 App 的登录身份交换、JS SDK 回传、查询和国服确认链接尚未测；物理手机、辅助阅读器、系统文字放大及 WebKit 未计通过。公开平台版本、服务发布结果和未通过项在实际操作后更新。平台准入、主体认证与完整法律评估不由代码或隐私页面替代。

## 资料与维护

- [豆包登录说明](https://open.doubao.com/apps-plugin/docs/backend-development/login)与已安装官方 CLI 的 `doubao-agentic-service-development` Skill、SDK类型声明共同约束实际协议。
- [平台审核标准](https://open.doubao.com/apps-plugin/docs/release/review-guidelines)要求描述、声明与真实能力一致。
- [AI接入](ai-api.md)、[账号接入](auth-setup.md)、[部署](deployment.md)与[设计验收](design-reference.md)继续适用。

资料维护直接写当前可验证状态，不公开 UID、OpenID、AppSecret、令牌、临时登录码或真实健康截图。
