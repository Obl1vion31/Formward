# Formward 豆包应用插件

此工程负责豆包应用插件的 Manifest、运行态 Skill、自定义登录页与主页。通过 Vercel 自定义域名 `https://global.formward.top` 的独立豆包入口，复用上海 Formward 服务和主库。原 GPT 的 MCP 与 OAuth 地址保持。

## 记餐工具

Manifest共21项，和共享MCP逐项一致。preview_meal用于新增单餐，preview_meal_changes用于餐内修改，preview_energy用于全天消耗与实际运动；食材维护、身体、训练和混合预览保留原入口。运行态Skill同步相对日期重试、份量换算、摘要分页与保存状态。变更工具或Skill后需要上传新的测试版本，并在Debugger更新资源；仅发布服务端不会更新手机中的运行态Skill。生产Manifest所有工具继续normal登录，不使用测试fixture的预授权替身。

## 登录与凭据

真实 AppID 仅在 `manifest.yaml` 的 `app_key` 手工维护，`scripts/sync-runtime.mjs` 从Manifest生成 `src/config/runtime.ts`，`app.config.ts` 与请求共用该公开配置；`pnpm check` 同步并核对，运行时另检查宿主AppID一致。网页采用原有 Formward 邮箱账号登录，不使用手机号、固定验证码或本地 mock 登录。客户端只取得宿主一次性 login_code 和服务端一次性兑换码；长期 access／refresh token 不进入客户端存储。

`src/shared/connection.tsx` 负责明确点击连接、加载 Formward 登录网页、匹配本次回传并按结果返回对话。慢请求期间可取消，迟到结果不能重新打开网页；回报结果与退出分别处理，已回报成功时退出失败只提示手动返回，不再发送失败。所有记录保存仍先生成预览，由用户登录 Formward 网页确认。

## 开发与检查

使用 Node.js 24 与 pnpm，安装依赖后运行 `pnpm check`、`pnpm test`、`pnpm exec dbx check --file manifest.yaml --json` 和 `pnpm exec dbx build local`。本地联调使用 `pnpm exec dbx dev --agent --mcp-endpoint <已启动的测试入口>`。只有服务端地址真实可用并完成联调后才运行测试版本云构建。

应用密钥由服务器的独立配置提供，不写进此工程。`.agents`／`.codex` 技能和 `.dbx` 调试状态、产物、环境文件与日志不提交。平台版本、验证范围及未完成项见仓库 `docs/doubao-onboarding.md`。

插件启动、登录页创建、宿主凭证、请求、网页加载及结果回传有固定阶段诊断，服务端仅记录受限的客户端自报，不用作授权事实。登录页销毁与React组件卸载分开处理，失败原因在原生错误框中保留到点击返回，再通知宿主，方便定位“点击后消失”。

记餐默认估算热量及三项宏量，缺少关键信息才追问。Skill的共用营养段落及餐次Manifest描述由仓库scripts/sync-ai-nutrition.mjs生成，与GPT／HTTP使用同一JSON规则；先同步再check／构建。实际数量、餐次、已有值和网页确认保持，不把营养估算当作食量估算同意。
