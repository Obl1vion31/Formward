# Better Auth 入口

`route.ts` 将 GET 与 POST 请求交给同一 Better Auth 实例。Next.js 使用 Node.js runtime；cookie、来源检查、密码校验和登录限流由认证 feature 管理。
