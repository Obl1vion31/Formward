# Formward 项目交接

更新日期：2026-10-25。仓库 `/home/obl1vion/projects/Formward`，当前功能分支 `codex/latest-records-energy-sources`，尚未合入main。先读根README、AGENTS、本文及目标目录最近README；修改Next.js前读取已安装包的本地指南。

## 当前维护：总览首屏与统一设计验收

总览移除独立日期输入、前后一天与解除按钮；桌面悬停预览、点击固定，图外／Escape解除，区间内固定日保留。手机紧凑展示摄入／消耗／差值、区间栏和完整双图，共用日期刻度；图组常规268px、矮视口228px，不缩放文字或裁剪事实。自定义范围应用后收起，取消不改变范围。其他页面日期组件保持。

设计与验收标准统一在[既有设计文档](docs/design-reference.md)，未新建规则文件；AGENTS要求界面实施前、验收前读取并逐项留下证据。机器检查包含实际首屏边界、SVG字形尺寸和刻度碰撞，不能只检查DOM或长截图。详细结果见[验收记录](docs/maintenance-verification.md)。

本机lint、typecheck、354项单元／集成、production build、消耗／手机／审核回归和四页面×四宽度图表交互通过。Chromium与WebKit使用虚构数据通过320×560、390×560、390×640、430×780、1100／1440px，另查触屏横屏、150% CSS放大和减少动态效果，手机模拟34px安全区。已实际复核截图；旧本机Fontconfig缺少系统别名造成WebKit SVG文字不绘制，修正测试字体配置后重新通过，未因此改动业务实现。

正式域名已核对READY部署dpl_A9Ncxhg35CPxuN3WcMCKeVqwAt4Q，运行代码aaea8b3，分支codex/latest-records-energy-sources未合入main。正式站同一双浏览器及触屏／放大检查通过，已逐张复核截图；客户端异常与5xx为0，14项公开／保护入口通过，验收时段Runtime error／fatal为0。虚构账号和数据全部清理，40表核对原健康事实、请求、审计及结构保持。

发布前后备份为data/exports/database-before-overview-compact-2026-10-25.json和database-after-overview-compact-2026-10-25.json，核对为overview-compact-storage-verification-2026-10-25.json，均0600且Git忽略。正式截图与报告在.codex/overview-compact-release/；本轮无migration，数据库仍0024。

## 此前三阶段完善交付

此前三阶段部署dpl_5yW5kVWVmjozc837AaRpXeMUtgLU，运行代码83a773c，数据库0024；当前总览维护版本见上一节。功能分支已推送，尚未合入main。第一批维护为f92f08f／0023，后续录入与界面完善已单独发布。

- 日状态为已记完／未记全／未确认；只有已记完且两侧有值才计算盈余，估算和营养部分未知不额外阻止相减。餐次变更让相关日重新待确认。授权账号截至2026-10-23的28个有效历史餐日已一次性初始化，空日与其他账号不处理，不成为未来默认。
- AI禁止整条删除／恢复或批量删除身体、餐次、食材、消耗、运动；餐内增减经审核，不能清空整餐。网页手工操作保留，取消草稿不会删除事实；HTTP、MCP、业务执行及旧待确认申请共用保护。
- 网页人工餐次按实际保存顺序生效，每次保留前后审计；AI预览继续检查版本、快照、授权与有效期。缺图可直接保存文字，无五项照片勾选或标记核对按钮；普通餐次只需底部一次确认保存。修改列清增减与修改后合计。
- 桌面总览悬停预览、移出恢复，点击固定、另一列切换，点击图外或Escape释放；跨区间保留范围内固定日。详情身体／消耗并排、当日营养合计、默认折叠前三餐，更多餐次再展开，图片展开后加载。
- 摄入默认今天及以前最近有记录日，网址与主动选日优先；最近10个日历日含空日补录，更早记录按50日期分页。新自由项默认1份，常驻暖色输入框、单位在份数前、每份营养由共用规则乘份数；旧总量口径不重乘，主动切换才采用每份规则。包装只用可靠规格；指定食材已补包装映射，历史克数与营养保持。
- 消耗总数／活动合计与运动明细共存，逐项明确已包含或额外增加，不按大小推断；总数／采用模式变化重新核对，来源备注不重问。旧运动沿用原结果，未知不是0。录入值与最终值分开返回。
- 静息公式／资料入口、正常AI动作和计算撤下；消耗页面与查询不再读取身体记录，旧资料与审计保留。日常默认已退役，2058只属于旧的一次性历史初始化。
- 本人Excel为8张表，保留数字、未知、0、来源、每份口径、包装和运动包含关系，不含退役公式资料或凭据。公开协议OpenAPI1.12.0／MCP1.10.0、13工具，OAuth权限种类保持；客户端刷新工具列表获取新字段。

