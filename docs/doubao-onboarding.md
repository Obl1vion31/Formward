# 豆包应用插件接入

## 当前可用范围

Formward豆包应用AppID为`db_app_9m6xflq`，本人体验白名单已生效且永久有效；真实UID只在平台配置，不进入代码、文档或公开截图。`https://global.formward.top`的request与WebView域名均已验证生效。当前为本人测试，未提审正式开放。

测试版 **`0.0.1-dev.20261111.1`** 已云构建succeeded，Manifest、运行态Skill、原生源码及业务声明已上传。平台配置预览已核对19项工具、新单餐的完整foods字段及最新Skill；原`0.0.1-dev.20261110.2`保留兼容查看。本人既有登录交换、WebView回传、换码绑定、连接检查及身体查询已通过；本次新记餐工具的真实手机调用和国服最终确认仍待本人复测。

上海正式应用为`dual-entry-55ac4956-doubao-simple-meal-final-20261111`，源码`55ac4956f59205d480b21e8862cb4d0b4f6e4463`，BUILD_ID `z6eI-7owRfYDkdU2vdBuM`，目录`doubao-simple-meal-final-20261111`。包含此前手机引导与主题完善，不改变现有GPT入口、工具及健康计算。

## 新增一餐

豆包新增`preview_meal`作为单餐首选。模型必填operationId、date、mealType和foods，食物使用平铺的name、quantity、unit、caloriesKcal、proteinG、carbsG、fatG、sourceKind及basis字段，不选择actions、kind或嵌套nutrition。原复杂工具仍承接历史修改、食材维护和混合记录；GPT保持原18项工具。

明确日期传YYYY-MM-DD；今天／昨天传today／yesterday，由服务器按用户timezone解析，未知时区采用服务配置。其他相对日期先查询query_meals的context。返回和回复采用已解析的明确日期；成功后重试沿用返回的日期、timezone、原operationId和内容，不跨日重新解释昨天。请求幂等及内容冲突校验继续生效。

所有数量及营养采用十进制字符串。自由食物是本次实际食用总营养，不再次乘数量；未知营养省略并转换为null，明确0与精度保留。具体食物各自作为独立食物，不把多种食物全部标成互斥杂项。食材引用须先搜索真实foodId／foodVersion并提供实际数量、单位，由原饮食feature按规格换算。

包装标签来源为label，成分表为composition_table，估算为estimated并附basis及不确定性。服务器只兼容明确同义的包装标签名称及同单位营养后缀，不推测来源，不换算kg／kJ，不编造营养。食量未知或接受估算必须显式表达；日期、数值、账号归属、食材版本、来源、大小和图片仍由原严格schema及业务验证。

可选timezone、notes、imageIds和expectedImageCount。附件编号只使用import_meal_images真实返回值；原图私有保存不代表餐次已保存。preview_meal只生成pending预览并返回confirmationUrl，必须由用户登录网页确认；模型不得宣称预览已保存。

同一Zod导出方式下，单餐首选inputSchema从原工具10,714字节改用新入口1,687字节，约减少84%；组合分支40处变为0。复杂度指标不等于成功率。豆包发现另把整数exclusiveMinimum:x等价转换为minimum:floor(x)+1，兼容平台解析器；原schema、实际校验及GPT输出保持。

## 本人手机复测

