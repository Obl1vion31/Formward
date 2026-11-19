# 站内聊天入口

GET读取本人会话、分页消息、模型及共享额度。POST在有效会话、来源、资格和参数检查后持久化任务；SSE仅订阅数据库进度，不执行模型，不因连接取消而停止任务。独立worker复用assistant feature执行，恢复前台读取原任务。GET runId 只订阅本人当前对话的运行。提供 X-Formward-Chat-Stream: delta-1 时，返回初末快照和正文分片、过程、开始时间增量；旧请求继续读快照。分批复用原错误消息和服务端已绑定的剩余附件。

模型Key、地址、账号和任务领取信息不能由浏览器指定。响应private/no-store，订阅持续核对会话与归属；没有正式健康确认保存入口。

GET增加view=history及严格JSON cursor读取本人20条会话，conversationId只读查看本人chat用途历史；饮食任务不混入历史。读取不激活旧会话、不调用模型、不创建收费任务。
