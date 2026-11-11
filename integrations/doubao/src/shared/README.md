# 客户端共享连接

`connection.tsx` 与 `connection.scss` 负责连接动作、真实忙碌与错误、受控 WebView 及返回。`login-result.ts` 保证重复回传、页面销毁和失败并发只产生一致的结果。认证请求只发送给已验证的 Formward 服务，不记录凭据。

登录取消使用宿主useDestroy，React子树卸载只清理迟到响应，不因重挂载向宿主补发失败。失败先显示按阶段整理的原生错误框，用户点击“返回对话”后再通知宿主结束；宿主不支持错误框时降级提示。login-errors.ts整理固定文案及允许的数值错误码；login-diagnostics.ts有界上报固定阶段，诊断失败不影响登录，不读取身份或健康内容。
