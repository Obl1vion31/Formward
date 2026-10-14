# 项目当前状态

更新日期：2026 年 10 月 14 日。新会话先读 [项目交接](../handoff.md)。本文件描述当前仓库与正式发布状态。

## 仓库与生产

今日总览、独立身体入口、今天优先饮食及三色并列柱图、基础食材和饮食原图／AI核对已正式发布，部署为dpl_dVss144LB3QQeQDreq76kTS87RNy，READY并绑定正式域名。生产数据库已执行0014，现有29张业务／认证表；迁移前后私有备份核对确认原27表旧字段和值保持，新增两张原图表及nullable食量决策列。Private Blob仅关联Production，实际OIDC上传与原图读取已验证；真实ChatGPT文件传输仍待客户端验收。

## 当前产品决定

身体记录正文最大 1120px 并居中，同时展示六项实测摘要，当前体重和当前体脂率同等突出、等宽；下方体重图与体脂图常驻，纵轴独立，共用日期、晚间、估计及“估算规则”，桌面默认 30D、手机／触屏默认 7D，手动选择后跨视口和刷新保持。最近记录为五列、晨晚各两行读数，逐值标识实测／估计，点击直接进入正确记录与指标，差值只统计真实配对。漏记日期从账号／记录／已保存日期的最早一天补到今天，只在展示时推导；最近 10 个日历日，完整历史每批 50 日期，可加载更早日期并补记。所有日期统一行高、边界和分隔线，桌面查看与状态按钮同排，手机上下排列。统一 Inspector 320ms 滑入、240ms 退出，渐变遮罩同步淡入淡出，结束后恢复滚动与焦点，减少动态效果设置下直接开关。沿用石墨、暖白、金色、冷蓝。 每行常驻“查看”；今天无实测显示“录入”，过去无实测显示“补录”，已有任意实测显示“编辑”，只有估计仍按日期显示录入或补录。桌面按钮同排，手机上下排列，每个按钮点击高度至少 44px，行高统一且不横向溢出。

四项可独立保存，包括仅体脂；晨间固定空腹，旧非空腹／未知条件只读，晚间固定非空腹。每个空项旁独立估算，草稿不参与计算；先保存实测，再估算剩余项。表单末尾仅“保存录入”，下划线距文字 4px，错误与操作结果在按钮之前。页面没有自动弹窗、新增日期或跳过入口；日历空行只在展示层推导，已有日期与提醒状态保留。历史修改携带 updatedAt 防止覆盖并发写入，遗漏字段保留、显式 null 清空，每条实测至少一个主要指标非空。冻结历史允许实测补录，禁止新增或重算估计。 晨间、晚间各自填写数据来源，只回显已保存来源，未知来源保持空白；点击后提供按最近使用排序的历史建议，支持自由输入及本账号历史建议的鼠标、触控和方向键／Enter／Escape。来源可填写实际设备／应用名称，也可直接留空；点击保存或更新预览即确认当前输入，空来源保存为 null，估算不要求来源。身体录入与 AI 审核共用来源输入，点击输入框展开全部历史建议并保留现有文字，输入时再筛选；无历史或匹配时显示提示。建议旁“×”仅软删除建议并保留当前草稿与历史名称快照；旧记录仅保留原来源时不会恢复建议，明确再次用于新实测或来源修改并保存后恢复。建议仅在实测成功事务中新增或更新，草稿、失败和留空不产生建议。已有实测允许只改来源，保留原录入入口、准确测量时间与原始输入，并保存修改审计。设备与连接应用合成 `device_label` 名称快照，修改某条记录不影响其他记录。

首页按用户确认采用 Newsreader 主词、统一轨道标注和默认隐藏输入底线，人物、Logo、构图与转身节奏保持。身体估计区分正常 morning-baseline-v3 与一次性 historical-initialization-v1，体重、体脂独立。正常只用此前 28 天真实记录，至少 3 配对日取中位差，晨间最近最多 7 日、至少 3 日、距最新不超过 7 天；只有晚间且配对不足时可用晨间趋势备用。

