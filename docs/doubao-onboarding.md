# 豆包应用插件接入

## 当前可用范围

Formward豆包应用AppID为`db_app_9m6xflq`，本人体验白名单已生效且永久有效；真实UID只在平台配置，不进入代码、文档或公开截图。`https://global.formward.top`的request与WebView域名均已验证生效。当前为本人测试，未提审正式开放。

测试版 **0.0.1-dev.20261111.2** 已云构建succeeded，Manifest、运行态Skill、原生源码及业务声明已上传，21项工具与服务端一致；此前版本保留兼容。本人既有登录交换、WebView回传、换码绑定、连接检查及身体查询已通过。新工具真实手机使用仍待更新Debugger资源后复测。

当前上海应用为dual-entry-4c254474-doubao-refresh-recovery-20261111，源码4c25447419444b1d48a5ce36f82c0c2e573a8763，BUILD_ID 2Y6jvkUZm_6JgoWpLMLoi，目录doubao-refresh-recovery-20261111。原OAuth issuer／resource、账号和授权保持；MCP为1.16.0、共21项工具，旧18项仍兼容。

## 常用记餐、修改与消耗

GPT与豆包共享21项工具。preview_meal用于新增单餐，模型提供operationId、date、mealType、foods；自由食物营养平铺，默认本次总量不重复乘数量，每份／每参考量与明确kJ由服务器换算。已提供标签数值时，服务器可忠实生成转录；来源未知不丢已知数值，估算仍须basis，不编造食量或来源。

preview_meal_changes只发送改动，服务器保留其余食物、附件和历史快照。保存后的修改带mealId/version生成预览；待确认修改带previewId/revision及必要的key更新原链接，原授权和有效期须匹配；同请求重试不重复添加食物。不能清空整餐，正式保存仍须网页登录确认。

preview_energy处理全天总数／分项与实际运动，明确0保留。新增时可从提供的数值推导输入模式；没有手填活动合计时沿用运动累计，不补人工0。来源总数与included运动不重复加，未知包含关系交由网页核对。跨领域仍用submit_record_operation保持一个审核链接；食材维护和训练沿用原工具。

查询可选summary／details及相对区间，显式返回page.hasMore／nextFrom；身体七日统计标明日期锚点，不混成当前最新读数。所有相对日期由服务器按timezone解析；重试保持原operationId及全部原参数，包括today／yesterday文本，跨零点仍固定首次日期。完整场景、字段、例子见[AI工具调用规则](ai-tool-contracts.md)。

新工具只创建或修改预览，不能宣称已经保存。canConfirm=false或行内error须先修正，不能让用户忽略错误；未知保持null，明确0继续有效。旧18项继续兼容，总工具定义量有所增加，不以体积承诺省token或模型成功率。

## 本人手机复测

