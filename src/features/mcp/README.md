# MCP

server.ts 为每次请求创建无状态SDK server，兼容当前及2025协议。服务版本1.13.0，共17个工具；账号来自验证后的OAuth令牌，写入只创建预览，没有确认保存工具。网页、HTTP与MCP调用同一feature，不在适配层重写业务规则。

authorize_formward检查并申请身体、饮食／食材、消耗、训练四类查询与提交预览权限，只返回连接状态，不读取健康内容或创建预览。OAuth同意仍由用户完成；只读连接补查询权限时只申请读取。旧连接不因刷新定义或授权请求自动扩权。

身体使用query_measurements、submit_measurement_operation、get_measurement_operation；饮食使用search_foods、query_meals、import_meal_images、submit_meal_operation、get_meal_operation；消耗使用query_energy；统一批次使用submit_record_operation／get_record_operation；get_profile只识别当前账号。训练使用search_exercises、query_training、submit_training_operation、get_training_operation，独立training:read／training:write。

训练支持查询统一动作目录、本人模板／计划／实际训练，新增或修改模板与多日排期；新模板可用templateRef引用同批key，修改必须带id/version。统一审核存储原提交授权，24小时预览过期或原授权撤销会阻止确认。返回confirmationUrl须完整交给用户，confirmed才表示保存，计划与已完成训练分开，不自动估算热量。

身体缺来源先问实际设备／应用名称或是否明确留空；sourceUnspecifiedConfirmed:true配合deviceLabel:null才表示用户确认留空，不能用AI渠道或历史来源代填。needsUserInput非空时说明待补项。未知值为null，所有正式保存均须网页登录确认；AI只新增／修改，不提供整条或批量删除恢复。

食材返回分类、稳定id/version、规格、来源和foodLibraryRules。说明保留实际组成、分量及来源／计算／结果，不写个人餐次背景；用户明确要求入库才另建食材。已有餐项用originalItemId保留身份与快照，已永久删除食材不得用于新餐。普通记餐只创建餐次。

import_meal_images沿用meals:write，顶层files声明openai/fileParams，最多8张、每张20 MiB。原图私有保存，返回附件ID、status和逐文件failures；部分成功只重试失败项。成功附件还须关联到待网页确认的餐次或食材。照片不要求五项勾选，缺图可保存文字；只询问真实缺失、重复餐或包含关系。

统一提交支持最多100项、64 KiB，依内容检查measurements／meals／energy／training权限。修改与取消只更新草稿，底部统一确认后才保存。消耗区分分开／总数、活动累计／手填合计、纯运动／含期间静息以及included／additional；不提供退役的日常默认值或公式动作。

日志只记工具名、文件结构和阶段错误，不记录凭据、下载地址或健康内容。修改工具须同步[AI接入](../../../docs/ai-api.md)、OAuth权限声明、OpenAPI和隔离测试；客户端需要刷新定义，新scope仍需用户同意。
