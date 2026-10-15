# Scripts

## 目的

本目录保存开发者或管理员主动运行的维护工具。

## 当前入口

- `initialize-measurement-history.mts`：执行明确授权的一次性历史初始化，与正常估计完全分开。用法：`node --env-file=.env.local --import tsx scripts/initialize-measurement-history.mts data/exports/私有请求.json --preview|--write 预览摘要`。JSON 包含 `userId`、`request: { operationId, range: { start, end } }`，范围最多 366 天。只接受私有 `data/exports/` 请求；预览可使用指定范围内后续已存在的真实配对与晨间记录，执行绑定账号快照、软删除旧估计、生成独立批次并冻结整个范围。每账号只能完成一次；相同请求返回原报告，不同请求不能重做。执行后输出同请求名的 `.report.json` 和 `.report.md`，文件权限 0600，完整报告同时保存在数据库批次中，导出失败可重试恢复。执行前备份账号记录、批次和事件。不得把报告或实际数值提交 Git／放入 public。

- `rebuild-measurement-estimates.mts`：仅用正常过去数据规则重建指定账号与范围的估计，禁止与初始化冻结范围重叠，不修改真实记录及来源。格式：`node --env-file=.env.local --import tsx scripts/rebuild-measurement-estimates.mts 私有请求JSON --preview|--write 预览摘要`。JSON 包含 `userId` 和 `request: { operationId, range: { start, end } }`，日期为 YYYY-MM-DD、范围最多 366 天。预览列出旧估计、结果和缺项原因；执行绑定账号快照，软删除旧估计后生成晨间基准版本，样本不足留空。仅用于已经授权的历史重建；事务审计、幂等和私有报告约定与其他维护工具相同。

- `complete-measurements.mts`：通过 measurements feature 为指定账号预览／写入历史来源标记、用户提供的实测和缺测估计。格式：`node --env-file=.env.local --import tsx scripts/complete-measurements.mts 私有请求JSON --preview|--write 预览摘要`。JSON 包含 `userId` 与 `request`，后者包含 `operationId`、补全 `range`、最多 28 天的来源维护阶段 `trainingRange`（模型独立按目标日前 28 天采样）、`deviceLabel` 和实测 `records`；日期为 YYYY-MM-DD，时段为 daytime／evening，指标为十进制字符串，空腹显式确认。准确当地时间可用 `measuredAt: YYYY-MM-DD HH:mm:ss`，验证跨午夜归属并保存时区与 UTC；同数值时可确认原占位时间。占位时间可用 `assumedTime: HH:mm`，存储为 assumed、UTC 为空；完全未知时间仅存日期时段。预览绑定当前账号快照，写入须已授权，重复请求幂等，普通补全保留已有估计；该明确补全任务可刷新冻结外受影响日的缺项，冻结内只移除实测替代指标；普通写入、编辑、导入或恢复不自动估算；真实数值和模型报告放在被 Git 忽略的私有目录。脚本审计记录 AI 代执行，数值是否实测与执行者分别保存。

- `maintain-measurements.mts`：指定内部账号，预览当前晚间条件修正及同日同时段候选；按真实发生时间保留较早一条，其他软删除，可按记录恢复。格式：`node --env-file=.env.local --import tsx scripts/maintain-measurements.mts 账号邮箱 --preview`；核对后用 `--write 预览摘要` 执行已授权操作，用 `--restore 记录ID` 恢复。摘要绑定账号当前记录，数据改变须重新预览；事务保存前后快照、操作者和时间，重复执行幂等。工具不会在导入或页面加载时自动运行。

- `prepare-turn-video.sh`：使用 FFmpeg 将 v6 原始一秒转身视频生成 960×1440、逐帧关键帧的播放文件，不覆盖原始视频。
- `check-structure.sh`：检查所有项目自有目录是否包含非空 README；工具生成并被忽略的 .vercel 项目关联目录与依赖、缓存一起跳过。
- `backup-database.mts`：在结构迁移前导出 public／drizzle 全表及字段信息；repeatable read 只读事务，私有 JSON 权限 0600、拒绝覆盖。用法：`node --env-file=.env.local --import tsx scripts/backup-database.mts data/exports/私有备份.json`。备份含认证与健康数据，保持 Git 忽略，恢复按对应版本结构及外键顺序进行。
- `fill-measurement-sources.mts`：仅用于已授权的账号未知实测来源补齐。私有请求 JSON 为 `{ userId, deviceLabel }`；用法：`node --env-file=.env.local --import tsx scripts/fill-measurement-sources.mts data/exports/私有请求.json --preview|--write`。写入前保存目标实测私有快照，只改未知来源及修改时间，审计保存前后内容；估计、已知来源、测量时间、数值和删除状态保持。
- `migrate.mts`：使用 DATABASE_MIGRATION_URL 或 DATABASE_URL 执行版本化 Drizzle migration。
- `create-account.mts`：交互式读取邮箱和隐藏密码，调用认证 feature 创建内部账号；重复执行保留原密码。
- `import-measurements.mts`：只读预览三列 TSV 并兼容旧四列，明确目标账号后通过 measurements feature 事务写入。默认不写入，`--write` 仅用于用户已授权并核对预览的样本；时区和白天空腹标记不得猜测。格式：`node --env-file=.env.local --import tsx scripts/import-measurements.mts 文件路径 账号邮箱 --preview|--write IANA时区 [--daytime-fasting]`。同文件重试及重新排序的相同记录不会重复写入，冲突回滚整批。

