# 豆包应用插件接入

## 当前状态

Formward 使用个人运营者施绪飞扬，联系邮箱 opg.obl1v@gmail.com。应用 AppID 为 `db_app_9m6xflq`。体验白名单已加入本人调试账号，平台显示“生效／永久”；真实 UID 只在平台中配置，不进入代码、文档或公开截图。

`https://global.formward.top` 的 request 与 WebView 两类合法域名均已在平台验证为“已生效”。平台拒绝公网 IP（`ip is not allowed`）；原 Vercel 子域名的初步检查返回 `ssrf blocked: the request address is forbidden`。自定义域名通过正常验证，未关闭证书或平台安全检查。

域名校验原文件为`public/doubao_45g8h0ck.txt`，SHA-256 `69022224f241371df358c978cb28384ac663337448e6a939570ac30b7d4cdbe7`。海外READY `dpl_7LC5LTzjS7zokZa6atCsrHpT5vxa`，网关代码仍为74754129，实际发布区域固定为`iad1`；`formward-ten.vercel.app`与`global.formward.top`均已核对指向该部署，257项静态文件、路由和网关代码哈希保持。验证文件、协议及样式匿名200且SHA与源码一致。

当前上海应用 `dual-entry-395fa322-mobile-onboarding-20261111`，源码`395fa322eef156996a1a9003b71457dd37dee3bc`，BUILD_ID `TllG814QHTC4pRj-N7WGa`，目录`mobile-onboarding-20261111`。手机首次引导任务发布的该版本已包含本次929a9d47参数修复；豆包适配、OAuth和共用MCP源码哈希相同，未覆盖另一任务的发布。原GPT的issuer、resource、客户端和凭据保持；AppSecret仍只在上海root 0600私有配置，环境文件字节未变。参数修复基线929a9d47保留47项Server Action、原绑定密钥和285项旧静态资源；后续手机引导发布的兼容及视觉验收由对应任务记录。55表／36条migration保持，无新增健康计算、数据库迁移或正式虚构健康记录。

官方 CLI 0.0.41 已经用户批准登录，前端 SDK 固定0.4.2。测试版 **`0.0.1-dev.20261110.2`** 已云构建成功，Manifest、运行态Skill、前端和业务声明均已上传；不是正式上架版本。平台配置预览已核对18项工具、完整Skill、三个登录回调地址及扫码入口。本人手机已完成真实身份交换、网页授权回传和平台换码绑定。请求适配和平台参数校验已修复，手机连接检查及身体查询已由本人和服务端双重验证通过；国服写入确认未覆盖本轮。

## 单餐新增契约

`preview_meal`是新增一餐的首选，豆包共有19项工具，原18项及GPT工具集保持兼容。模型只填写operationId、date、mealType和foods；食物营养平铺，数量、营养采用十进制字符串。省略未知营养映射为null，明确0保留；自由项是实际食用总量，食材引用由服务器按规格换算。不创建食材库条目，不直接修改历史或保存正式餐次。

可选timezone、notes、imageIds和expectedImageCount沿用现有能力。今天／昨天由服务器按用户时区解析，不依赖模型系统日期；其他相对日期先查询日期上下文。成功后重试沿用返回的明确日期、timezone、operationId和内容，不随跨日重新解释。包装标签来源使用label，估算使用estimated并提供basis；服务器只兼容明确等价标签别名与同单位营养后缀，不猜来源、食量或营养。用户仍需网页登录确认。

同一Zod导出方式下，输入schema由10,714字节降为1,647字节（约减少85%），组合分支由40处降为0；这些是契约复杂度指标，不等于成功率。豆包发现同时将整数exclusiveMinimum数值约束等价转换为minimum，原业务验证保持。

旧版本的模拟器对照已复现：模型给submit_meal_operation传items或把date放在根层，平台在派发前拒绝，未命中业务服务。初版简单入口成功生成过预览，但另两样本曾错误生成package_label，已据此补充字段说明、Skill映射及服务端明确别名兼容。原始失败、网络错误与修正后的结果分别留存，不把构建成功或小样本当成真实手机已通过；本人真机仍需更新测试版本后复测记餐。

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

