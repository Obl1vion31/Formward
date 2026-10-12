# OAuth 网页授权

`login/` 复用现有账号登录并恢复签名授权请求；`consent/` 显示客户端、账号与权限，用户明确允许或拒绝。

页面只组织身份与界面，签名验证和客户端规则在 auth feature；不得将任意 returnTo 当成授权请求。页面设置 no-referrer、不缓存身份数据。
