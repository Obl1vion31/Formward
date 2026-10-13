# MCP

提供公网 MCP 工具和协议适配，复用 auth 的 OAuth 身份与 measurements 的查询、预览和审核规则。

`server.ts` 为每次请求创建无状态 SDK server，兼容当前及 2025 协议；工具仅接收业务参数，账号来自验证后的令牌。写入仅创建预览，不提供确认保存工具。工具说明要求缺来源时先询问实际名称或明确留空，不以 AI 录入渠道、设备未注明或历史来源代填。sourceUnspecifiedConfirmed:true 配合 deviceLabel:null 表示用户明确留空；needsUserInput 非空时说明待补字段，不能声称可以直接保存。

修改工具时同步 AI 接入说明、权限声明和隔离测试；不得在工具中另写健康数据规则或向模型返回凭据。

饮食增加search_foods、query_meals、submit_meal_operation、get_meal_operation，复用meals feature；工具声明meals:read／meals:write，原身体授权不自动扩权。服务版本1.1.0，写入均返回网页登录确认链接，照片分析的杂只包含剩余食物。
