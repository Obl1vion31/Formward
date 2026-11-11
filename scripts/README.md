# Scripts

`prepare-ip-preview.mts`只初始化回环地址上的formward_ip_preview测试库，读取root私有的虚构账号配置；迁移使用既有Drizzle文件，重复执行保留已有账号与记录，不连接正式主库或其他库。FORMWARD_STANDALONE=1构建可独立运行的服务器产物，默认构建方式保持。

`preview-garmin.mts`（`pnpm garmin:preview --serve`）读取用户目录的私有 Personal API 配置，获取最近七日佳明 V2 汇总和分页活动，生成本机只读预览、字段观察和脱敏样本；不加载正式数据库配置或写入记录。原始响应存 `data/imports/`，其余报告存 `data/exports/`，均为 0600。配置和运行见 [Garmin Personal API](../docs/garmin-personal.md)。

## 目的

本目录保存开发者或管理员主动运行的维护工具。

## 当前入口

- `sync-ai-nutrition.mjs`：从饮食feature的`ai-nutrition-guidance.json`生成豆包Skill的共用营养段落及餐次工具描述；`--check`仅检查一致性。GPT的MCP／HTTP直接读取同一规则，不改变接口字段或正式记录。

- `manage-account.mts`（`pnpm account:owner`）：首次指定已有账号为唯一 owner，或在交互终端恢复 owner 密码。先 `--preview 邮箱` 核对用户 ID，再 `--write 邮箱 用户ID`；恢复用 `--recover 邮箱 用户ID`，隐藏输入并确认6–128字符新密码，长度与网页共用password-policy.ts，撤销全部访问并留维护审计。读取私有配置，预览不写入；不能通过此入口新增第二个 owner、恢复普通账号或删除健康数据。日常邀请、停用、恢复、重设和设备管理均从网页完成。




- `maintain-measurements.mts`：指定内部账号，预览当前晚间条件修正及同日同时段候选；按真实发生时间保留较早一条，其他软删除，可按记录恢复。格式：`node --env-file=.env.local --import tsx scripts/maintain-measurements.mts 账号邮箱 --preview`；核对后用 `--write 预览摘要` 执行已授权操作，用 `--restore 记录ID` 恢复。摘要绑定账号当前记录，数据改变须重新预览；事务保存前后快照、操作者和时间，重复执行幂等。工具不会在导入或页面加载时自动运行。

- `prepare-turn-video.sh`：使用 FFmpeg 将 v6 原始一秒转身视频生成 960×1440、逐帧关键帧的播放文件，不覆盖原始视频。
- `check-structure.sh`：检查所有项目自有目录是否包含非空 README；工具生成并被忽略的 .vercel 项目关联目录与依赖、缓存一起跳过。
- `backup-database.mts`：在结构迁移前导出 public／drizzle 全表及字段信息；repeatable read 只读事务，私有 JSON 权限 0600、拒绝覆盖。用法：`node --env-file=.env.local --import tsx scripts/backup-database.mts data/exports/私有备份.json`。备份含认证与健康数据，保持 Git 忽略，恢复按对应版本结构及外键顺序进行。
- `rehearse-database.mts`：使用原生 `pg_dump` 归档并恢复到独立空库，验证 PostgreSQL 跨机器迁移。源端始终只读；目标必须是回环地址或 SSH 隧道，库名限定 `formward_rehearsal` 或其下划线后缀。源目标同名、目标非空、归档位于私有目录外或输出已存在均拒绝。执行方法和验证范围见下文。
- `fill-measurement-sources.mts`：仅用于已授权的账号未知实测来源补齐。私有请求 JSON 为 `{ userId, deviceLabel }`；用法：`node --env-file=.env.local --import tsx scripts/fill-measurement-sources.mts data/exports/私有请求.json --preview|--write`。写入前保存目标实测私有快照，只改未知来源及修改时间，审计保存前后内容；估计、已知来源、测量时间、数值和删除状态保持。
- `migrate.mts`：使用 DATABASE_MIGRATION_URL 或 DATABASE_URL 执行版本化 Drizzle migration。
- `create-account.mts`：交互式读取邮箱和隐藏密码，调用认证 feature 创建内部账号；重复执行保留原密码。
- `import-measurements.mts`：只读预览三列 TSV 并兼容旧四列，明确目标账号后通过 measurements feature 事务写入。默认不写入，`--write` 仅用于用户已授权并核对预览的样本；时区和白天空腹标记不得猜测。格式：`node --env-file=.env.local --import tsx scripts/import-measurements.mts 文件路径 账号邮箱 --preview|--write IANA时区 [--daytime-fasting]`。同文件重试及重新排序的相同记录不会重复写入，冲突回滚整批。

脚本与业务模块的对应位置见 [架构与代码索引](../docs/code-study.md)，具体入口和用途以本文为准。脚本中的中文注释供需要查看实现细节时参考。

配置读取 `.env.local`，不把账号密码放在命令行参数、源码或公开文件中。账号创建和数据库接入步骤见 [接入指南](../docs/auth-setup.md)。后续导入预览和数据一致性检查也调用正式 feature，不复制业务规则。

