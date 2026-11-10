# 豆包应用插件接入

## 当前状态

Formward 使用个人运营者施绪飞扬，联系邮箱 opg.obl1v@gmail.com。应用 AppID 为 `db_app_9m6xflq`。体验白名单已加入本人调试账号，平台显示“生效／永久”；真实 UID 只在平台中配置，不进入代码、文档或公开截图。

`https://global.formward.top` 的 request 与 WebView 两类合法域名均已在平台验证为“已生效”。平台拒绝公网 IP（`ip is not allowed`）；原 Vercel 子域名的初步检查返回 `ssrf blocked: the request address is forbidden`。自定义域名通过正常验证，未关闭证书或平台安全检查。

域名校验原文件为 `public/doubao_45g8h0ck.txt`，SHA-256 `69022224f241371df358c978cb28384ac663337448e6a939570ac30b7d4cdbe7`。当前 Vercel READY 为 `dpl_DR2jkfpiv7qzxydBP4DVjcVhr9V5`，网关源码74754129，仅增加有界错误元数据诊断；257项静态文件及路由保持。`formward-ten.vercel.app` 与 `global.formward.top` 均指向该部署，校验文件、协议及样式匿名200且SHA与源码一致。

上海服务已启用独立豆包入口，应用为 `dual-entry-0f5c7e24-doubao-mcp-request-20261110`，源码0f5c7e24，BUILD_ID `a-cKXvLOUnAhAig-m7rcY`，目录 `doubao-mcp-request-20261110`。AppSecret经用户批准保存在 `/etc/formward/primary.env`，仅root可读；原OAuth配置、47项Server Action和282项旧静态资源保留。上海仍为55表、36条migration，无新增数据库结构。

官方 CLI 0.0.41 已经用户批准登录，前端 SDK 固定0.4.2。测试版 **`0.0.1-dev.20261110.2`** 已云构建成功，Manifest、运行态Skill、前端和业务声明均已上传；不是正式上架版本。平台配置预览已核对18项工具、完整Skill、三个登录回调地址及扫码入口。本人手机已完成真实身份交换、网页授权回传和平台换码绑定。请求适配的503已修复；本人重试已到达工具层，但结果仍失败，当前尚未完成真实查询及预览确认验收。

## 本人手机预览

