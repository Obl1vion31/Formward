# Scripts

## 目的

本目录保存开发者或管理员主动运行的维护工具。

## 当前入口

- `rebuild-measurement-estimates.mts`：只重建指定账号与范围的历史估计，不修改真实记录及来源。格式：`node --env-file=.env.local --import tsx scripts/rebuild-measurement-estimates.mts 私有请求JSON --preview|--write 预览摘要`。JSON 包含 `userId` 和 `request: { operationId, range: { start, end } }`，日期为 YYYY-MM-DD、范围最多 366 天。预览列出旧估计、结果和缺项原因；执行绑定账号快照，软删除旧估计后生成晨间基准版本，样本不足留空。仅用于已经授权的历史重建；事务审计、幂等和私有报告约定与其他维护工具相同。

- `complete-measurements.mts`：通过 measurements feature 为指定账号预览／写入历史来源标记、用户提供的实测和缺测估计。格式：`node --env-file=.env.local --import tsx scripts/complete-measurements.mts 私有请求JSON --preview|--write 预览摘要`。JSON 包含 `userId` 与 `request`，后者包含 `operationId`、补全 `range`、最多 28 天的来源维护阶段 `trainingRange`（模型独立按目标日前 28 天采样）、`deviceName`、`companionApp` 和实测 `records`；日期为 YYYY-MM-DD，时段为 daytime／evening，指标为十进制字符串，未知 BMI 为空，空腹显式确认。准确当地时间可用 `measuredAt: YYYY-MM-DD HH:mm:ss`，验证跨午夜归属并保存时区与 UTC；同数值时可确认原占位时间。占位时间可用 `assumedTime: HH:mm`，存储为 assumed、UTC 为空；完全未知时间仅存日期时段。预览绑定当前账号快照，写入须已授权，重复请求幂等，普通补全保留已有估计；实测批次只刷新当天缺项；真实数值和模型报告放在被 Git 忽略的私有目录。脚本审计记录 AI 代执行，数值是否实测与执行者分别保存。

- `maintain-measurements.mts`：指定内部账号，预览当前晚间条件修正及同日同时段候选；按真实发生时间保留较早一条，其他软删除，可按记录恢复。格式：`node --env-file=.env.local --import tsx scripts/maintain-measurements.mts 账号邮箱 --preview`；核对后用 `--write 预览摘要` 执行已授权操作，用 `--restore 记录ID` 恢复。摘要绑定账号当前记录，数据改变须重新预览；事务保存前后快照、操作者和时间，重复执行幂等。工具不会在导入或页面加载时自动运行。

- `prepare-turn-video.sh`：使用 FFmpeg 将 v6 原始一秒转身视频生成 960×1440、逐帧关键帧的播放文件，不覆盖原始视频。
- `check-structure.sh`：检查所有项目自有目录是否包含非空 README。
- `migrate.mts`：使用 DATABASE_MIGRATION_URL 或 DATABASE_URL 执行版本化 Drizzle migration。
- `create-account.mts`：交互式读取邮箱和隐藏密码，调用认证 feature 创建内部账号；重复执行保留原密码。
- `import-measurements.mts`：只读预览四列体脂秤 TSV，明确目标账号后通过 measurements feature 事务写入。默认不写入，`--write` 仅用于用户已授权并核对预览的样本；时区和白天空腹标记不得猜测。格式：`node --env-file=.env.local --import tsx scripts/import-measurements.mts 文件路径 账号邮箱 --preview|--write IANA时区 [--daytime-fasting]`。同文件重试及重新排序的相同记录不会重复写入，冲突回滚整批。

账号创建与数据库维护工具的用途见 [代码阅读指南](../docs/code-study.md)。脚本中的中文注释供需要查看实现细节时参考。

配置读取 `.env.local`，不把账号密码放在命令行参数、源码或公开文件中。账号创建和数据库接入步骤见 [接入指南](../docs/auth-setup.md)。后续导入预览和数据一致性检查也调用正式 feature，不复制业务规则。
