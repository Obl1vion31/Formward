# HTTP API

本目录保存 HTTP 入口。认证由 `auth/` 转交 `src/features/auth`；所有业务接口都需要验证身份并调用相应 feature。入口不直接实现数据库规则。

`v1/` 提供身体记录 Bearer API 与公开 OpenAPI；查询、提交预览和操作状态共用 measurements feature。网页 cookie 不能代替令牌，接口没有确认保存端点。详见 [AI 接入](../../../docs/ai-api.md)。
