# HTTP API

本目录保存 HTTP 入口。认证由 `auth/` 转交 `src/features/auth`；所有业务接口都需要验证身份并调用相应 feature。入口不直接实现数据库规则。
