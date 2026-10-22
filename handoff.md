# Formward 项目交接

更新日期：2026-10-22。仓库 `/home/obl1vion/projects/Formward`，main。先读根README、AGENTS、本文及目标目录最近README；修改Next.js前读取已安装包的本地指南。

## 当前任务与确认结果

用户已明确要求实施并继续执行。本轮采用：

- 三行共用日期对照：摄入／消耗并排柱、盈余正负柱、次晨变化线；各图独立左轴与整齐等距刻度。
- 消耗录入为分开记录／只记总数，活动为记合计／按运动累计，模式互斥；来源分别填写。
- 历史初始化固定截至2026-10-21；缺失静息采用用户确认的历史平均数，完全没有活动合计或运动记录的日期按0补齐，已有数值、来源和未知运动保留。
- 2058只属于该一次性私有初始化请求，不是长期规则，不放进客户端或公共migration。
- 清理固定针对2026-10-22误加静息；先区分规则派生与正式事实，只处理错误分项，保留当天合法数据。
- 历史写入先生成正式审核预览，经用户网页登录确认后事务保存。不得代确认。

## 当前工作区实现

- activities增加显式模式与分项来源，正式取值在服务端；新网页同日日记录与运动明细批量事务保存。
- 日常默认值退出读取及新的写入／恢复；旧表和审计保留。旧消耗预览必须刷新，退役项只能取消，不能借旧链接重新启用。
- 公式独立对照，不自动生成静息或消耗；新分项日记录省略活动合计时0，显式未知及未知热量明细仍未知。完全未录日期保持空白。
- 只要摄入、最终消耗都有数值就相减，估算或部分标记不阻断。晨重仍严格D+1−D，缺测断开、候选留空、不生成未来体重。
- 网页移除来源记录编号、活动估算勾选、当前采用及含糊的来源与依据；来源贴近分项，内部元数据不删除。
- 三行共用日期、读数、区间及键盘／触屏选择；消耗页也使用整齐刻度。沿用450ms入场／200ms区间动效及减少动态效果。
- OpenAPI1.11.0／MCP1.8.0，仍12工具，沿用已有权限；新工具schema不提供退役默认动作，旧无模式普通请求仍兼容。

## 本地验证与剩余发布步骤

最终297项单元／集成、lint、typecheck及生产构建通过；消耗、统一审核、饮食及身体／来源／AI／加载反馈隔离浏览器回归通过。消耗覆盖三行独立刻度、所有区间、四种宽度、键盘、触屏和减少动态效果。截图与日志都使用虚构账号，位于/tmp/formward-energy-visual及/tmp/formward-energy-revision-*。

发布前备份已保存为data/exports/database-before-energy-modes-2026-10-22.json（37表含账本，0600）。待完成：将0021纳入版本控制、迁移与逐表核对、正式发布与虚构账号验收、生成历史审核预览并核对无事实写入、更新本文为实际发布结果。

当前正式站仍为待替换版本：[Formward](https://formward-ten.vercel.app)，READY部署dpl_9EzsQGNQB5resJpqztfmviHWUWvH，功能提交68b9a29，数据库0020。不能把工作区实现当成已经上线。

## 关键文件与维护方式

- activities/model.ts与records.ts：模式、校验、计算、归属、版本、请求身份、预览及审计；presentation.ts在服务端整理读数；history.ts只构造明确范围的补缺动作。
- activities/energy-editor.tsx及energy-view.tsx：网页／审核输入与显示。审核中运动仍为独立项，修改只更新预览。
- dashboard/model.ts及presentation.ts：聚合与晨重配对；overview-trend.tsx画三行图；components/chart-scale.ts共用整齐刻度。
- src/db/schema.ts及drizzle/0021_tranquil_leo.sql：只增加日记录5列与模式CHECK，不改已共享migration。旧行模式null，不在迁移中改个人数据。
- scripts/preview-energy-history.mts：读取私有配置，核对已有同账号write令牌，生成预览与原快照；--stage仅提交正式审核，不保存健康事实。有正式误加值时要求指定记录ID、版本和预期值，不仅凭日期删除。

## 数据、备份与发布约束

所有健康读取与写入校验账号，未知与零区分；删除可恢复、版本与审计保留。用户资料不进入公共代码、测试、截图或public。保留已有零基础学习指南及其他有效内容。

结构变更先提交migration，再做私有一致性备份、执行、逐表核对；共享migration不修改。生产维护使用现有本机配置，不覆盖.env.local，不从Vercel下载敏感变量，不打印凭据。Private Blob保持Production-only／OIDC，不新增静态密钥。

Git推送不自动发布，按现有Vercel CLI流程部署并确认正式别名READY。浏览器验收用独立虚构账号并在finally按外键顺序清理；measurement_events早于measurements，energy_events早于energy_operations。不能影响已有账号、健康事实或待审核批次。

早期私有备份仍在被忽略的data/exports、0600：database-before-energy-defaults-2026-10-22.json、database-after-energy-defaults-migration-2026-10-22.json、database-after-energy-defaults-production-2026-10-22.json；对应energy-defaults-migration-verification与energy-defaults-production-verification报告保留。不要依据旧报告认定当前新表为空，实际用户已保存过数据。

本机工具：Node24.21.0；pnpm与Vercel CLI位于/tmp/formward-tools/node_modules/.bin。Playwright变量及浏览器验证方式见tests/README.md。构建不能与使用同一.next的浏览器服务并行。

## 视觉参考与文档

讨论稿在被忽略的.codex/visualizations/energy-layout-reference.html及energy-entry-reference.html，含虚构数据，不是网站实现。当前会话从项目内绝对路径读取；Windows磁盘外部可写目录曾被内联读取校验拒绝，不要重新搬回旧路径。

详细说明：[学习指南](docs/code-study.md)、[消耗](docs/energy.md)、[界面](docs/interface.md)、[数据库](docs/database.md)、[AI接口](docs/ai-api.md)、[当前状态](docs/status.md)、[部署](docs/deployment.md)。
