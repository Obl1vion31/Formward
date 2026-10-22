# Formward 项目交接

更新日期：2026-10-23。仓库 `/home/obl1vion/projects/Formward`，main。先读根README、AGENTS、本文及目标目录最近README；修改Next.js前读取已安装包的本地指南。

## 当前任务与实现

用户已授权实施“手机优先：补录、消耗页、确认页与总览优化”，包括视觉验收、备份和手动发布。

- 手机48px页头、账号更多菜单、四个主页面底部导航；审核只保留统一保存栏。
- 饮食／消耗最近10个日历日直接补录，含全空与只有活动的日期；保存明确日期，跨零点保留草稿；空行不入库。
- 消耗默认最近有效日，只显示单份读数与趋势；公式／资料历史在更多面板。长区间提供稀疏日期标签。
- 总览默认最近完整收支日，必要时扩大最短区间。手机先显示盈余／缺口与计算式，次晨读数在下层图旁，详情保留两日晨重；局部线图刻度与数据范围独立，kg保留零线。
- 确认页优先单餐日期、中文餐次、服务端kcal及宏量合计和食物，图片依据折叠；标记已核对仅改草稿，正式保存语义不变。
- 无migration、公开协议、权限、认证、健康计算或历史事实变更。数据库仍0021、36张应用表加账本；OpenAPI1.11.0／MCP1.8.0、12工具。2058仍仅为既有一次性初始化。

## 验证与发布

本机lint、typecheck、305项单元／集成及production build通过。饮食、统一审核、消耗、身体／AI／加载和手机专项均通过；尖峰／缺测样本最终截图已复核，236项文档链接与章节跳转、目录结构及diff检查通过。手机专项覆盖320／390／430px与矮视口、1100／1440px、粗指针横屏、跨零点草稿、菜单与导航、补录及审核首屏。

正式别名已核对指向READY部署`dpl_36rkVNJrjXVQrs8e1avrAJf7MggA`，功能提交`2c327a9`（主体`cee8355`，窄屏`e05116f`）。正式域名虚构账号验收通过，包括全未知／0／已知部分的独立餐次合计；测试账号、健康事实、操作、审计、令牌与会话均已清理。客户端异常0，13项公开入口／认证保护通过；Runtime error／fatal及请求5xx均0。

本轮实际网页截图已查看，含320／390／430px、1100／1440px、矮视口和触屏横屏。320px消耗三项同排，首屏至少80%图形；确认页首屏有日期、合计、前两项食物与保存。软键盘通过缩小视口模拟，真实iOS／微信键盘与浏览器工具栏仍由用户复核。

私有验收报告、截图与日志归档在被忽略的`.codex/mobile-verification/`，只含虚构账号数据；`acceptance.json`为汇总，`screenshots/`含视口和全页截图。正式站当前任务已完成，后续以维护与用户反馈优化为主。

发布前后备份为`data/exports/database-before-mobile-2026-10-23.json`与`database-after-mobile-2026-10-23.json`，核对报告`mobile-release-storage-verification-2026-10-23.json`：37张表结构一致，既有健康事实、来源、原请求、审核与审计保持，只排除正常限流及指定认证使用／续期元数据。文件0600，Git与部署忽略，无migration。

上轮私有备份仍保留`database-before-overview-release-2026-10-22.json`、`database-after-overview-release-2026-10-22.json`及`overview-release-storage-verification-2026-10-22.json`。

## 已有历史审核

只读备份核对：2026-09-09至2026-10-21的既有历史补齐审核状态为confirmed，已由用户确认，不再是待确认预览。本轮未重新初始化、代确认、补写或清理健康事实。历史原始请求和审核结果继续保留于私有`data/exports/energy-history-explicit-20261022-input.*`。

2058只属于一次性历史初始化，不能加入客户端或长期默认规则。2026-10-22误显示来自已退役规则；不能仅凭日期删除当天合法事实。

## 关键文件与维护方式

- activities/model.ts与records.ts：模式、校验、计算、归属、版本、请求身份、预览及审计；presentation.ts在服务端整理读数；history.ts只构造明确范围的补缺动作。
- activities/energy-editor.tsx及energy-view.tsx：网页／审核输入与显示。审核中运动仍为独立项，修改只更新预览。
- dashboard/model.ts及presentation.ts：聚合与晨重配对；overview-trend.tsx负责读数／详情，relationship-plot.tsx绘制双层图，chart-geometry.ts负责局部线图刻度与填色几何；components/chart-scale.ts保留柱图与kg轴刻度。
- src/db/schema.ts及drizzle/0021_tranquil_leo.sql：只增加日记录5列与模式CHECK，不改已共享migration。旧行模式null，不在迁移中改个人数据。
- scripts/preview-energy-history.mts：读取私有配置，核对已有同账号write令牌，生成预览与原快照；--stage仅提交正式审核，不保存健康事实。有正式误加值时要求指定记录ID、版本和预期值，不仅凭日期删除。

## 数据、备份与发布约束

所有健康读取与写入校验账号，未知与零区分；删除可恢复、版本与审计保留。用户资料不进入公共代码、测试、截图或public。保留已有零基础学习指南及其他有效内容。

本轮私有一致性备份与报告均在被忽略的`data/exports/`，权限0600：

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
