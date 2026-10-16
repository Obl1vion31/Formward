# MCP

提供公网 MCP 工具和协议适配，复用 auth 的 OAuth 身份与 measurements 的查询、预览和审核规则。

`server.ts` 为每次请求创建无状态 SDK server，兼容当前及 2025 协议；工具仅接收业务参数，账号来自验证后的令牌。写入仅创建预览，不提供确认保存工具。工具说明要求缺来源时先询问实际名称或明确留空，不以 AI 录入渠道、设备未注明或历史来源代填。sourceUnspecifiedConfirmed:true 配合 deviceLabel:null 表示用户明确留空；needsUserInput 非空时说明待补字段，不能声称可以直接保存。

修改工具时同步 AI 接入说明、权限声明和隔离测试；不得在工具中另写健康数据规则或向模型返回凭据。

饮食增加search_foods、query_meals、submit_meal_operation、get_meal_operation，复用meals feature；工具声明meals:read／meals:write，原身体授权不自动扩权。服务版本1.5.0，写入均返回网页登录确认链接，照片分析的杂只包含剩余食物；reference 支持手动合并来源，AI label／composition_table 保留。食材描述保留实际组成、规格、各成分分量及来源／计算／结果，不写录入背景或无关排除清单。

import_meal_images沿用meals:write，顶层files声明openai/fileParams，最多20 MiB，下载并私有保存原图后返回附件ID、status及逐文件failures；部分成功保留成功ID，只重试失败项。日志记录工具名、文件结构和阶段错误，不记录下载地址或健康内容；不直接保存餐次。成功附件仍须提交到对应餐次预览，已有餐次用id/version更新；预览含图时说明待网页确认，用户确认后查询最新审核／餐次再报告关联状态。照片的photoReview未核对或questions未解决时返回needsUserInput。search_foods返回兼容的空presets；query_meals可传timezone取得日期上下文。

search_foods 与 HTTP 食材查询共用 queryFoods，在实时结果附 foodLibraryRules。新写入的食材说明含个人餐次背景／泛化提醒时，feature 在创建预览前返回 food_description；修正后可用原 operationId 重试。工具描述修改后按官方自定义 MCP 流程刷新连接并开新对话，不把刷新视为旧数据清理。

食材可选 category:meal／ingredient，新条目省略为 ingredient，省略更新保留原分类；查询返回分类。餐项查询返回稳定 id，编辑时以 originalItemId 引用同一餐次／版本原项。食材已永久删除的旧餐项不传 foodId 或 nutrition，服务端沿用原快照按同单位 quantity 换算；不能将已删食材用于新餐。永久删除只在网页最近删除提供，不新增 MCP 工具或 HTTP 写接口。