指定账号 2026-09-09 至 10-06 已完成一次性初始化：统一全范围真实配对、相邻晨间插值和受限边界外推，允许已存在的后续真实数据。12 条旧估计软删除，27 条初始化估计（晨间 21、晚间 6）有效；重复实测保持软删除。整个范围冻结，补录只替代对应时段／指标，其他估计保持。真实原始字段、来源及准确时间未变，私有备份和完整报告保留。初始化权限和实际未来数据使用保留在私有报告；普通 Inspector 展示用户可理解的依据与参考列表。

所有归属按测量地当地时间：06:00 前归前一天晚间，06:00–17:59 归当天白天，18:00 起归当天晚间；真实时间、当次时区与唯一记录日期分别保留，实际发生日期从来源时间读取。用户已确认这批记录为 Asia/Shanghai、白天为空腹，现有和以后晚间统一非空腹，来源为 `evening_rule`。晚间条件与准确时间确认保存事件，原始文件未改变。每日分析区分 D 日晨晚差对照 D 日盈余，以及 D+1 日空腹变化对照 D 日盈余；当前展示实测及明确标记的历史估计，饮食记录独立展示，全天消耗与热量关联未接入。

## 已实现

- MCP + OAuth：`/api/mcp` 提供身体与饮食共九个工具，查询／预览／状态分别复用 measurements 与 meals feature，饮食具有独立权限。授权码 + S256 PKCE、CIMD 与 DCR、1 小时 JWT、轮换刷新和最多 30 天连接。签名、issuer、resource audience、期限、账号／连接／同意／权限全部验证；刷新保持稳定连接，撤销立即阻止调用、续期、未兑换授权码和旧预览。HTTP API／手动令牌继续兼容。
- 授权界面：独立登录／继续授权与逐项权限同意页，只接受官方签名请求。AI 接入设置展示 MCP 地址、ChatGPT 连接步骤、客户端权限／状态／最近使用与撤销，同时保留原令牌和审核列表。
- 手机登录：原始静态 1／12／13 PNG，纯石墨背景与 normal 合成，去掉彩色舞台光影；不加载视频，首屏点击直接到登录尾帧，不使用滑动。背景点击不返回，顶部返回保留输入并关闭键盘，认证中禁用。横屏触屏仍使用此模式。
- 桌面首页：本地 Newsreader／IBM Plex Mono、150° 同步轨道、原素材与校准、鼠标视差和焦点锁定、500ms 正倒放、静态媒体兜底和认证后 700ms／240ms 最终过渡。
- 身体记录：实测摘要、独立纵轴双图、7D／30D／90D／全部／自定义、最近日历与 50 日期完整历史、四项独立录入、来源建议、晨晚时区编辑、逐项显式估算和版本化历史编辑。手机默认 7D，桌面 30D；手动选择保持。
- 来源确认与建议管理：身体录入／AI 审核共用简洁来源输入，点击输入框直接展开全部建议并保留现有文字，输入时筛选，支持键盘／触屏选择；“×”移除本账号建议并保留草稿和历史快照。网页新实测或主动清空可直接留空保存，自动提交 sourceUnspecifiedConfirmed:true 与 deviceLabel:null；API 客户端仍须先询问确认留空；留空审计、不生成建议。旧记录保留来源不恢复建议，明确再次使用并成功保存新记录或来源修改后恢复。MCP／HTTP 返回 needsUserInput 并要求先询问，禁止以录入渠道代填。
- AI 批量审核：最多 100 条／64 KiB，原始请求不可变，预览 15 分钟，单行修改／确认／取消、整批事务确认剩余有效行。审核 revision、健康快照、归属与发起凭据保护写入；原始候选、网页草稿、操作者、确认时间和 tokenId／oauthConnectionId 审计保留。
- 全站加载反馈：实际等待超过 200ms 显示原生 dialog、虚化背景与动作文字，快速操作不闪现，失败保留输入，阻止重复提交并与 Inspector 共用滚动锁。
- 数据与维护：Neon／PGlite、Drizzle、内部账号 scrypt 哈希、7 天会话、跨实例数据库限流。schema 总计 29 张表、测量主表 30 列；0011 新增 OAuth 表并给审核操作增加连接归属；0012 来源建议增加 nullable deleted_at／deleted_by，保留旧字段和值。健康记录保留来源、准确时间、时区、未知空值与软删除；来源修正、初始化冻结、重建、维护／导入与私有报告已有 feature／脚本。

