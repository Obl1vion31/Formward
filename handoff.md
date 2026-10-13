# Formward 项目交接

更新日期：2026-10-13。工作目录：`/home/obl1vion/projects/Formward`；分支：`main`；远程：[Obl1vion31/Formward](https://github.com/Obl1vion31/Formward)。新会话先读本文、根目录 [README](README.md) 和 [协作规范](AGENTS.md)，再按任务阅读最近的目录 README。

## 当前上线状态

正式网站为 [Formward](https://formward-ten.vercel.app)，使用现有 Vercel Hobby、Neon 和内部账号。身体记录入口为 `/dashboard`，饮食入口为 `/dashboard/meals`，AI 接入设置为 `/dashboard/ai`。

当前生产部署 `dpl_4NK3G9GXn4kfcPWNKjC8saaZ6Msa` 已 READY，包含饮食记录、食材库、饮食 AI 审核、简洁来源输入和原有身体／手机功能。通过 Vercel CLI 手动发布，Git 推送不会自动部署。公开 [OpenAPI](https://formward-ten.vercel.app/api/v1/openapi.json) 为 1.4.0，MCP 服务为 1.1.0，连接地址为 `https://formward-ten.vercel.app/api/mcp`。

饮食历史初始化已生成 **45 餐待确认预览**，尚未保存为正式餐次，食材库也没有提前写入初始化食物。用户需登录网页核对并点击确认；agent 不代替用户确认。确认路径读取本地私有 `data/exports/meal-initialization-preview-2026-10-13.json` 的 `confirmationPath`，不在 Git 中保存账号信息或真实预览内容。

运动原表的 14 行已保存在私有 `data/imports/`，运动页面、正式导入和运动汇总尚未实现。

## 用户最终确认的要求

### 饮食初始化与后续记录

- 原始饮食 TSV 的 45 行各保留为一餐，全部按整餐估算录入，来源显示“初始化”。每餐一个 `whole` 餐项，保留已有四项营养，具体食物描述与原备注写入餐次备注。
- 初始化不继续追问已忘记的品牌、口味、净重或地点；按现有估算合理取值，未知品牌和地点留空，不创建未经核实的食材库条目。有旧 Excel 显式热量或明确标签时采用参考值，差异记录在导入批次，原文件不变。
- 保持原表统计日期，包括半夜加餐。双拼饭与另一顿半夜加餐分别保留；10 月 7 日鸡腿加餐是额外食用；10 月 2 日为未记录，不能计为零摄入。
- 后续明确的食物分别记录，可从食材库选择并按只／块／包／碗／份／g／ml 换算；剩余未单列食物记为“杂”。“杂”只估剩余，只有“杂”时代表整餐；`whole` 必须是本餐唯一项，避免重复统计。
- 每日与单餐均汇总热量、蛋白质、碳水、脂肪；显式热量独立保存，不强制用三大营养素反算。未知为 `null`，缺项显示已知合计及不完整提示。
- 营养依据区分标签、成分表、预估、未知，与 AI／人工录入入口分开。食材规格与营养保存历史快照，更新食材不自动修改旧餐次。
- 同规格食材识别重复；完全相同餐次提示重复，另一次进食可明确确认。餐次删除、食材停用均可恢复。
- 页面沿用项目的石墨、暖白、金色、冷蓝、系统字体与间距规范，提供每日四项摘要、切换指标趋势、日期餐次表和食材库。

### 身体记录来源与界面

来源只保留标签与输入框，不再显示“历史来源”标题或“确认不填写来源”勾选。点击输入框直接展开本账号全部建议并保留现有文字，输入时筛选；建议旁“×”移除选项，保留草稿和历史记录的名称快照。旧记录原样保存不恢复已移除建议，明确再次使用并成功保存新实测或来源修改后恢复。

网页可直接留空保存／更新预览，提交 `deviceLabel: null` 与 `sourceUnspecifiedConfirmed: true`。AI 客户端遇到缺来源须先询问补填或确认不填；协议返回 `needsUserInput`，说明禁止以“ChatGPT 手动提供”“设备未注明”等渠道或占位描述代填，也不得自行沿用历史来源。用户明确提供的设备／应用名称应按原意记录。

**仍需实际 ChatGPT 验收来源询问和解析。** 当前来源是自由文本，后端不会判断“同上”或“设备未注明”是否是有效设备名称；协议说明不能保证 GPT 不误填。已有错误来源由用户编辑改正，删除建议不联动删除健康记录。

手机点击进入静态登录尾帧，顶部返回保留输入并关闭键盘，认证中禁用返回；不加载转身视频，采用纯石墨背景。桌面保留转身与最终认证动画。曲线手机／触屏默认 7D、桌面默认 30D，手动选择后保持。所有真实等待超过 200ms 使用统一加载反馈，失败保留输入。

### 架构与代码索引

用户需要整体架构、核心模块、界面与逻辑对应文件、AI／API／Vercel 入口和关键数据流的索引，不需要逐段讲解所有源码。[架构与代码索引](docs/code-study.md) 已按这一方向重写，后续保持定位清晰；具体规则链接到各模块文档。

## 架构与核心定位

采用轻量 Next.js 模块化单体：`src/app` 放页面、Server Actions 和 HTTP 入口，`src/features` 放业务，`src/db` 集中连接与 schema。网页、HTTP 和 MCP 调用相同 feature，不在入口散落 SQL、估算或同步规则。

| 位置 | 职责 |
| --- | --- |
| [code-study.md](docs/code-study.md) | 全局架构、登录／图表／编辑／AI 的文件索引及数据流 |
| [measurements](src/features/measurements/README.md) | 身体记录、来源建议、历史编辑、估算与审核 |
| [meals](src/features/meals/README.md) | 饮食校验与营养计算、查询与确认事务、餐次／食材界面和 AI 审核 |
| [imports](src/features/imports/README.md) | 原始文件只读解析、初始化批次与待确认预览 |
| [auth](src/features/auth/README.md)、[mcp](src/features/mcp/README.md) | 登录、令牌、OAuth 授权和 MCP 工具 |
| [数据库字典](docs/database.md)、[数据库模块](src/db/README.md) | 表字段、归属与约束、连接和 migration |
| [部署说明](docs/deployment.md)、[测试说明](tests/README.md) | Vercel 配置、发布与隔离验证 |

饮食主要定位：`model.ts` 管校验、换算和汇总；`records.ts` 管归属、重复、版本／快照、预览修订、确认和审计；`meals-view.tsx`／`meals.module.css` 管摘要、图表、表格与编辑；`meal-review.tsx` 管初始化及 AI 审核。完整索引与协议见 [饮食记录](docs/meals.md)。

## AI 与数据边界

MCP 共 8 个工具：`get_profile`、`query_measurements`、`submit_measurement_operation`、`get_measurement_operation`、`search_foods`、`query_meals`、`submit_meal_operation`、`get_meal_operation`。工具只查询或提交预览，不提供直接确认保存。HTTP 与手动可撤销令牌继续兼容，详见 [AI 接入](docs/ai-api.md)。

OAuth 使用授权码 + S256 PKCE、CIMD／DCR、1 小时访问令牌、轮换刷新和最多 30 天连接；校验签名、issuer、audience、期限、归属与权限，撤销立即阻止调用、续期及旧预览保存。饮食使用独立 `meals:read`／`meals:write` 权限，已有身体连接须刷新工具列表并重新授权；手动令牌沿用 `read`／`write`。

所有 AI 写入先预览，经当前账号网页登录明确确认。AI 预览 15 分钟有效，初始化预览持续保存；原始请求不可变、草稿修订独立，使用 revision、健康快照和发起凭据防止覆盖与失效授权保存。重复请求／确认幂等，所有用户数据按 `user_id` 隔离，删除采用软删除并保存审计。身体批量最多 100 条／64 KiB，支持逐行修订、确认、取消及整批保存；饮食按操作批次事务确认。

身体规则以 [身体指标记录](docs/measurements.md) 为准，尤其保留：

- 体重和体脂独立；实测优先，估计明确标识。摘要、晨晚差和正常模型只使用符合条件的真实记录，页面读取不生成估计。
- 正常 `morning-baseline-v3` 只用目标日之前 28 天真实数据，至少 3 组晨晚配对取中位差；晨间趋势最多 7 个日、至少 3 日且距最近实测不超过 7 天，样本不足留空，不加入饮食或运动变量。
- 一次性 `historical-initialization-v1` 的 2026-09-09 至 10-06 范围已冻结，补录只替代对应时段的非空实测指标，其他估计保持；普通补全／重建／恢复不得覆盖冻结范围。
- 身体按测量地当地钟点归属：00:00–05:59 为前一日晚间、06:00–17:59 当天白天、18:00 起当天晚间；晨间必须空腹，晚间固定非空腹。原始时间、当次时区和唯一记录日期分别保留，旅行不重新分类历史。
- 饮食按用户指定统计日期，不套用身体凌晨规则；未知钟点不生成 UTC。未知数值不以 `0` 代替，录入渠道不代替实际来源。

## 数据库与私有资料

数据库现有 **27 张业务表**，测量主表 30 列。`0012_measurement_source_preferences.sql` 增加来源建议软删除状态，`0013_meals.sql` 增加 `foods`、`meals`、`meal_items`、`meal_imports`、`meal_operations`、`meal_events` 六表。两项 migration 已在生产执行，既有 21 张表的原字段和值核对一致；已共享 migration 与 snapshot 不再修改，后续结构变化新增 migration。

真实原始文件、账号目标、备份和预览只在被 Git 忽略的 `data/` 保存，不放 `public/` 或提交 Git，不覆盖原 TSV／Excel。当前饮食维护资料为：

- `data/imports/meals-2026-09-23-to-2026-10-08.tsv` 与 `activities-2026-09-23-to-2026-10-08.tsv`。
- `data/exports/database-before-meals-2026-10-13.json`、`database-after-meals-2026-10-13.json`、`meals-migration-verification-2026-10-13.json`。
- 同目录 `meal-initialization-reference-2026-10-13.json`、`meal-initialization-target-2026-10-13.json`、`meal-initialization-preview-2026-10-13.json`。

OAuth 和来源管理的迁移前后备份、核对报告也保留在 `data/exports/`。生产 secret 只在平台与本地私有配置中，不用 env pull 覆盖 `.env.local`。`pnpm meals:preview` 默认只读；带 `--stage` 只创建待确认预览，同文件与参考资料重试复用批次。

## 验证与运行

当前代码已通过 lint、typecheck、**217 项单元／集成测试**、目录结构检查、本地与 Vercel production build。饮食隔离浏览器覆盖 HTTP 权限／重试、初始化确认、食材复用、食物加杂、编辑删除恢复、未记录日期、320px 和跨账号隔离；身体录入／来源／AI 审核／加载回归通过。OAuth 的正常、无效、重复、跨账号、刷新轮换和即时撤销已有覆盖。

公网 OpenAPI 1.4.0、饮食权限发现、未登录保护和私有文件路径 404 已核对。当前部署上传 333 个文件，无私有数据或环境文件；关键界面、业务、MCP、schema 的 SHA1 与本地一致，核对时 Runtime Logs error 为 0。生产检查未替用户确认真实初始化。

饮食验证日志和发布核对在 `/tmp/formward-meals-*.log`、`/tmp/formward-meals-public-http.json`、`/tmp/formward-meals-release-summary.json`；虚构截图在 `/tmp/formward-meals-visual/`，不放公开目录或提交 Git。临时工具与报告可能随环境清理消失，正式复现步骤以测试和部署文档为准。

运行环境为 Node.js 24.21.0、pnpm 9.15.9、Next.js 16.3.7。修改 Next 代码前阅读 `node_modules/next/dist/docs/` 对应指南；typecheck 和 build 顺序执行。测试使用独立端口和虚构 PGlite，不连接真实健康数据库；浏览器 fixture 使用 `max=1`，避免直接 PGlite 查询与 socket 请求争用未命名 statement，结束时清理整个服务进程组。Neon 默认连接池为 3。

## 接手顺序与待验收

1. 用户在饮食审核页核对 45 餐并确认，确认后才进入每日与单餐统计；检查初始化来源、备注和未记录日期。
2. 验收饮食页面与食材库的选择复用、数量换算、来源依据、重复提示、编辑与删除恢复，特别检查手机排版。
3. 在真实 ChatGPT 更新 MCP 工具并重新授权饮食权限，验证查询、预览、网页确认和撤销；继续核对身体来源缺失时先询问、明确设备名称能正确传递。
4. 真实 iPhone／微信核对静态登录、顶部返回、输入保留及曲线默认区间。SDK 与模拟手机检查不能替代真实客户端验收。

后续按用户新要求推进运动与全天消耗；身体网页准确时间／归属纠正、持久代表选择、删除恢复和导入仍待接入。热量关联、训练计划与设备连接后置，不把体重差直接解释为热量或确定因果。