参数修复基线929a9d47的593项单元／集成全部通过，其中14项豆包／桥接专项；lint、typecheck、干净兼容production build及实际Next production HTTP双协议验收通过。带平台保留字段的连接检查与身体查询成功，非法日期、其他未知字段和无效凭据仍拒绝，健康写入0。原无隔离完整运行耗尽本机WSL内存，中断记录保留；最终按78个原测试文件串行独立运行同一套断言，未放宽检查。原生4项、此前H5尺寸与独立review保持原验收范围，不冒充本次手机查询或新视觉验收。

首轮应用切换后曾出现Vercel API 503，回退应用后仍持续；追加有界网关诊断并重发后恢复，随后重新启用豆包应用及更新协议版本，两端版本和原GPT均复核正常。未确认间歇故障根因，不归因于TLS、证书或某一应用变更；未关闭校验、轮换凭据或回退数据。该过程及私有证据见[部署](deployment.md)。

本人真实身份交换、网页授权、平台换码和续期已通过。最初的Next请求代理复制异常已在0f5c7e24修复；当前保留从有界JSON重建Request、原JWT／OpenID／归属与权限检查。

本人手机2026年11月10日23:53的“检查连接”已通过令牌和归属校验，但空参数工具收到两项额外字段，在SDK工具入参校验阶段失败；scope完整，刷新也成功。依据豆包平台协议，适配层只移除`from_mcp_call`与`_miniapp_permitted_data`，不使用其数据或推断身份；其他业务字段仍严格校验。隔离测试先复现旧失败、修复后通过；2026年11月11日01:02真机复测中，两项工具实际命中这两个平台字段并完成、HTTP200；用户确认连接检查与身体查询正常，原因已由真实调用闭环。依据见[平台保留上下文](https://open.doubao.com/apps-plugin/docs/backend-development/system-permissions)。

发布后另捕获海外回源ETIMEDOUT：上海公开入口200，海外两个别名503，原GPT复核也曾失败。固定公开版本接口的保护探针实测香港`hkg1`无法建立TCP，而美国东部`iad1`的TCP、TLS及HTTP200均通过；切换到iad1后，三入口版本一致，新旧协议发现18工具，8项公开资源SHA一致，原GPT实际get_profile恢复且为同一账号。运行日志的sin1标记不能单独当作函数实际区域；上述探针直接读取VERCEL_REGION。不据此追认更早间歇503的根因。

上海临时JSON诊断preload和本人systemd drop-in已移除，实际服务环境无探针；Vercel四个本轮候选／诊断部署已安全删除，临时保护绕过令牌已撤销，两正式别名的诊断路径即使带旧私有头也返回404。只保留不含健康内容的私有证据和兼容回退，不删除其他任务。

测试版`0.0.1-dev.20261110.2`保持，本人OpenID交换、WebView回传、绑定、换码和续期已验证。本人确认手机连接检查与最近七天身体查询正常；服务端两工具complete／HTTP200，分别5ms和126ms。无需重扫或重新授权。国服写入确认及完整真机布局未覆盖本轮。

手机连接与身体查询已通过；国服写入确认、辅助阅读器、系统文字放大、200%及WebKit新登录流程未覆盖本轮。平台准入、主体认证与完整法律评估不由代码、测试版本或隐私页面替代。

本轮私有证据归档至主线main-current工作区的`.codex/doubao-integration-20261111`，包含`doubao-platform-arguments-release`、`doubao-gateway-recovery`、`doubao-research`及前期平台／请求修复材料。此前手机连接及身体查询问题已闭环，相关工作归档后清理本轮分支与临时工作区；不能公开凭据、真实UID或健康结果。后续网关发布须显式传`--regions iad1`并核对部署API和真实回源；不能只依赖本地vercel.json。

## 资料与维护

- [豆包登录说明](https://open.doubao.com/apps-plugin/docs/backend-development/login)与已安装官方 CLI 的 `doubao-agentic-service-development` Skill、SDK类型声明共同约束实际协议。
- [平台审核标准](https://open.doubao.com/apps-plugin/docs/release/review-guidelines)要求描述、声明与真实能力一致。
- [AI接入](ai-api.md)、[账号接入](auth-setup.md)、[部署](deployment.md)与[设计验收](design-reference.md)继续适用。

资料维护直接写当前可验证状态，不公开 UID、OpenID、AppSecret、令牌、临时登录码或真实健康截图。
