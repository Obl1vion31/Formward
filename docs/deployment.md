# 公网 HTTPS 部署

Formward 使用 Vercel 托管 Next.js，继续连接现有 Neon PostgreSQL。正式域名为 [https://formward-ten.vercel.app](https://formward-ten.vercel.app)，公开协议位于 [OpenAPI](https://formward-ten.vercel.app/api/v1/openapi.json)，AI API 基础地址为 `https://formward-ten.vercel.app/api/v1`。

网页通过内部账号登录，AI 接口通过独立 Bearer 令牌鉴权。公开协议不含健康数据或令牌。AI 提交只生成预览，保存仍由用户在网页登录确认；完整格式见 [AI 接入](ai-api.md)。

## 平台配置

- Vercel 项目名称 `formward`，Framework Preset 为 Next.js，Root Directory 为仓库根目录。
- Node.js 使用 24.x；`ENABLE_EXPERIMENTAL_COREPACK=1` 让平台使用 package.json 指定的 pnpm 9.15.9。
- `vercel.json` 固定安装命令 `pnpm install --frozen-lockfile`、构建命令 `pnpm build`、函数区域 `cle1`。现有 Neon 位于 us-east-2，与此区域一致。
- 使用 Vercel Hobby 个人计划和平台域名，HTTPS 证书由平台管理。当前通过 CLI 手动发布，没有关联 Git 自动部署。
- Deployment Protection 使用 Standard Protection：保护预览和单次部署地址，正式域名保持可访问。外部 AI 使用上述正式域名，不能使用受平台登录保护的预览链接。

## 生产环境变量

在 Vercel 项目的 Environment Variables 中仅为 Production 配置：

| 变量 | 内容 |
| --- | --- |
| `DATABASE_URL` | 现有 Neon pooler 连接串，保留 TLS 参数，保存为 Secret |
| `BETTER_AUTH_SECRET` | 现有随机认证 secret，保存为 Secret |
| `BETTER_AUTH_URL` | `https://formward-ten.vercel.app` |
| `FORMWARD_TIMEZONE` | `Asia/Shanghai` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` |

不把真实数据库配置复制到 Preview。生产变量不使用 NEXT_PUBLIC_ 前缀；不上传环境文件，也不运行会覆盖本机 `.env.local` 的 env pull。新增或修改平台变量后需要重新部署。

Vercel 保留 TZ 变量，因此使用应用级 FORMWARD_TIMEZONE 定义 HTTP API 的服务默认时区。请求头 X-Formward-Timezone 优先，未提供时读取配置地区在请求发生时的准确偏移，未配置才读取系统偏移；地区时区仍按当次夏令时换算。网页新记录和 HTTP 助手继续采用设备当次时区，其他 AI 也可在候选中显式提供 timezone。

公网审核链接和 OpenAPI 的 servers.url 使用 BETTER_AUTH_URL 中配置的 HTTPS 根地址，忽略代理内部 HTTP 地址和请求 Host。本机仍兼容 localhost、127.0.0.1 和 IPv6 回环地址。

登录限流通过 Better Auth 的数据库存储维护，`rate_limits` 保存来源／入口的唯一键、计数和最后请求毫秒时间。多个实例共享计数，登录仍限制为每分钟五次；过期计数由认证存储清理。此表是登录前的服务运行状态，不保存健康记录。

## 发布与更新

首次在交互终端运行 `vercel login`，在浏览器完成设备授权，然后运行 `vercel link --yes --project formward`。本机 `.vercel/` 是工具生成的项目关联信息，被 Git 忽略。CLI 安装在本机工具目录或 `/tmp`，不加入应用依赖。

发布前运行 lint、typecheck、unit/integration test 和 production build，以及受影响的认证／AI 浏览器检查。已有 3000 开发服务时，在私有临时源码副本中构建和运行浏览器检查，使用独立端口和虚构数据库，不覆盖正在运行的 `.next`。

有新增 migration 时，先保存私有数据库备份，再执行已纳入版本控制的 migration，随后核对既有表和字段。构建命令不执行 migration；数据库演进见 [数据库字典](database.md)。限流表由 `0010_shared_auth_rate_limits.sql` 创建。跨区域备份连接较慢时可为 Node 加 `--network-family-autoselection-attempt-timeout=1000`，与应用连接入口的单地址尝试时限一致。

在关联项目的仓库根目录运行：

```bash
vercel deploy --prod
```

`.vercelignore` 排除整个 data、环境文件、密钥文件、Git 元数据、本机工具和构建缓存，私有导入文件与数据库备份不会进入远程构建。正式地址只由 public 静态资源和 Next.js 页面／API 提供。

## 上线验收与故障处理

正式域名已通过 HTTP 转 HTTPS、首页和 OpenAPI、未登录重定向、缺失／无效令牌 401、无会话响应与私有路径 404 检查。1440×900／390×844 公网浏览器确认素材就绪、字体与视频加载、键盘进入登录、无横向溢出和无客户端异常。上线检查期间 Runtime Logs 无 error。完整认证、录入、AI 与加载回归在隔离虚构数据库执行；真实账号登录与定制 GPT 的授权调用由用户完成。

手机媒体初始化的公网回归覆盖当前帧、play 才解码、手势限制与超时恢复、视频请求挂起、下载失败、WebGL 不可用和桌面静态概念词；成功恢复时能绘制视频中间帧，失败仍可提交登录并重试。测试认证请求在浏览器中拦截，不发送到真实数据库。用户已确认手机完整转身可见且流畅；公网桌面／手机首、中、末帧检查确认近黑背景透明、人物亮部保留，但手机实机仍有一大圈黄色光晕，视觉问题未解决。当前手机仍为上滑进入，下一步需改为手指向下滑或单次点击，接手要求见 [项目交接](../handoff.md)；系统减少动态效果开启时保持首尾静态过渡。

- 正式域名的首页和图片／字体／视频正常加载，证书有效；OpenAPI 返回完整正式 API 地址。
- 未登录访问 dashboard 重定向到首页；没有令牌、无效或撤销令牌访问数据 API 返回 401，不接受网页登录 cookie 替代。
- 真实账号登录由用户核对；录入、审核、重复请求和跨账号测试在隔离虚构数据库执行，不向真实账号写测试健康数据。
- 在 Vercel Runtime Logs 中检查连接失败和服务错误，不打印连接串、令牌、密码或健康记录。通过平台 Usage 查看资源使用量。

更新失败时正式域名继续指向上一成功版本；已发布版本出现问题时在平台回滚到先前验证过的部署。新增限流表可以保留，不通过回滚业务代码删除已有数据或修改历史 migration。首次发布没有旧版本可回滚时，修复配置或构建后重新发布。

部署完成后，用户可在“AI 接入”创建可撤销令牌，现有 HTTP API 与 OpenAPI 供外部客户端或后续适配复用。用户反馈当前界面没有 GPT Actions 模式，下一步优先插件／MCP，先核对实际入口支持的连接方式和身份验证要求；当前 MCP 服务尚未实现。普通聊天仅获得网站链接不会自动建立接口授权。
