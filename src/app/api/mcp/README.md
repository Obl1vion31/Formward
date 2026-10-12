# MCP 入口

`POST /api/mcp` 验证 OAuth Bearer 令牌并交给 mcp feature；GET／DELETE 不提供持久协议会话。标准发现入口在网站的 `.well-known` 下。

此处不实现查询、写入或授权规则，维护时同步隔离协议与认证测试。