打开[测试版本详情](https://developer.doubao.com/agentic_service/db_app_9m6xflq/versions/0.0.1-dev.20261110.2)，点击“调试二维码”。当前平台推荐豆包15.2.0或以上版本，通过“设置 → ··· → 应用插件 Debugger”扫码更新资源并预览。该二维码对应已上传的云构建版本，不是本地 `dbx device` 设备授权。

平台另有“主对话”扫码项，但界面注明仅已配置实验的业务能使用；不把白名单等同于主对话全面开放。官方CLI还提供[UGC Bot预览对话](https://inhouse.doubao.com/bot/2xgttdEs)，实际可用入口以本人App和平台提示为准。

在测试版中明确点击“连接Formward”，本人登录并核对权限后允许连接；先询问连接状态，再查询一个明确日期的已有记录。新增／修改仍需本人打开返回的网页预览确认。真实手机的OpenID交换、WebView回传、工具查询及确认链接均须分别记录结果；不索要或在聊天中传递密码、临时登录码或令牌。

初次测试版 `.1` 在草稿提交后因平台“服务暂时不可用”构建失败，CLI错误50010002；核对远端状态后重试生成 `.2`，状态为succeeded。失败版本保留，不重复上传或当作成功版本。

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
| `/api/doubao/mcp` | 匿名支持现代 `server/discover` 和旧版发现；业务调用同时校验 OpenID、JWT、绑定、账号及当前授权 |
| `/api/doubao/delete-userinfo` | 幂等回应宿主资料通知；本接入未收集手机号等资料，不删除健康记录或账号 |

豆包连接复用现有 OAuth 表、授权码单次消费、刷新和网页撤销规则，具有独立的应用／OpenID／入口客户端。有效绑定不能直接覆盖其他 Formward 账号；原账号撤销后才可换绑。原 GPT 的 `/api/mcp`、issuer、resource、客户端、Cookie 和令牌不变。关闭豆包开关或缺少其配置，只影响豆包入口。

查询结果以 `formward_query_result` 实体中的 `result_json` 保留原结果；外层实体编号是查询容器，不是健康记录编号。写入仍只生成网页预览，重复请求保留 operationId，只有用户网页确认后才保存。确认链接沿用现有国服网页，真实 App 的链接打开行为需要实测，不能用本机结果代替。

## 服务配置与迁移

服务端配置 `FORMWARD_DOUBAO_ENABLED=1`、`FORMWARD_DOUBAO_APP_ID`、`FORMWARD_DOUBAO_APP_SECRET`、`FORMWARD_DOUBAO_ORIGIN=https://global.formward.top`；继续使用原有 `BETTER_AUTH_SECRET`，禁止更换它破坏既有授权。`DOUBAO_OPENAPI_BASE_DOMAIN` 使用官方正式地址；需要模拟身份交换的隔离环境才使用官方沙箱，不能把沙箱 login_code 交给正式 OpenAPI。原生运行时公开配置由Manifest生成，AppID只在Manifest手工维护。

转运用的本机与服务器临时凭据副本已清除，运行中的root私有配置及必要的私有回退材料保留。隔离H5和原生行为fixture已停止，官方CLI登录会话仍按已授权范围保留。

未来迁国内时，先验证新 request／WebView 域名及独立豆包全链路，再更新原生客户端、Manifest和服务配置；保留过渡入口及兼容观察窗。原 GPT 地址继续保留，不能提前承诺迁移后全部豆包客户端免重新授权。

## 验证范围

隔离测试使用临时 PGlite 和虚构账号，实际执行 PKCE、OAuth 授权码、刷新轮换、重启后兑换、拒绝、绑定冲突／转移、撤销、错误应用／来源／正文、上游失败、现代／旧版 MCP 和原 GPT 独立连接。预览测试核对重复提交同一编号且正式身体表未写入。原生客户端测试覆盖重复成功、取消、迟到回传和成功途中退出。

H5 使用生产构建，通过 CUA 实际填写错误密码、重试、拒绝、再次发起、允许及失效请求，检查深浅主题、320／390／430／1100／1440及矮屏横屏。D6四种手机视口与横屏底部已补证，键盘焦点可见。最终d1aaa4e5发布产物另以隔离虚构账号重验允许／拒绝，并保存有效390px截图；首轮缩小截图未作为验收证据。证据在 `C:/Users/14878/.codex/visualizations/2026/11/10/formward-doubao-login`，平台域名、CLI与测试版二维码在同日 `formward-doubao-setup`。

返回组件的受控fixture直接引用实际源码，只替换SDK边界；CUA真实点击重新加载、实际等待8秒超时及重发后检查成功。原生组件另用实际源码检查慢请求取消、迟到响应忽略、成功已回报但退出失败及手动返回，不会成功后再回报失败。Impeccable detector结果为空；两次独立review各自指出的两项问题均修复并判为resolved，ship仅覆盖对应修复范围。fixture成功不等于官方SDK、原生样式或真实WebView通过。

完整592项单元／集成、13项豆包／桥接专项、原生4项测试、lint、typecheck、干净兼容production build及官方云构建通过。官方 `dbx dev` 模拟器已实见 Tools Loaded(18)及原生主页；正式HTTPS以SDK自动协商现代协议和旧版分别发现18项工具，匿名私有调用被拒绝。原GPT实际get_profile已再次成功且与发布前同一账号，无需重连。

首轮应用切换后曾出现Vercel API 503，回退应用后仍持续；追加有界网关诊断并重发后恢复，随后重新启用豆包应用及更新协议版本，两端版本和原GPT均复核正常。未确认间歇故障根因，不归因于TLS、证书或某一应用变更；未关闭校验、轮换凭据或回退数据。该过程及私有证据见[部署](deployment.md)。

2026年11月10日22:00至22:01，本人手机真实OpenID交换和平台fetch-token均成功，现有绑定有效、权限完整；WebView授权回传已通过，未在聊天或日志读取令牌。随后发现Next框架代理Request不能被原生构造器复制私有状态，导致已登录工具调用503；改为从已校验JSON、URL和方法重建普通请求，保留取消信号并移除旧长度／分块头，JWT和账号权限规则不变。22:21上线0f5c7e24，未修改环境文件、绑定或数据库结构，也未重发原生测试版及Vercel网关。

新增框架代理回归先在旧代码失败、修复后通过；实际Next production旧产物同样复现503，新产物用虚构账号完成真实HTTP登录／同意／换码、双协议账号与身体查询、无效凭据401和零健康写入，并正常退出。fixture最初因socket关闭回调尚未排空而退出异常，排空后重验通过，不把首次退出异常计为完整通过。公网三个版本入口一致、无效豆包凭据401、原GPT实测仍为同一账号。

本人22:26至22:27重试时，`query_measurements` 和 `authorize_formward` 均到达工具、HTTP200但结果失败，绑定与原授权仍有效；不能把消除503当成真实查询已可用。当前暂用systemd运行时drop-in加载只记录错误类别／类型的Response诊断，不记录错误原文、健康数值或令牌；新对话的实际失败类别仍待捕获。诊断与移除脚本位于本轮私有 `.codex/doubao-research`，详情见交接，定位完成后移除。

本人手机身体查询、国服确认链接及完整手机布局仍未计通过；辅助阅读器、系统文字放大、200%及WebKit新登录流程未测。平台准入、主体认证与完整法律评估不由代码、测试版本或隐私页面替代。

## 资料与维护

- [豆包登录说明](https://open.doubao.com/apps-plugin/docs/backend-development/login)与已安装官方 CLI 的 `doubao-agentic-service-development` Skill、SDK类型声明共同约束实际协议。
- [平台审核标准](https://open.doubao.com/apps-plugin/docs/release/review-guidelines)要求描述、声明与真实能力一致。
- [AI接入](ai-api.md)、[账号接入](auth-setup.md)、[部署](deployment.md)与[设计验收](design-reference.md)继续适用。

资料维护直接写当前可验证状态，不公开 UID、OpenID、AppSecret、令牌、临时登录码或真实健康截图。