## 数据库迁移演练

`rehearse-database.mts` 从 `DATABASE_MIGRATION_URL`（优先）或 `DATABASE_URL` 读取源连接；目标只从独立的 `FORMWARD_REHEARSAL_DATABASE_URL` 读取。目标 URL 必须明确指定本机回环主机、用户名和隔离库名，例如通过 SSH 隧道连接服务器上的 `formward_rehearsal_20261030`。源和目标使用相同 PostgreSQL 主版本、编码和排序规则；客户端 `pg_dump`、`pg_restore` 也必须为同主版本。当前演练只自动处理 `plpgsql`，额外扩展需先审核迁移方案。

目标连接等配置放在私有 `.env.rehearsal.local`，文件权限设为 0600。可用 `FORMWARD_PG_DUMP`、`FORMWARD_PG_RESTORE` 指定客户端绝对路径；省略时从 PATH 查找。先新建专用空库，再执行：

```bash
node --env-file=.env.local --env-file=.env.rehearsal.local --import tsx scripts/rehearse-database.mts --dry-run data/exports/唯一演练名称.dump
node --env-file=.env.local --env-file=.env.rehearsal.local --import tsx scripts/rehearse-database.mts --execute data/exports/唯一演练名称.dump
```

`--dry-run` 仅检查连接、版本、空目标及输出路径，不创建归档、不恢复数据。`--execute` 在源库 repeatable-read 只读事务中导出快照，表内容摘要与 `pg_dump --snapshot` 使用同一快照；源端之后的新写入不会被误判为恢复差异。按 PostgreSQL 原始 JSON 文本散列全部字段，保留时间戳微秒、numeric 精度、NULL、数组与 JSONB；同时核对 public／drizzle 的表、列、CHECK／外键／唯一约束、索引和序列状态。序列不受 MVCC 快照约束，导出期间推进则停止并要求使用新名称重试。

列位置采用按实际列顺序排列的逻辑序号，忽略历史 DROP 列留下的物理 attnum 空洞，同时保留列顺序差异检查。已有归档和恢复目标可只读复核；先核对归档 SHA256 与源摘要，再读取目标库生成摘要，不连接源库，不重复恢复非空目标：

```bash
node --env-file=.env.rehearsal.local --import tsx scripts/rehearse-database.mts --verify data/exports/已有名称.manifest.json data/exports/新的名称.verification.json
```

此模式从同名 `.dump` 读取归档，兼容旧摘要中的物理列序号；仍限制目标为本机回环地址、`formward_rehearsal` 系列库名，报告必须使用新名称，第一次失败报告和原始摘要保持。报告只含完整性核对状态，不输出业务行。

原生归档、源摘要、验证报告分别为 `.dump`、`.manifest.json`、`.verification.json`，均在 `data/exports/`、权限 0600 且拒绝覆盖；归档包含认证和健康数据，不包含 Blob 原图字节。恢复采用单事务、遇错终止，不导入源库所有者和 ACL；默认空库已有 public schema 时只跳过重复的 schema 创建，保留其下全部对象和数据。输出只含阶段和核对结果，不打印连接串、用户名、密码、原行或 PostgreSQL 原始错误。临时密码文件权限 0600，结束后清理。失败时保留已生成的私有归档与报告用于核查；不自动删除或清空目标库。

此工具验证隔离快照可恢复，不负责正式流量切换。正式迁移仍需一致的停写窗口和最终归档，不能把演练时的旧快照直接作为之后的生产主库。`backup-database.mts` 的 JSON 快照继续用于既有审计；原生归档负责跨机器恢复，避免只靠 JS 日期序列化或不完整 DDL 恢复。

安全与恢复测试使用独立本机 PostgreSQL 和虚构数据，不读取 `.env.local`：

```bash
node --import tsx --test scripts/rehearse-database.test.mts
```

测试复用 `tests/accounts.concurrent.mts` 的临时 `embedded-postgres` 工具，可通过 `FORMWARD_EMBEDDED_POSTGRES_MODULE` 指定模块路径。验证真实归档恢复、导出快照建立后的并发写入、微秒和高精度 numeric、密码／停用字段、序列、DROP 列后恢复及列顺序变化、旧摘要只读复核、损坏归档 SHA 拒绝、0600、dry-run 零目标写入、错误目标和覆盖拒绝；客户端路径沿用上述两个环境变量。


测量维护请求的日期使用 `recordDate`；旧私有 JSON 的 `analysisDate` 在读取入口兼容，双字段不同则拒绝，原文件不改写。旧补全请求指纹仍返回原批次；结构迁移前的预览须重新生成。

`ai-setup.mts`（pnpm ai:setup）在交互终端隐藏读取令牌，写入 0600 的私有 .env.ai.local，不覆盖已有配置。`ai-request.mts`（pnpm ai:request GET /measurements 或 POST /measurement-operations 私有请求.json）只用该配置调用正式 HTTP API，每次自动读取系统时区并发送 X-Formward-Timezone 请求头，私有请求文件保持原样，不读取数据库或打印令牌，不跟随重定向，仅允许 HTTPS／本机 HTTP。用法与确认流程见 [AI 接入](../docs/ai-api.md)。