第一批337项、本批354项单元／集成通过；lint、typecheck、production build、全部受影响浏览器回归及283项本地文档链接及15项章节锚点、目录／diff检查通过。本批已实际查看320／390／430／1100／1440px、320×560矮屏、触屏横屏与减少动态效果；手机审核首屏有日期、合计、前两项食物和保存，1440×900两餐默认详情不滚动。

正式站用虚构账号复验同样五种宽度、固定日期、折叠、份数／包装、消耗包含关系、一次审核及MCP；15项公开／保护入口通过。客户端异常和请求5xx为0，验收时段最近10分钟Runtime error／fatal为0；虚构账号、OAuth客户端及所属数据全部清理。40表逐项对照通过，原健康事实、请求与审计保持，指定包装维护只增加一个操作与一个食材事件。

私有备份位于data/exports、0600：database-before-stage3-2026-10-25.json、database-after-stage3-migration-2026-10-25.json、database-after-stage3-package-2026-10-25.json、database-after-stage3-production-2026-10-25.json；核对为stage3-migration-verification.json、stage3-package-verification.json、stage3-production-verification.json。第一批stage1备份与报告仍保留。当前截图／报告.codex/stage3-release/，本机密集波动样本.codex/maintenance-visual/，日志.codex/stage3-*；均不得放public或提交。详细证据见[验收记录](docs/maintenance-verification.md)。真实iOS／微信键盘仍由用户最终复核。

## 既有功能与保留实现

既有统一OAuth补授权与纯连接检查；首页最新记录、消耗来源记忆保持。用户选择消耗来源单独记忆、手机图下纵向三行摘要。

- 首页身体、摄入、消耗各自读取最近记录日期；摄入显示该日餐数／kcal，消耗标日期，跨零点保持。最新部分数据不退回更早完整日，未知与0区分，图表每日收支规则保持。
- 消耗来源在静息／活动合计／总数／运动间共用，与身体来源隔离；正式保存成功才记忆，点击展开全部、搜索／键盘／触屏选择，软移除保留历史与草稿，明确新使用才恢复。网页与统一／旧审核入口共用输入。
- query_energy已在用户补授权后实测成功；用户报告仅消耗提交未授权。authorize_formward新增纯连接检查，一次申请身体、饮食／食材、消耗的读取和提交预览；不读健康内容、不建预览。已有提交权限的连接缺新类别时补授权合并六项，日常只读缺权限只合并三类读取。三类权限在设置页同格式显示，提供复制统一授权指令；旧令牌／连接不自动扩权，必须用户OAuth同意。客户端需刷新工具列表才能发现新增工具。

