# Formward 项目交接

更新日期：2026-10-22。仓库 `/home/obl1vion/projects/Formward`，main。先读根README、AGENTS、本文及目标目录最近README；修改Next.js前读取已安装包的本地指南。

## 当前任务与实现

用户确认“双层关联图”并要求执行和视觉验收。网站展示已发布，正式站虚构账号及视觉验收完成：

- 上层为蓝色摄入线、红色消耗线；线间柔杏金#D8B38A盈余、雾蓝灰#92B2C2缺口，均28%填色，交点分区。主图完整区间整齐刻度并留余量。
- 下层暖白次晨变化，与上层共日期、选中线及命中区，kg轴独立。严格相邻日配对、缺测断开、候选未决留空，估计仍为虚线与空心点。
- 单日展示摄入−消耗＝盈余／缺口，另列两日晨重与次晨差。鼠标／触屏／键盘选日，Enter或“查看记录”打开详情。下方三个入口缩为摘要。
- 缺测边缘仅在有效填色段内轻淡出，不超过段长25%与8px；不隐藏真实端点、填造数据或跨缺日连线。所有范围、估计开关、450／200ms图形动效及减少动态效果保留。
- 消耗仍支持分项／总数、活动合计／运动累计互斥，来源分开；公式仅对照，不自动生成未录日期。日常默认值停用。摄入和最终消耗有数值就相减，部分或估算不阻断。
- 本轮无migration、接口、权限、认证或健康计算变更。数据库仍0021、36张应用表加账本；OpenAPI1.11.0／MCP1.8.0、12工具。

## 验证与发布

300项单元／集成、lint、typecheck、production build及目录结构检查通过。隔离数据库的消耗、饮食、统一审核浏览器回归通过。四种宽度1440／1100／390／320px真实页面截图已人工查看，亮白默认焦点框已替换为克制的日期焦点样式；验证所有区间、交叉填色与缺测遮罩、方向键／Enter、鼠标拖动、触屏横滑及纵向滚动、减少动态效果与无客户端异常。

正式域名已核对指向READY部署`dpl_6HUNRtdWzRRvny6r8SHUUh4FSZd3`，功能提交`973ca01`（主体`18fab5a`）。正式站覆盖全部范围、四种宽度、正负填色、缺测、键盘与减少动态效果；最终版本另外验证缺摄入／缺晨重状态切换不撑高读数区。全部虚构账号和所属健康事实、操作、审计、会话与令牌已清理。客户端异常0，13项公开入口／认证保护通过，Runtime error／fatal及请求5xx均0。报告在被忽略的`.codex/overview-verification/`，最终截图和报告在其`final/`，仅含虚构数据。

生产发布前备份为私有`data/exports/database-before-overview-release-2026-10-22.json`，37张表，0600，禁止提交或公开。

发布后私有备份为`data/exports/database-after-overview-release-2026-10-22.json`；`overview-release-storage-verification-2026-10-22.json`核对37张表结构一致，既有健康事实、来源、原请求、审核及审计逐项保持；仅忽略正常限流及指定认证使用／续期元数据。备份和报告均0600，Git与部署忽略。

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
