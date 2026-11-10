# 豆包接入

负责豆包应用插件的身份交换、账号绑定、短期授权码、令牌协议和 MCP 适配。业务查询和提交预览复用现有 MCP 与业务 feature，不复制健康计算。

豆包使用独立客户端及入口。现有 GPT 的 OAuth issuer、resource、客户端和凭据保持。绑定和令牌复用已有 OAuth 表，授权码一次性消费、刷新轮换、账号停用及网页撤销继续由既有认证实现校验。

AppSecret 仅用于服务端向豆包换取已验证的 OpenID，不传到 Vercel 静态文件、前端、Skill 或日志。数据库只保存用于匹配的 OpenID 摘要，不收集豆包手机号、昵称或头像。上海独立入口及平台测试版已启用；本人手机身份交换、网页授权回传和平台换码绑定已验证，查询及网页确认的实际范围见 `docs/doubao-onboarding.md`。

新增单餐使用豆包专用的`preview_meal`。根参数仅operationId、date、mealType、foods必填，食物营养平铺，不接受多种动作／嵌套营养结构；未知字段省略并映射为null，明确0和原精度保留。自由项采用本次总量，食材引用仅使用搜索返回的id／version、食量和单位，换算、归属、版本、预览幂等及网页登录确认复用饮食feature。旧18项工具保留，新入口只在豆包注册，GPT工具集保持18项。

`meal-preview.ts`只兼容明确同义的包装标签名称与同单位营养后缀，不推测来源、不换算kg／kJ、不补造营养。估算数值须有basis；食量未知或接受估算必须显式表达。其余字段仍经过原严格schema和业务校验，错误指向可修正的字段。

豆包工具发现把整数`exclusiveMinimum:x`等价转换为`minimum:floor(x)+1`，兼容平台解析器；不改变原schema、服务器校验或GPT输出。该规则须在两种协议的实际HTTP测试中检查。

MCP同时支持现代 `server/discover` 与旧版发现，定义可匿名读取，所有工具执行仍需完整凭据与归属检查。协议兼容测试必须显式覆盖SDK自动协商模式，不能只用默认旧协议客户端替代。

认证适配从已按128 KiB上限解析的JSON、原URL和方法构造普通Request，移除原流的长度／分块头并保留取消信号，不直接复制Next框架代理请求的私有状态。JWT、OpenID摘要、当前绑定、账号归属及权限检查保持；`oauth.test.ts`用框架代理请求和真实OAuth覆盖新旧协议查询与无效凭据拒绝，发布前另验实际Next production入口。

豆包会在工具业务参数内附加平台上下文。适配层仅移除官方文档中的`from_mcp_call`与`_miniapp_permitted_data`，不读取或保存其数据，也不用于身份判断；其余未知字段和非法业务参数仍按原schema拒绝。日志只记录已移除的固定字段名，不记录原参数或值；现有GPT入口和工具schema保持。依据见[系统权限服务端协议](https://open.doubao.com/apps-plugin/docs/backend-development/system-permissions)。

`callback.tsx` 保留用户同意／拒绝的事实，将准备、回传、超时、SDK失败及已通知分别显示。SDK失败提供整页重新加载，回传失败才重发消息；普通浏览器直接提示从豆包App重新发起。`return-bridge.ts` 只发送一次调用所需消息，8秒超时后不因迟到完成改写结果，不向用户透传SDK内部错误。
