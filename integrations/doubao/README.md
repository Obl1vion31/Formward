# Formward 豆包应用插件

此工程负责豆包应用插件的 Manifest、运行态 Skill、自定义登录页与主页。通过 Vercel 自定义域名 `https://global.formward.top` 的独立豆包入口，复用上海 Formward 服务和主库。原 GPT 的 MCP 与 OAuth 地址保持。

## 登录与凭据

真实 AppID 仅在 `manifest.yaml` 的 `app_key` 手工维护，`scripts/sync-runtime.mjs` 从Manifest生成 `src/config/runtime.ts`，`app.config.ts` 与请求共用该公开配置；`pnpm check` 同步并核对，运行时另检查宿主AppID一致。网页采用原有 Formward 邮箱账号登录，不使用手机号、固定验证码或本地 mock 登录。客户端只取得宿主一次性 login_code 和服务端一次性兑换码；长期 access／refresh token 不进入客户端存储。

`src/shared/connection.tsx` 负责明确点击连接、加载 Formward 登录网页、匹配本次回传并按结果返回对话。慢请求期间可取消，迟到结果不能重新打开网页；回报结果与退出分别处理，已回报成功时退出失败只提示手动返回，不再发送失败。所有记录保存仍先生成预览，由用户登录 Formward 网页确认。

## 开发与检查

使用 Node.js 24 与 pnpm，安装依赖后运行 `pnpm check`、`pnpm test`、`pnpm exec dbx check --file manifest.yaml --json` 和 `pnpm exec dbx build local`。本地联调使用 `pnpm exec dbx dev --agent --mcp-endpoint <已启动的测试入口>`。只有服务端地址真实可用并完成联调后才运行测试版本云构建。

应用密钥由服务器的独立配置提供，不写进此工程。`.agents`／`.codex` 技能和 `.dbx` 调试状态、产物、环境文件与日志不提交。平台版本、验证范围及未完成项见仓库 `docs/doubao-onboarding.md`。
