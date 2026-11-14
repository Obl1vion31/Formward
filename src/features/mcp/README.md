# MCP

server.ts为每个已验证请求创建无状态SDK服务，MCP版本2.0.0，公开18项工具。原生MCP与豆包共享注册、参数、权限及字段解释；新旧协议均支持，但旧业务工具名已停用，返回刷新目录提示，不隐藏转接。

连接及查询：authorize_formward、get_profile、query_measurements、query_meals、query_energy、query_training、search_foods、search_exercises。连接成功不代表全部权限；身体只查实测，饮食记全与餐次保存分开，消耗联合统计需饮食读权限，模板、计划和实际训练分开。

创建预览：preview_measurements、preview_meals、preview_meal_changes、preview_foods、preview_energy、preview_training、preview_record_bundle。专用入口各管单一功能；只有至少两类功能动作才能使用组合入口。单纯多餐、训练模板加排期、消耗加运动分别留在专用入口。所有新预览在records/ai-previews.ts规范化并复用submitRecordOperation，按当前账号和稳定任务请求编号统一防重；不按相似内容全局合并。

get_preview统一读取新旧预览、最新版本、待补项和逐项保存状态。update_preview只修改原授权且有效的待审草稿，按key提交局部变化或明确追加漏项，补照片沿原预览；历史对象、原payload及首次请求摘要保持。新旧确认链接继续可用，正式保存仍只有本人网页登录确认。

import_meal_images只导入本人附件，最多8张、每张20 MiB，JPEG／PNG／WebP；导入、关联预览和正式保存分别表达。部分失败保留成功附件。AI不提供整条或批量删除、恢复或代确认工具；未知不是0。

工具用途目录由records/ai-tool-catalog.json维护，注册、日志、豆包Manifest、合同导出和评测按同一清单核对。中文字段解释由各业务字典维护，成功结果文本与structuredContent一致。旧HTTP路径及其业务函数保留，不再作为重复MCP工具暴露。

contract-export.ts仅在内存发现定义与工作说明，不执行业务或读取数据库，供隔离评测冻结合同。受控站内聊天使用目录＋按需加载；外部GPT／豆包的调度由平台负责，不能用站内结果冒充外部加载策略验收。日志不记录凭据、健康内容或附件地址。