打开[新测试版本详情](https://developer.doubao.com/agentic_service/db_app_9m6xflq/versions/0.0.1-dev.20261111.1)，点击“调试二维码”。平台当前提示使用豆包15.2.0或以上，通过“设置 → ··· → 应用插件 Debugger”扫码更新资源，再进入新的Formward调试对话，重发原来的昨天午餐内容。该二维码是已上传云构建版本，不是本地dbx device授权。

既有Formward连接可沿用；若宿主提示登录失效，再按正常流程连接。更新资源与重新授权是两件事，不要求重建现有GPT连接。平台[UGC Bot预览对话](https://inhouse.doubao.com/bot/2xgttdEs)可按本人App提示进入；主对话扫码仍受平台实验配置限制，白名单不代表全面开放。

核对生成链接、明确日期、食物、食量、未知／0及来源，再打开国服网页确认。生成预览、网页打开和正式保存分别记录结果。不要索取或在聊天里传递密码、临时登录码或令牌。

## 链路与授权

豆包App → Vercel已验证域名 → 签名回源 → 上海现有业务与主库。`integrations/doubao`维护Manifest、运行态Skill、原生首页和登录页；`src/features/doubao`维护身份与协议适配。19项工具复用现有MCP工厂及业务feature，不新增数据库、健康计算、HTTP v1或网页确认端点。

| 入口 | 用途 |
|---|---|
| /api/doubao/login | 宿主login_code换已验证OpenID，生成限时PKCE状态 |
| /api/doubao/authorize | 校验状态，进入Formward登录与同意页面 |
| /doubao/login、/doubao/consent | 邮箱账号登录，明确列出权限与数据接收方 |
| /doubao/callback | 仅回传短期一次性开发者兑换码或拒绝结果 |
| /api/doubao/fetch-token | 消费真实OAuth授权码，取得服务端令牌 |
| /api/doubao/refresh-token | 刷新轮换与撤销，绝对最长30天期限保持 |
| /api/doubao/mcp | 匿名发现；调用验证OpenID、JWT、绑定、账号及当前授权 |
| /api/doubao/delete-userinfo | 幂等回应宿主资料通知，不删除健康记录或账号 |

AppSecret只由上海服务用于官方OpenAPI身份交换，不进入Vercel静态文件、前端、Skill、Git或日志。平台身份只保存绑定应用上下文的OpenID摘要，不收集豆包手机号、昵称或头像。有效绑定不能覆盖另一账号，原连接撤销后才能换绑。原GPT的/api/mcp、issuer、resource、客户端、Cookie和令牌保持；关闭豆包开关不影响GPT。

查询以formward_query_result实体的result_json保留原结果；外层entity_id是查询容器，不是健康记录编号。所有新增或修改只提交预览，正式保存仍需网页确认，AI不能整条删除或恢复。

适配层只移除平台文档中的from_mcp_call和_miniapp_permitted_data，不使用这些数据鉴权或记录其值，其他未知字段仍拒绝。依据见[系统权限服务端协议](https://open.doubao.com/apps-plugin/docs/backend-development/system-permissions)。框架代理请求以已限量解析的JSON重新构造普通Request，保持原URL、方法、鉴权及取消信号。

## 公开资料与协议

个人运营者：施绪飞扬；联系邮箱：opg.obl1v@gmail.com。平台描述：

> Formward 是个人饮食、身体与训练记录助手。连接账号并授权后，可查询饮食摄入、实测体重体脂、能量消耗及训练记录，查看阶段变化。新增或修改先生成预览，由用户登录 Formward 网页确认后保存，供日常记录与生活方式参考。

| 字段 | 已公开的链接 |
|---|---|
| 隐私协议 | https://formward-ten.vercel.app/privacy.html |
| 服务条款 | https://formward-ten.vercel.app/terms.html |

协议于2026年11月10日经用户确认公开生效，匿名HTTPS200，无需登录；global别名内容相同。源码public/privacy.html、terms.html及legal.css说明个人运营、健康记录、授权、私有图片、上海主库和境外Vercel／Blob处理、备份限制与权利请求，不承诺全部数据仅在境内。

## 配置与运维

服务器配置FORMWARD_DOUBAO_ENABLED、FORMWARD_DOUBAO_APP_ID、FORMWARD_DOUBAO_APP_SECRET、FORMWARD_DOUBAO_ORIGIN；AppSecret保存在上海root 0600配置，原BETTER_AUTH_SECRET保持。DOUBAO_OPENAPI_BASE_DOMAIN使用官方正式地址；沙箱与正式login_code不能混用。原生运行态AppID和apiBaseUrl由Manifest生成，真实AppID只在manifest.yaml维护。

官方CLI 0.0.41已获用户批准登录，SDK固定0.4.2。本轮Manifest及运行态Skill已同步，正式19项工具仍normal登录，不使用回环测试的身份替身。开发检查见integrations/doubao/README.md与tests/README.md。

海外网关未重新部署；READY部署`dpl_7LC5LTzjS7zokZa6atCsrHpT5vxa`、网关源码`74754129c3a2c56fc61a6bf579c5f31398cd477e`、实际iad1保持，两别名仍为formward-ten.vercel.app及global.formward.top。后续网关发布必须显式--regions iad1并核对真实回源，不依赖运行日志地区标记。香港TCP失败与美国东部TCP／TLS／HTTP成功的诊断证据保留于先前接入归档。

域名验证文件public/doubao_45g8h0ck.txt的SHA-256为`69022224f241371df358c978cb28384ac663337448e6a939570ac30b7d4cdbe7`。当前公网IP网页不替代已验证request／WebView域名。以后迁国内先验证新域名与完整豆包链路，再切换原生配置和服务；过渡入口与GPT原地址保留，不能承诺全部旧客户端免重新授权。

本次发布保留47项Server Action及原绑定密钥，额外保留335项旧静态资源，配置字节保持，无数据库迁移。上一应用onboarding-polish-20261111保留回退。原临时诊断preload、systemd drop-in与保护绕过令牌已清除，本轮未重新引入。

## 验收与待测边界

606项单元／集成（80个测试文件独立串行）、lint、typecheck、原生4项、Manifest校验、原生本地构建及兼容production build通过。实际Next production双协议验证19工具、单餐／多食物预览、未知／0、网页200和无效凭据拒绝，正式健康写入0。Chrome桌面和390×780实际核对预览、依据及修改入口；未修改确认页样式，不把这些结果当作真实豆包WebView通过。

| 同组虚构样本 | 旧版 | 新版 |
|---|---|---|
| 明确日期、单食物、营养未知 | 参数校验失败，未派发 | 可确认预览，未知保持null |
| 昨日、两份总营养、蛋白质0 | 参数校验失败，未派发 | 日期正确，数值不重复乘算 |
| 多食物、未知与明确0并存 | 参数校验失败，未派发 | 两项均可确认，未知／0区分 |

两组在同一回环虚构账号执行官方模拟器，测试Manifest均采用预授权替身；正式配置仍normal登录。旧版出现tool_call_arguments_invalid；新版均实际调用preview_meal，pending且canConfirm=true，事实及链接匹配，模型回复完成。初轮网络错误、package_label、错误相对日期及多杂项问题留档，修正后最终样本均通过上述业务断言。

CLI 0.0.41即使指定--expect-card none仍报card_binding_missing，因此完整模拟器Verdict未通过；本轮没有结果卡片，不能把3次工具成功称为总体成功率或完整上架验收。云构建成功同样不代表真实手机记餐、最终网页保存或公众准入已通过。

本轮私有证据位于main-current工作区`.codex/doubao-simple-meal-20261111`；先前登录、参数及网关证据位于`.codex/doubao-integration-20261111`。只保存虚构样本、必要兼容材料及脱敏元信息，不公开凭据、真实UID或健康结果。本轮本人手机记餐和网页最终确认待测；公众主体准入、卡片呈现与提审属于后续工作。