脚本与业务模块的对应位置见 [架构与代码索引](../docs/code-study.md)，具体入口和用途以本文为准。脚本中的中文注释供需要查看实现细节时参考。

配置读取 `.env.local`，不把账号密码放在命令行参数、源码或公开文件中。账号创建和数据库接入步骤见 [接入指南](../docs/auth-setup.md)。后续导入预览和数据一致性检查也调用正式 feature，不复制业务规则。

旧补全私有请求的拆分设备字段仅在 `complete-measurements.mts` 入口转换为 deviceLabel；旧 BMI 被忽略，原文件不改写。当前 feature 及新维护请求只使用合并来源。数据库字段及迁移检查见 [数据库字典](../docs/database.md)。

测量维护请求的日期使用 `recordDate`；旧私有 JSON 的 `analysisDate` 在读取入口兼容，双字段不同则拒绝，原文件不改写。旧补全请求指纹仍返回原批次；结构迁移前的预览须重新生成。

`ai-setup.mts`（pnpm ai:setup）在交互终端隐藏读取令牌，写入 0600 的私有 .env.ai.local，不覆盖已有配置。`ai-request.mts`（pnpm ai:request GET /measurements 或 POST /measurement-operations 私有请求.json）只用该配置调用正式 HTTP API，每次自动读取系统时区并发送 X-Formward-Timezone 请求头，私有请求文件保持原样，不读取数据库或打印令牌，不跟随重定向，仅允许 HTTPS／本机 HTTP。用法与确认流程见 [AI 接入](../docs/ai-api.md)。

`preview-meals.mts`只读解析私有饮食TSV，可用--reference采用私有参考热量；--email已有账号--stage仅创建网页初始化预览，不保存正式餐次。命令为pnpm meals:preview，确认规则见[饮食记录](../docs/meals.md)。

`correct-meal-text.mts` 仅执行已获授权的说明文字修正，业务事务在 meals feature。私有 JSON 包含 `{ userId, request: { operationId, foodId, foodVersion, preparation: { before, after }, basis: { before, after }, items: [{ id, mealId, mealVersion }], notes?: [{ mealId, mealVersion, before, after }] } }`。格式：`node --env-file=.env.local --import tsx scripts/correct-meal-text.mts data/exports/私有请求.json --preview|--write 预览摘要`。预览输出摘要与目标数量，详细差异保存在同名 `.preview.json`；写入前备份 `.before.json`，结果及当前快照存入 `.result.json`，均为 0600。只修正匹配原文及版本的食材、当前餐项、说明快照或明确指定的餐次备注；仅备注变化时不改食材和餐项版本，不修改营养、份量、照片、原始请求或历史审计；旧餐项软删除留存，审计记录 AI 代执行者及用户授权。重试幂等，任一冲突或审计失败整批回滚，不按关键词批量清理。

`maintain-foods.mts` 通过 food-maintenance feature 精简已授权的指定食材名称／说明并调整当前营养基准。用法：`node --env-file=.env.local --import tsx scripts/maintain-foods.mts data/exports/私有请求.json --preview|--write 预览摘要`。私有 JSON 为 `{ userId, request: { operationId, changes: [{ id, version, name?, preparation, basis, baseQuantity?, unit? }] } }`。先生成 `.preview.json`，摘要绑定账号、指定食材和关联当前餐次；写入前保存不可覆盖的 `.before.json`，结果及当前快照写入 `.result.json`，均为 0600。营养数值／来源／照片保持；历史餐项用量、单位、营养基准及快照版本保持。仅当当前餐项快照版本、规格和依据与原食材一致时同步精简说明，旧餐项软删除留存，操作和 AI 代执行者进入审计。版本冲突、跨账号、身份冲突或审计失败整批回滚，重复请求幂等；不提供公开维护 API。
