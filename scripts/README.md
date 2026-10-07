# Scripts

## 目的

本目录保存开发者或管理员主动运行的维护工具。

## 当前入口

- `initialize-measurement-history.mts`：执行明确授权的一次性历史初始化，与正常估计完全分开。用法：`node --env-file=.env.local --import tsx scripts/initialize-measurement-history.mts data/exports/私有请求.json --preview|--write 预览摘要`。JSON 包含 `userId`、`request: { operationId, range: { start, end } }`，范围最多 366 天。只接受私有 `data/exports/` 请求；预览可使用指定范围内后续已存在的真实配对与晨间记录，执行绑定账号快照、软删除旧估计、生成独立批次并冻结整个范围。每账号只能完成一次；相同请求返回原报告，不同请求不能重做。执行后输出同请求名的 `.report.json` 和 `.report.md`，文件权限 0600，完整报告同时保存在数据库批次中，导出失败可重试恢复。执行前备份账号记录、批次和事件。不得把报告或实际数值提交 Git／放入 public。

- `rebuild-measurement-estimates.mts`：仅用正常过去数据规则重建指定账号与范围的估计，禁止与初始化冻结范围重叠，不修改真实记录及来源。格式：`node --env-file=.env.local --import tsx scripts/rebuild-measurement-estimates.mts 私有请求JSON --preview|--write 预览摘要`。JSON 包含 `userId` 和 `request: { operationId, range: { start, end } }`，日期为 YYYY-MM-DD、范围最多 366 天。预览列出旧估计、结果和缺项原因；执行绑定账号快照，软删除旧估计后生成晨间基准版本，样本不足留空。仅用于已经授权的历史重建；事务审计、幂等和私有报告约定与其他维护工具相同。

- `complete-measurements.mts`：通过 measurements feature 为指定账号预览／写入历史来源标记、用户提供的实测和缺测估计。格式：`node --env-file=.env.local --import tsx scripts/complete-measurements.mts 私有请求JSON --preview|--write 预览摘要`。JSON 包含 `userId` 与 `request`，后者包含 `operationId`、补全 `range`、最多 28 天的来源维护阶段 `trainingRange`（模型独立按目标日前 28 天采样）、`deviceLabel` 和实测 `records`；日期为 YYYY-MM-DD，时段为 daytime／evening，指标为十进制字符串，空腹显式确认。准确当地时间可用 `measuredAt: YYYY-MM-DD HH:mm:ss`，验证跨午夜归属并保存时区与 UTC；同数值时可确认原占位时间。占位时间可用 `assumedTime: HH:mm`，存储为 assumed、UTC 为空；完全未知时间仅存日期时段。预览绑定当前账号快照，写入须已授权，重复请求幂等，普通补全保留已有估计；该明确补全任务可刷新冻结外受影响日的缺项，冻结内只移除实测替代指标；普通写入、编辑、导入或恢复不自动估算；真实数值和模型报告放在被 Git 忽略的私有目录。脚本审计记录 AI 代执行，数值是否实测与执行者分别保存。

- `maintain-measurements.mts`：指定内部账号，预览当前晚间条件修正及同日同时段候选；按真实发生时间保留较早一条，其他软删除，可按记录恢复。格式：`node --env-file=.env.local --import tsx scripts/maintain-measurements.mts 账号邮箱 --preview`；核对后用 `--write 预览摘要` 执行已授权操作，用 `--restore 记录ID` 恢复。摘要绑定账号当前记录，数据改变须重新预览；事务保存前后快照、操作者和时间，重复执行幂等。工具不会在导入或页面加载时自动运行。

- `prepare-turn-video.sh`：使用 FFmpeg 将 v6 原始一秒转身视频生成 960×1440、逐帧关键帧的播放文件，不覆盖原始视频。
- `check-structure.sh`：检查所有项目自有目录是否包含非空 README。
- `backup-database.mts`：在结构迁移前导出 public／drizzle 全表及字段信息；repeatable read 只读事务，私有 JSON 权限 0600、拒绝覆盖。用法：`node --env-file=.env.local --import tsx scripts/backup-database.mts data/exports/私有备份.json`。备份含认证与健康数据，保持 Git 忽略，恢复按对应版本结构及外键顺序进行。
- `fill-measurement-sources.mts`：仅用于已授权的账号未知实测来源补齐。私有请求 JSON 为 `{ userId, deviceLabel }`；用法：`node --env-file=.env.local --import tsx scripts/fill-measurement-sources.mts data/exports/私有请求.json --preview|--write`。写入前保存目标实测私有快照，只改未知来源及修改时间，审计保存前后内容；估计、已知来源、测量时间、数值和删除状态保持。
- `migrate.mts`：使用 DATABASE_MIGRATION_URL 或 DATABASE_URL 执行版本化 Drizzle migration。
- `create-account.mts`：交互式读取邮箱和隐藏密码，调用认证 feature 创建内部账号；重复执行保留原密码。
- `import-measurements.mts`：只读预览三列 TSV 并兼容旧四列，明确目标账号后通过 measurements feature 事务写入。默认不写入，`--write` 仅用于用户已授权并核对预览的样本；时区和白天空腹标记不得猜测。格式：`node --env-file=.env.local --import tsx scripts/import-measurements.mts 文件路径 账号邮箱 --preview|--write IANA时区 [--daytime-fasting]`。同文件重试及重新排序的相同记录不会重复写入，冲突回滚整批。

账号创建与数据库维护工具的用途见 [代码阅读指南](../docs/code-study.md)。脚本中的中文注释供需要查看实现细节时参考。

配置读取 `.env.local`，不把账号密码放在命令行参数、源码或公开文件中。账号创建和数据库接入步骤见 [接入指南](../docs/auth-setup.md)。后续导入预览和数据一致性检查也调用正式 feature，不复制业务规则。

旧补全私有请求的拆分设备字段仅在 `complete-measurements.mts` 入口转换为 deviceLabel；旧 BMI 被忽略，原文件不改写。当前 feature 及新维护请求只使用合并来源。数据库字段及迁移检查见 [数据库字典](../docs/database.md)。