- 手机48px页头、账号更多菜单、四个主页面底部导航；审核只保留统一保存栏。
- 饮食／消耗最近10个日历日直接补录，含全空与只有活动的日期；保存明确日期，跨零点保留草稿；空行不入库。
- 消耗默认最近有效日，只显示单份读数与趋势；公式／资料入口撤下。长区间提供稀疏日期标签。
- 总览默认最近完整收支日，必要时扩大最短区间。手机先显示盈余／缺口与计算式，次晨读数在下层图旁，详情保留两日晨重；局部线图刻度与数据范围独立，kg保留零线。
- 确认页优先单餐日期、中文餐次、服务端kcal及宏量合计和食物，图片依据折叠；普通餐次只需底部一次确认保存，缺图可先保存文字。
- 0022新增energy_sources并从有效既有来源初始化建议元数据，原表／健康事实／原始请求／审计保持。当前正式数据库0024、39张应用表加账本；0024只增加兼容列。公开权限种类和认证保持；OpenAPI1.12.0／MCP1.10.0、13工具。2058仍仅为既有一次性初始化。

## 验证与发布归档

当前结果、版本和证据见本文开头及[验收记录](docs/maintenance-verification.md)。后续维护不重新执行历史初始化，不删除或改写共享migration，发布继续使用备份、迁移核对、正式别名READY与虚构账号清理流程。

以下为此前发布的私有备份归档，不代表当前结构或数据为空：

先前手机发布备份为`data/exports/database-before-mobile-2026-10-23.json`与`database-after-mobile-2026-10-23.json`，核对报告`mobile-release-storage-verification-2026-10-23.json`：37张表结构一致，既有健康事实、来源、原请求、审核与审计保持，只排除正常限流及指定认证使用／续期元数据。文件0600，Git与部署忽略，无migration。

上轮私有备份仍保留`database-before-overview-release-2026-10-22.json`、`database-after-overview-release-2026-10-22.json`及`overview-release-storage-verification-2026-10-22.json`。

本轮私有备份为data/exports/database-before-latest-records-2026-10-24.json、database-after-latest-records-migration-2026-10-24.json和database-after-latest-records-production-2026-10-24.json；核对报告为latest-records-migration-verification-2026-10-24.json和latest-records-production-verification-2026-10-24.json。仅新增energy_sources及一条迁移账本；既有表结构和值保持，只排除正常限流、会话续期和授权使用时间。文件0600、Git与部署忽略。

统一授权发布无migration。私有备份为data/exports/database-before-unified-access-2026-10-24.json和database-after-unified-access-production-2026-10-24.json，核对为unified-access-production-verification-2026-10-24.json，38表结构及既有数据／scope保持，仅排除正常限流和授权使用／会话续期。正式站使用临时账号复现“只差energy:write”，一次网页同意后六项权限完整；零健康／预览写入、旧令牌隔离与撤销均通过，账号及OAuth客户端已清理。报告／截图在.codex/unified-access-release/；320／390／1440px已查看。

## 已有历史审核

只读备份核对：2026-09-09至2026-10-21的既有历史补齐审核状态为confirmed，已由用户确认，不再是待确认预览。本轮未重新初始化、代确认、补写或清理健康事实。历史原始请求和审核结果继续保留于私有`data/exports/energy-history-explicit-20261022-input.*`。

2058只属于一次性历史初始化，不能加入客户端或长期默认规则。2026-10-22误显示来自已退役规则；不能仅凭日期删除当天合法事实。

## 关键文件与维护方式

- components/source-input.tsx共用来源交互；activities/sources.ts管理独立消耗建议，正式确认与来源更新同一事务。
- activities/model.ts与records.ts：模式、校验、计算、归属、版本、请求身份、预览及审计；presentation.ts在服务端整理读数；history.ts只构造明确范围的补缺动作。
- activities/energy-editor.tsx及energy-view.tsx：网页／审核输入与显示。审核中运动仍为独立项，修改只更新预览。
- dashboard/model.ts及presentation.ts：聚合与晨重配对；overview-trend.tsx负责读数／详情，relationship-plot.tsx绘制双层图，chart-geometry.ts负责局部线图刻度与填色几何；components/chart-scale.ts保留柱图与kg轴刻度。
- src/db/schema.ts及drizzle/0022_daily_marauders.sql：新增消耗来源建议及历史名称元数据；0021日记录模式列和CHECK保持，已共享migration不修改，个人数值不回填。
- scripts/preview-energy-history.mts：读取私有配置，核对已有同账号write令牌，生成预览与原快照；--stage仅提交正式审核，不保存健康事实。有正式误加值时要求指定记录ID、版本和预期值，不仅凭日期删除。