打开[新测试版本详情](https://developer.doubao.com/agentic_service/db_app_9m6xflq/versions/0.0.1-dev.20261111.2)，点击“调试二维码”。平台当前提示使用豆包15.2.0或以上，通过“设置 → ··· → 应用插件 Debugger”扫码更新资源，再进入新的Formward调试对话，重发原来的昨天午餐内容。该二维码是已上传云构建版本，不是本地dbx device授权。

既有Formward连接可沿用；若宿主提示登录失效，再按正常流程连接。更新资源与重新授权是两件事，不要求重建现有GPT连接。平台[UGC Bot预览对话](https://inhouse.doubao.com/bot/2xgttdEs)可按本人App提示进入；主对话扫码仍受平台实验配置限制，白名单不代表全面开放。

核对生成链接、明确日期、食物、食量、未知／0及来源，再打开国服网页确认。生成预览、网页打开和正式保存分别记录结果。不要索取或在聊天里传递密码、临时登录码或令牌。

## 登录续期与重新连接

平台持有的刷新凭据可能失效、被消费或撤销。服务端刷新失败须按[官方登录协议](https://open.doubao.com/apps-plugin/docs/backend-development/login)返回code=50401及精确msg="token expired"，由宿主重新拉起登录；本接口已发布HTTP200承载该业务错误，错误应用、无效访问Token及服务故障仍区分状态，不绕过原鉴权。服务器不恢复或延长旧凭据；用户正常重新连接后才会得到新凭据。重新扫码更新资源不等于重新登录。

30502的公开官方对应说明未查到，不仅凭错误码判断模型或记餐故障。本人报告的连接失败已在服务器关联到2026-11-11 13:06及13:08的六次refresh-token／401，当时没有记餐或查询调用；本轮修正通用401未按宿主协议通知重新登录的问题。旧刷新凭据最初失效的原因未确证；不能由此认定豆包模型能力或某个健康接口异常。629项测试、实际Next正常旋转／失效信号及公网恢复码已通过，真机重新连接仍待本人反馈。

2026-11-11 13:28真机反馈登录引导卡按钮转圈；13:28至13:33的九次请求仍停留refresh-token，已返回精确50401恢复信号，未收到login／authorize／fetch-token或业务调用。原生源码未变，本地typecheck与build local通过；不能据此认定真机登录通过。当前先退出旧卡片并用新请求重建登录，继续核对宿主到原生登录页这一段。

## 链路与授权

豆包App → Vercel已验证域名 → 签名回源 → 上海现有业务与主库。`integrations/doubao`维护Manifest、运行态Skill、原生首页和登录页；`src/features/doubao`维护身份与协议适配。21项工具复用现有MCP工厂及业务feature，不新增数据库、健康计算、HTTP v1或网页确认端点。

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

官方CLI 0.0.41已获用户批准登录，SDK固定0.4.2。本轮Manifest及运行态Skill已同步，正式配置的21项工具仍normal登录，不使用回环测试的身份替身。开发检查见integrations/doubao/README.md与tests/README.md。

海外网关未重新部署；READY部署`dpl_7LC5LTzjS7zokZa6atCsrHpT5vxa`、网关源码`74754129c3a2c56fc61a6bf579c5f31398cd477e`、实际iad1保持，两别名仍为formward-ten.vercel.app及global.formward.top。后续网关发布必须显式--regions iad1并核对真实回源，不依赖运行日志地区标记。香港TCP失败与美国东部TCP／TLS／HTTP成功的诊断证据保留于先前接入归档。

域名验证文件public/doubao_45g8h0ck.txt的SHA-256为`69022224f241371df358c978cb28384ac663337448e6a939570ac30b7d4cdbe7`。当前公网IP网页不替代已验证request／WebView域名。以后迁国内先验证新域名与完整豆包链路，再切换原生配置和服务；过渡入口与GPT原地址保留，不能承诺全部旧客户端免重新授权。

本次发布保留47项Server Action及原绑定密钥，额外保留342项旧静态资源，配置字节保持，无数据库迁移。上一应用ai-tool-clarity-final-20261111保留回退。原诊断preload、systemd drop-in与保护绕过令牌保持清除。

## 验收与待测边界

626项单元／集成（81个原测试文件独立串行）、lint、typecheck及干净兼容production build通过；原生4项、Manifest校验、本地构建及测试版云构建通过。实际Next production两种协议验证21工具、三个常用预览、四类有界查询、状态查询、非法参数和无效凭据拒绝；确认前正式事实写入0。Chrome实际核对桌面浅色与390×780深色，打开／关闭原编辑器、焦点恢复、局部备注保留，并点击网页确认保存1条虚构餐次，再查到正确日期、600kcal、蛋白质0和其余未知。未改界面样式，不把这些当作真实豆包WebView通过。

三组官方豆包模型实测：每份300×2为600；原预览改3份为900；静息1800＋活动0为1800。最终各次工具返回pending且canConfirm=true，回复包含真实确认链接，无tool_call_arguments_invalid；正式健康事实未写入。第一轮捕获的漏转录、缺模式及错误回复保留私有记录，服务器自动转录／推导与模型错误处理规则修正后复测。CLI 0.0.41仍因card_binding_missing给完整Verdict未通过，不把工具成功称为整个模拟器通过或总体成功率。

本机没有OpenAI API评测配置，真实GPT首轮完成率对照未执行；真实GPT连接发布前后get_profile均成功且同一账号，不能以接口回归替代真实模型效果。本人豆包既有连接与身体查询沿用已确认结果，新测试版的物理手机记餐、局部修改和消耗仍待本人更新Debugger后复测。
