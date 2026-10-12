# Formward 项目交接

更新日期：2026-10-12。仓库：/home/obl1vion/projects/Formward；分支：main；远程：[Obl1vion31/Formward](https://github.com/Obl1vion31/Formward)。

## 当前完成范围

MCP + OAuth 与手机调整已在仓库实现，MCP 地址为 `https://formward-ten.vercel.app/api/mcp`。用户确认的入口是 ChatGPT「插件 → 添加自定义 MCP」，采用 OAuth；手机采用点击进入登录和顶部返回按钮，曲线默认 7D，桌面保持 30D。

- MCP 提供 get_profile、query_measurements、submit_measurement_operation、get_measurement_operation，复用既有查询、预览、网页确认、归属与审计。不提供直接确认保存工具。
- OAuth Provider 支持授权码 + S256 PKCE、CIMD／DCR、1 小时访问令牌、轮换刷新及最多 30 天账号连接。签名、issuer、audience、期限、连接／同意／权限全部校验；撤销立即拒绝访问、续期和旧预览。刷新沿用稳定连接，重新授权不恢复旧预览。手动 HTTP 令牌保持兼容。
- `/oauth/login` 与 `/oauth/consent` 提供登录、已有会话继续、明确允许或拒绝。`/dashboard/ai` 提供地址复制、连接列表与撤销，继续管理原令牌和身体操作。
- 手机不加载转身视频，仅使用原始 1／12／13 PNG；首屏提示点击，立即到登录尾帧。纯石墨背景、normal 合成去掉彩色舞台光影。登录后点击背景或滑动不返回，顶部返回关闭键盘并保留输入，认证时禁用。桌面正倒放和认证最终动画保留。
- 手机／触屏横屏默认 7D，桌面默认 30D；用户手动切换后跨视口和数据刷新保持选择。

## 发布状态与接手顺序

正式网站为 [Formward](https://formward-ten.vercel.app)，使用现有 Vercel Hobby／Neon、原内部账号、Node.js 24 和函数 cle1。通过 CLI 手动发布，Git 推送不会自动部署。

MCP 与手机新版本已发布，当前部署为 dpl_AGcvAbavcwhgWppttCEGS6EMmayA。0011_mcp_oauth.sql 已在真实数据库执行，旧 12 张表全部旧字段和值保持，私有迁移前后备份和核对报告已保存。HTTPS discovery／PKCE／CIMD／JWKS、401 challenge、私有路径及桌面／手机／320px／触屏横屏／减少动态效果均通过，无客户端异常；Runtime Logs 没有 error 记录。用户可在 ChatGPT 自定义 MCP 填正式 URL 和 OAuth、登录并授权，检查查询和预览确认，以及 iPhone／微信观感；SDK 与模拟手机检查不等同于真实客户端验收。

0011 新增 9 张 OAuth／JWKS 表，schema 总计 21 张；measurement_operations 新增 oauth_connection_id，token_id 可空且恰有一个凭据非空。测量主表仍为 30 列。0011 及更早 migration 已共享，不修改。生产 secret 只保存在平台与本地私有配置，不执行覆盖 .env.local 的 env pull；data 和环境文件不上传。

## 数据与界面边界

所有 AI 写入先预览、经网页登录明确确认。批量最多 100 条／64 KiB，预览 15 分钟；原始请求不可变，单行可修改／确认／取消，整批事务保存剩余有效行。审核 revision、健康快照和发起凭据保护写入，重复请求／确认幂等。每次新记录采用系统时区，界面提供整数 GMT 选择，历史修改省略时区保持原值；未知值为空，不猜来源。

全站真实等待超过 200ms 显示虚化背景与动作提示，失败保留输入。记录表最近 10 个日历日、完整历史每批 50 日期；四项可独立录入与估算，晨间固定空腹，晚间非空腹。来源历史、维护、冻结初始化与准确时间规则见 [身体记录](docs/measurements.md)、[数据库字典](docs/database.md)；私有备份、报告和原文件保留，不对真实账号写测试健康数据。

## 已确认规则

- 日期为 7D／30D／90D／全部／自定义，默认截至记录、已保存日期及浏览器当地今天中最晚日：桌面 30D，手机／触屏 7D；手动选择保持。自定义校验日期，长区间只生成少量刻度，单日居中。
- 当前值与 7 日摘要仅统计真实、已选定的空腹代表记录，独立于图表历史区间及估计开关。窗口包含截止日和前 6 天；首末差不足两天留空，均值按实际有值日期并显示实测覆盖天数；体脂变化用百分点。
- 真实性与录入入口分开：recordKind 为 observed／estimated；entryChannel 为 api／manual／development_backend。历史实测标“开发后台加入”，估计标“系统趋势估计”。原始采集方式、导入批次和执行者审计保留；AI 代执行不把用户提供的秤读数变成估计。
- 实测设备来源按用户提供信息标“普通蓝牙体重秤-OKOK”；品牌、型号和外部同步系统未知，不编造。估计不标为秤测量。
- 准确实测时间用 measuredAt 校验并保存；可确认原占位／日期时段时间，原始输入保留并写前后审计。未知时间为 day_period，显式授权占位为 assumed，两者 UTC 为空。最新晨间准确时间已确认，凌晨实测按测量地当地时间归前一日晚间。
- 体重与体脂独立；正常 morning-baseline-v3 和一次性 historical-initialization-v1 分开，按真实晨间空腹趋势和真实同日晨晚差补缺，不加入饮食、热量、水分或运动变量。
- 正常模式每个目标日只取其此前 28 天真实数据，按测量记录日期判断先后；差值至少 3 组真实同日配对取中位数，允许负值。晨间线性趋势取最近最多 7 个晨间日，至少 3 日且距最近晨间不超过 7 天。样本不足、条件不明、未解决候选或无效结果留空；估计和未来实测不入正常模型。只有晚间但配对不足时，新增符合门槛的晨间趋势备用并注明原因。
- 同日有晨间实测则加典型差值推晚间；只有晚间实测则减差值反推晨间；双缺测先拟合晨间再推晚间。趋势足够而配对不足时仅补晨间。保留两位小数、明确估计标签与依据，不计算或展示预测区间。
- 实测与估计按指标优先，可同时展示真实体重与估计体脂。相同真实体重可补录原来为空的体脂，已知真实值不同仍拒绝覆盖。冻结范围外实测新增、导入、补录、恢复和条件修正只刷新当天；初始化冻结范围内仅替代对应时段非空指标，其他指标及另一时段保持；更晚日期的普通新增不改历史估计。估计不参与实测摘要、晨晚差或未来热量关联。
- 用户确认一次性初始化 2026-09-09 至 10-06：全范围真实配对中位差，相邻晨间线性插值；边界在目标前后 28 天内选最近 3 个晨间回归，最近实测距目标不超过 7 天，允许向前外推。初始化可用已存在的后续实测，估计不回灌。12 条旧估计软删除、27 条初始化估计有效，范围完全冻结，空缺也不再自动补。每账号只能完成一次，重复返回原报告；普通补全跳过冻结范围，重建／恢复旧估计不得覆盖它。
- 晚间全部非空腹，来源 evening_rule；白天空腹必须明确确认。按当地钟点，00:00–05:59 归前一天晚间、06:00–17:59 当天白天、18:00 起当天晚间。原始当地时间、当次时区及唯一记录日期分别保留，实际发生日期从来源时间读取，旅行不重新分类旧记录。
- 图、表、摘要共用代表选择，查看候选不修改代表；持久代表选择待实现。关闭晚间只影响图；关闭估计影响图和最近记录，日期 Inspector 与完整历史仍可分别查看实测和估计。未补全缺口为极淡同色点线，未解决候选处断开；晨晚差仅显示真实同日、条件明确的配对，其余留空。
- 当前重复实测组按用户授权保留较早一条，其余软删除；不在未来导入或页面读取时自动清理。来源修正和历史重建在显式授权维护时执行；页面读取不生成估计。

## 验证与运行

lint、typecheck、191 项单元／集成测试、结构检查与本地／Vercel production build 已通过，覆盖完整 OAuth HTTP 与当前／2025 SDK、签名请求、错误 PKCE／issuer／audience／期限、刷新轮换与重放、权限、重复请求、跨账号、撤销及旧授权码。隔离浏览器已通过手机授权 → MCP 预览 → 网页确认 → 状态查询 → 即时撤销；完整首页和身体／HTTP AI／加载回归均已通过，最终结果见 [当前状态](docs/status.md)。

Node.js 24.21.0、pnpm 9.15.9、Next.js 16.3.7。先读根 README、AGENTS 与最近 README，改 Next 代码前读 node_modules/next/dist/docs 对应指南。typecheck 与 build 顺序执行。测试使用独立端口及虚构 PGlite，不读真实数据库；查询按顺序执行以兼容 PGlite socket。维护目录均需 README。

浏览器工具仅在 /tmp，复现见 [测试说明](tests/README.md)。手机静态及授权截图为 /tmp/formward-mobile-static.png、/tmp/formward-mobile-reduced.png、/tmp/formward-mobile-landscape.png、/tmp/formward-oauth-consent-mobile.png；均为虚构数据，不放入 public 或提交 Git。

## 当前待用户验收

- 手机／iPhone 微信首尾画面的光影与排版，轻触进入登录、顶部返回、输入保留，以及登录时无误触返回。
- 手机曲线默认 7D、桌面默认 30D，手动选择后保持。
- ChatGPT 实际自定义 MCP 连接、OAuth 登录授权、查询和撤销；提交用户提供的真实记录先生成预览，核对后由用户在网页确认。

## 后续功能

准确时间与归属修正、持久代表选择、网页删除／恢复及导入复用既有 feature。饮食、运动、全天消耗、热量关联与设备连接后置；不把体重差直接当热量或确定因果。MCP 首批仅接通现有身体记录能力。

私有 migration 备份与核对报告位于 data/exports/database-before-mcp-oauth-2026-10-12.json、database-after-mcp-oauth-2026-10-12.json、mcp-oauth-migration-verification-2026-10-12.json；公网上线报告在 /tmp/formward-public-mcp-http.json、/tmp/formward-public-mcp-browser.json，手机首尾截图在 /tmp/formward-public-mcp-mobile-intro.png 与 /tmp/formward-public-mcp-mobile-login.png。