`preview-meals.mts`只读解析私有饮食TSV，可用--reference采用私有参考热量；--email已有账号--stage仅创建网页初始化预览，不保存正式餐次。命令为pnpm meals:preview，确认规则见[饮食记录](../docs/meals.md)。

`correct-meal-text.mts` 仅执行已获授权的说明文字修正，业务事务在 meals feature。私有 JSON 包含 `{ userId, request: { operationId, foodId, foodVersion, preparation: { before, after }, basis: { before, after }, items: [{ id, mealId, mealVersion }], notes?: [{ mealId, mealVersion, before, after }] } }`。格式：`node --env-file=.env.local --import tsx scripts/correct-meal-text.mts data/exports/私有请求.json --preview|--write 预览摘要`。预览输出摘要与目标数量，详细差异保存在同名 `.preview.json`；写入前备份 `.before.json`，结果及当前快照存入 `.result.json`，均为 0600。只修正匹配原文及版本的食材、当前餐项、说明快照或明确指定的餐次备注；仅备注变化时不改食材和餐项版本，不修改营养、份量、照片、原始请求或历史审计；旧餐项软删除留存，审计记录 AI 代执行者及用户授权。重试幂等，任一冲突或审计失败整批回滚，不按关键词批量清理。

`maintain-foods.mts` 通过 food-maintenance feature 精简已授权的指定食材分类／名称／说明并调整当前营养基准。用法：`node --env-file=.env.local --import tsx scripts/maintain-foods.mts data/exports/私有请求.json --preview|--write 预览摘要`。私有 JSON 为 `{ userId, request: { operationId, updateMealDescriptions?, changes: [{ id, version, name?, preparation, basis, baseQuantity?, unit?, servingQuantity?, servingUnit? }] } }`。先生成 `.preview.json`，摘要绑定账号、指定食材和关联当前餐次；写入前保存不可覆盖的 `.before.json`，结果及当前快照写入 `.result.json`，均为 0600。包装规格成对填写可靠的基准数量与包装单位，不能与基准单位重名；更换基准单位而未给新规格时清空旧换算。营养数值／来源／照片保持；历史餐项用量、单位、营养基准及快照版本保持。仅当当前餐项快照版本、规格和依据与原食材一致时同步精简说明，旧餐项软删除留存，操作和 AI 代执行者进入审计。版本冲突、跨账号、身份冲突或审计失败整批回滚，重复请求幂等；不提供公开维护 API。

食材说明维护可指定 updateMealDescriptions:false，仅修正当前食材库，个人餐次备注、历史餐项及其说明快照全部保持；用于库说明与个人食用背景分开维护。省略时保留原先仅同步完全匹配当前说明快照的行为。

`preview-energy-history.mts` 为明确账号与日期范围生成一次性消耗补缺预览，不写正式事实、不建立默认值。私有JSON包含userId、operationId、正式baseURL、可选from、to、restingKcal、可选restingSourceSystem及cleanupDate。省略from时读取该账号最早事实日期，保护已填静息、活动、总数与来源；只有没有活动合计或运动记录的日期补0。用法：`node --env-file=.env.local --import tsx scripts/preview-energy-history.mts data/exports/私有请求.json --preview|--stage`。stage使用已有同账号write令牌调用正式统一审核入口，仍须用户网页登录确认。误加日期若有正式静息记录，必须先核对来源，再在私有请求提供cleanupRecord（id／version／expectedRestingKcal），只清理该分项；没有正式值时无需删除。预览、原快照、请求和操作结果均0600，禁止提交或放入public。

build.mjs是pnpm build的入口，为一次构建产生同一非敏感版本标识并交给Next.js内联；浏览器与/api/app-version共用，运行服务不重新生成。FORMWARD_BUILD_VERSION只在需要可重复验收的构建中显式指定，不能以运行时随机值替代构建版本。

身体维护仅处理实测与来源；估算、历史补全、初始化和重建脚本已移除，不能恢复归档估计。


`vercel-releases.py` 提供正式发布归档、完整性校验、域名保护、分批清理和七天保留策略；默认只读，显式 `--apply` 执行已批准流程。命令、私有目录和限制见[部署指南](../docs/deployment.md#正式运行包归档与旧部署清理)。

## 离线导出AI接口说明

export-ai-contracts.mts从正式MCP在内存中取得21项工具定义、工作要求和各业务字段字典，并复制同源字段选择实现。运行Node.js 24：

~~~bash
node --import tsx scripts/export-ai-contracts.mts /home/obl1vion/projects/Formward/.codex/model-evaluation/contracts.json
~~~

已有导出需显式加--replace。目标目录须已存在；输出JSON和同名.runtime.mjs为0600，不包含用户健康数据或密钥。脚本不执行任何业务工具，不连接模型API或数据库，不新建工作副本。修改规则后重新导出，评测会校验摘要，旧运行快照保持。
