# 站内聊天入口

GET读取本人当前会话、最近5条／50条范围内游标历史、模型目录和共享日额度。POST发送、重试或继续，并通过SSE返回真实消息、处理状态及用量。入口只做协议、来源、有效会话和试用资格校验，业务由assistant feature处理。

仅FORMWARD_CHAT_ENABLED=1、指定账号ID且当前有效owner可用。模型地址、Key、计价和账号不能由浏览器指定；所有响应private/no-store。没有正式健康确认保存接口。