- src/features/meals/model.ts、meal-editor.tsx、records.ts：每份输入、旧总量兼容、包装换算与最终存储；day-status.ts负责当天完成状态及餐次变化失效。
- src/features/activities/model.ts、records.ts、energy-editor.tsx及records/operations.ts：包含关系绑定、整批预览、独立运动审核及事务；新增字段来自drizzle/0024_tan_starjammers.sql。
- src/features/exports/workbook.ts：8张原生Excel表，保留未知／零与原始输入口径；src/features/auth/ai-write-policy.ts统一限制AI整条删除／恢复。

## 数据、备份与发布约束

所有健康读取与写入校验账号，未知与零区分；删除可恢复、版本与审计保留。用户资料不进入公共代码、测试、截图或public。保留已有零基础学习指南及其他有效内容。

此前消耗模式发布的私有一致性备份与报告均在被忽略的`data/exports/`，权限0600：

- `database-before-energy-modes-2026-10-22.json`、`database-after-energy-modes-migration-2026-10-22.json`、`energy-modes-migration-verification-2026-10-22.json`。
- `database-after-energy-modes-production-2026-10-22.json`、`energy-modes-production-verification-final-2026-10-22.json`。
- `database-after-energy-modes-history-preview-2026-10-22.json`、`energy-modes-history-preview-verification-2026-10-22.json`、`energy-modes-preview-check-2026-10-22.json`。

未加final后缀的生产核对报告保留原诊断：只有正常会话续期时间变化，令牌与身份字段一致。最终报告明确允许认证元数据向前更新，其他字段仍逐项核对，未通过修改健康数据消除差异。

结构变更先提交migration，再做私有一致性备份、执行、逐表核对；共享migration不修改。生产维护使用现有本机配置，不覆盖.env.local，不从Vercel下载敏感变量，不打印凭据。Private Blob保持Production-only／OIDC，不新增静态密钥。

Git推送不自动发布，按现有Vercel CLI流程部署并确认正式别名READY。浏览器验收用独立虚构账号并在finally按外键顺序清理；measurement_events早于measurements，energy_events早于energy_operations。不能影响已有账号、健康事实或待审核批次。

早期私有备份仍在被忽略的data/exports、0600：database-before-energy-defaults-2026-10-22.json、database-after-energy-defaults-migration-2026-10-22.json、database-after-energy-defaults-production-2026-10-22.json；对应energy-defaults-migration-verification与energy-defaults-production-verification报告保留。不要依据旧报告认定当前新表为空，实际用户已保存过数据。

本机工具：Node24.21.0；pnpm与Vercel CLI保留在/home/obl1vion/.local/formward-tools/node_modules/.bin，避免/tmp在环境重启后丢失。当前PLAYWRIGHT_MODULE为该工具目录node_modules/playwright/index.mjs，PLAYWRIGHT_BROWSERS_PATH为该目录browsers；LD_LIBRARY_PATH使用system/root/usr/lib/x86_64-linux-gnu，FONTCONFIG_FILE使用system/fonts.conf。通用方法见tests/README.md。构建不能与使用同一.next的浏览器服务并行。

## 视觉参考与文档

讨论稿在被忽略的.codex/visualizations/energy-layout-reference.html及energy-entry-reference.html，含虚构数据，不是网站实现。当前会话从项目内绝对路径读取；Windows磁盘外部可写目录曾被内联读取校验拒绝，不要重新搬回旧路径。

详细说明：[学习指南](docs/code-study.md)、[消耗](docs/energy.md)、[界面](docs/interface.md)、[数据库](docs/database.md)、[AI接口](docs/ai-api.md)、[当前状态](docs/status.md)、[部署](docs/deployment.md)。