## 公网状态

[Formward](https://formward-ten.vercel.app) 已使用 Vercel Hobby／原 Neon、原内部账号、Node.js 24、函数 cle1；通过 CLI 手动发布，未关联 Git 自动部署。公开 HTTP API 与 [OpenAPI](https://formward-ten.vercel.app/api/v1/openapi.json) 可用，确认链接固定正式 HTTPS，生产默认时区 Asia/Shanghai。

来源只保留标签与输入框，点击后显示全部建议和右侧“×”，保留来源文字与草稿；输入时再筛选，无历史或匹配时显示提示。网页留空直接保存或更新预览，无需额外勾选。来源确认与建议管理、MCP／OAuth 与手机版本已发布。0012 已在真实数据库执行，21 张既有业务表全部旧字段和值保持，来源建议仅增加两列空删除状态；迁移前后私有备份与核对报告已保存。discovery／PKCE／CIMD／JWKS、MCP 401 challenge、HTTPS／私有路径及桌面／手机／320px／触屏横屏／减少动态效果验收通过，无客户端异常。当前公网OpenAPI1.5.0、来源确认和needsUserInput字段、OAuth resource discovery、MCP 401 challenge、未登录跳转与私有备份路径404通过；本次部署验收窗口Runtime error查询返回0条。真实ChatGPT的来源询问与iPhone／微信观感仍由用户核对。

## 代码入口与维护位置

| 文件 | 当前职责 |
| --- | --- |
| `src/features/mcp/server.ts` | MCP 工具、OAuth JWT／账号连接验证、每请求无状态 SDK，复用身体与饮食 feature。 |
| `src/features/auth/oauth-connections.ts`、`oauth-pages.ts`、`oauth-form.tsx` | 稳定可撤销授权、签名请求、登录／明确同意。 |
| `src/components/use-mobile-mode.ts` | 窄屏与粗指针触屏判断，SSR 延迟视频／图表默认选择。 |
| `src/app/page.tsx` | 让 `/` 显示首页人物与登录体验。 |
| `src/app/home-experience.tsx` | 协调状态、连续时间线、静态图解码与视频就绪、首屏常驻提示、鼠标能力及焦点锁定，协调认证与动画结束后的导航。 |
| `src/app/home-intro-backdrop.tsx`、`src/app/home-orbit.ts` | 三组英文排版、150° 空间投影、节点与引线、远近缩放和明暗、响应式测量及 reduced motion 静态场景。 |
| `src/app/hero-font.ts`、`public/fonts/` | Newsreader 概念词与 IBM Plex Mono 微标签的本地加载、资源与许可证；Logo 和产品 UI 沿用系统字体，Manrope 素材保留但不加载。 |
| `src/app/figure-motion.ts` | 人物外层视差、时间相关跟随、归稳与暂停恢复；不改变帧时间线。 |
| `src/app/use-direction-trigger.ts` | 桌面滚轮及键盘意图，手机点击／顶部返回；方向阈值和惯性处理。 |
| `src/app/home-timeline.ts` | rAF 自动播放与反向、视频及静态端点交叠权重、Login 进度映射及持续时间；轨道读取同一游标。 |
| `src/app/turn-video.ts` | 视频寻帧、透明 Canvas 合成、首尾校准与资源清理。 |
| `src/app/frame-config.ts` | `PRE_LOGIN_FRAMES`、`FINAL_FRAME`、静态导入和 `FRAME_CONFIG` 的逐帧对齐值。 |
| `src/app/body-sequence.tsx` | 叠放三张静态图与视频 Canvas，准备播放素材。 |
| `src/app/login-overlay.tsx` | 输入、非空按钮条件、焦点回调、认证中禁用与中文错误。 |
| `src/app/home-header.tsx`、`src/app/globals.css` | Logo、舞台、提示、人物外层变换、表单、最终过渡和响应式样式。 |
| `src/app/home-timeline.test.mjs` | 半秒时间线、模拟 60/120Hz 三档速度、手势、反向、惯性、视频帧索引和异步寻帧及 reduced motion 单元测试。 |
| `src/app/figure-motion.test.mjs` | 视差幅度、模拟 60/120Hz 跟随、回中、暂停恢复、连续接续和资源清理。 |
| `tests/home-experience.browser.mjs` | 提示、视差、焦点锁定、能力降级、四种视口端点校准、三档速度、真实视频帧、截图像素、A–E、手机点击与安全返回、键盘及实际图片解码验收。 |
| `docs/frame-calibration.md` | 当前素材的测量标记、离线拟合方法及校准残差；浏览器检查读取其 JSON 标记数据。 |
| `docs/code-study.md` | 整体架构、模块与页面文件索引、关键数据流、AI 接口及 Vercel／数据库入口。 |
| `src/features/auth/server.ts`、`auth.ts`、`client.ts` | 服务端身份验证、统一 Better Auth 配置和浏览器认证请求。 |
| `src/features/auth/provision.ts`、`scripts/create-account.mts` | 内部账号创建、scrypt 哈希、事务与重复保护。 |
| `src/db/schema.ts`、`drizzle/`、`scripts/migrate.mts` | PostgreSQL 表、版本化 migration 与执行入口。 |
| `src/app/dashboard/page.tsx` | 受保护的今日概况，顺序查询饮食与身体，调用dashboard feature汇总；退出调用正式认证接口。 |
| `src/features/measurements/assignment.ts`、`time.ts` | 当地晨晚归属、每条时区、UTC 偏移与夏令时校验。 |
| `src/features/measurements/records.ts`、`days.ts`、`trend.ts` | 数值与空腹条件、晚间规则、事务写入、账号隔离、配对、最近记录、日期窗口、正常纵轴及空腹线。 |
| `src/features/measurements/maintenance.ts`、`scripts/maintain-measurements.mts` | 绑定账号快照的条件修正、候选清理、软删除／恢复及事件。 |
| `src/features/measurements/summary.ts` | 最新有效空腹状态、7 日实际首末差、日均值及覆盖天数。 |
| `src/features/measurements/estimate-explanation.ts` | 已保存依据的用户说明、真实样本日数、简洁算式与参考记录；完整计算说明继续供私有报告使用。 |
| `src/features/measurements/measurements-view.tsx` 与同名 CSS Module | 六项摘要、双图共用筛选、五列两指标最近记录、统一 Inspector 动效和 50 日期历史；`calendar.ts` 推导日历空行。 |
| `src/features/imports/measurements.ts`、`scripts/import-measurements.mts` | 三列 TSV（兼容旧四列）只读预览与用户授权后的维护脚本导入。 |
| `tests/auth.browser.mts` | 隔离数据库与 production 服务上的真实认证和动画顺序测试。 |
| `next.config.ts` | 开发环境允许 `127.0.0.1` 访问 Next.js 客户端资源。 |

替换静态图片时保留编号，更新 `frame-calibration.md` 与 `frame-config.ts`；替换视频时更新制作脚本、帧率和帧数、视频端点校准，重新生成播放文件。原始上传视频保持不变，第 13 张继续独立于转身时间线。

## 验证结果

当前仓库lint、typecheck、225项单元／集成测试、目录结构检查、本地与Vercel production build通过。OAuth 测试通过实际 HTTP Provider 与当前／2025 SDK 客户端，覆盖签名登录、明确拒绝、回调校验（包括 native 可变回环端口）、PKCE、刷新轮换／重放、只读、重复／跨账号、错误签名／issuer／audience／到期和即时撤销；公开 JWT 签发入口拒绝访问。

隔离浏览器已通过手机 OAuth 登录 → 同意 → MCP 提交 → 网页确认 → 状态查询 → 即时撤销，手机点击／顶部返回／输入保持、不下载视频、7D 默认与手动切换。完整首页、身体记录、原 HTTP AI、全站加载回归均通过；加载回归另验证视频失败采用静态登录、必要图片失败显示刷新提示。

浏览器工具与虚构截图仅在 /tmp，测试用独立 PGlite 与端口，不写真实健康数据。视觉截图已检查手机纯石墨背景、透明人物、登录和授权布局；来源补填／直接留空保存、无额外控件、不匹配草稿时点击输入框展开全部建议、软删除／恢复、草稿保留、失效会话与 320px 触屏／键盘删除已通过；隔离 fixture 连接串 max=1 兼容 PGlite 协议，生产默认连接池为 3。真实 iPhone／微信和 ChatGPT 询问来源的最终验收由用户完成。复现见 [测试说明](../tests/README.md)。

## 待完成产品范围

网页准确时间／归属纠正、持久代表选择、删除／恢复和导入；运动、全天消耗、热量关联及设备连接。已有维护脚本支持软删除／恢复，结构化 AI 候选可复用统一审核，不对用户未提供的健康数据进行写入。

## 饮食模块

饮食页面默认今天四项摄入、今天餐次及营养素／热量柱图，历史从图表或抽屉查看；食材库、预设、原图及编辑删除恢复已实现。初始化每行一餐、整餐估算和原备注；后续明确食物与剩余杂相加。0013新增六表，原身体规则保持；MCP五个饮食工具与HTTP接口复用同一feature，OAuth独立饮食权限、版本／快照保护及网页登录确认。定位见[饮食记录](meals.md)。

饮食验证：225项单元／集成测试、lint、typecheck与production build通过。隔离浏览器覆盖HTTP权限与重试、初始化确认、食材复用、食物加杂、编辑删除恢复、缺日期、320px与跨账号；身体录入／来源／AI审核／加载回归也通过。0013已执行，迁移前后核对原21表字段与值一致，新增六表；真实初始化的正式保存由网页登录确认。原文件、参考资料、目标账号与预览均在忽略版本控制的data目录，截图仅含虚构数据。

生产OpenAPI1.5.0包含饮食原图入口，MCP1.2.0共9个工具。meals:read／meals:write、未登录保护与私有文件404通过，发布源码不含私有data或环境文件；初始化的即时状态以登录审核页为准，agent未代确认真实记录。

## 当前仓库验收

225项单元／集成测试、lint、typecheck、目录结构检查、git diff --check和最终production build通过，新增上传后数据库写入失败时不依赖静态令牌的文件清理回归。隔离浏览器饮食回归覆盖总览与详情跳转、三色并列柱、历史选择不改变今天摘要、包装图片补传及食材快照、旧餐项编辑、删除恢复、320px和跨账号读取；隔离图片传输使用虚构原图及模拟存储。

身体／来源／AI／加载完整浏览器回归通过，首次可见图表逐帧检查实际宽度及固定高度（桌面252px、窄屏206px），覆盖390px、320px、触屏横屏及减少动态效果。虚构截图在/tmp/formward-meals-visual和/tmp/formward-measurements-visual，测试日志在/tmp/formward-*-browser.log。

生产原图验收通过独立虚构账号进行实际OIDC上传、字节一致、重复、无效文件／来源、跨账号与匿名拒绝，三个主页面及320px照片预览无横向溢出或客户端异常；私有存储原始地址匿名返回403。测试图片、账号与会话已清理；临时Development权限已关闭，存储仅Production且环境变量标记为敏感。Runtime error查询返回0条。报告在/tmp/formward-public-http.json、formward-public-image-check.json、formward-private-blob-smoke.json和formward-production-runtime.jsonl，虚构截图在/tmp/formward-public-visual。实际ChatGPT文件参数及真实手机仍待用户验收。
