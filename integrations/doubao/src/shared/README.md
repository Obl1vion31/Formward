# 客户端共享连接

`connection.tsx` 与 `connection.scss` 负责连接动作、真实忙碌与错误、受控 WebView 及返回。`login-result.ts` 保证重复回传、页面销毁和失败并发只产生一致的结果。认证请求只发送给已验证的 Formward 服务，不记录凭据。
