# 数据库迁移

`0010_shared_auth_rate_limits.sql` 新增 rate_limits 与最后请求时间索引，供 Vercel 多实例共享登录限流；不改变既有账号、认证和健康表。

本目录保存由 Drizzle Kit 生成并纳入版本控制的 PostgreSQL migration 历史。生成的迁移子目录和快照属于工具产物，无需单独 README；已进入共享环境的 migration 不再修改。

当前schema至0022，共37张应用表，另有Drizzle迁移账本。迁移可从既有来源初始化建议元数据；个人历史初始化通过明确范围的业务审核处理，不能把个人数值写进公共migration。网页、HTTP和MCP共用`src/features`的业务写入与审计。

`0000_flat_hawkeye.sql` 建立内部账号、凭据、会话和 verification 表；`0001_broken_moira_mactaggert.sql` 建立身体测量、导入批次与写入事件表，以及数值校验、账号归属与去重约束。`0002_complete_lockjaw.sql` 增加实测／估计、录入入口、设备、连接应用及模型信息，并约束有效估计时段唯一、占位时间不生成 UTC。`0003_pretty_mister_sinister.sql` 首次放开仅体脂估计。`0004_dapper_valeria_richards.sql` 增加批次初始化元数据，并以部分唯一索引约束每账号至多一次初始化；报告与冻结范围持久保存。`0005_medical_beyonder.sql` 支持仅体脂实测，要求每条测量至少有体重／体脂之一；新增按账号／日期唯一的空白日期与提醒状态表，以及请求内容摘要。`meta/` 是生成的快照与 journal，随 migration 纳入版本控制。生成命令为 `pnpm db:generate`，执行命令为 `pnpm db:migrate`，连接配置见 `docs/auth-setup.md`。

`0006_living_tarantula.sql` 将设备和连接应用合并为 device_label、保存来源合并审计，移除 BMI 列和约束，测量主表为 31 列；新增四列 measurement_sources，按账号／来源唯一并按最近使用检索。旧原始输入、审计、去重键、冻结依据及日期／提醒状态保留。执行前先保存私有一致性备份；当前账号未知来源的授权补齐通过独立 feature／维护脚本完成。完整结构见 [数据库字典](../docs/database.md)。

`0007_strong_omega_sentinel.sql` 合并两列日期为唯一 record_date，测量主表 30 列；日期与提醒表同步命名。原 analysis_date 的分组值保持，local_date 由原始当地时间读取。迁移先锁定测量表并检查实际日期可完整恢复，不一致则拒绝；保留所有数值、准确时间、时区、指纹、原始输入、审计、初始化依据与提醒状态。执行前保存私有一致性备份，执行后逐字段核对。

`0008_aspiring_thunderbolt_ross.sql` 新增 ai_tokens 和 measurement_operations，分别保存可撤销令牌摘要与有时限的网页确认预览，不修改既有九张表。令牌与操作均关联账号，operationId 按账号唯一，状态／权限有数据库约束。执行前备份并在执行后核对旧表逐字段不变。

`0009_supreme_imperial_guard.sql` 在 measurement_operations 增加默认 1 的 revision，状态约束支持 partially_confirmed 与 completed，供一个链接逐行／整批编辑确认。草稿与行结果沿用 preview JSON，原 payload 与请求摘要保持。既有操作增加 revision 默认值，其他列及健康表保持；迁移前备份，迁移后核对。

`0011_mcp_oauth.sql` 创建官方 OAuth 客户端／资源／授权／摘要令牌／JWKS 与 Formward oauth_connections，共新增 9 张表；measurement_operations 增加 oauth_connection_id，token_id 可空并用 CHECK 保证两者恰有一个非空。旧操作保留原 token_id，健康表与值不变；执行前私有备份，执行后核对，已共享后不再修改。

`0012_measurement_source_preferences.sql` 在 measurement_sources 增加 nullable deleted_at／deleted_by 及操作者外键，保留原字段与建议名称。列表只读有效建议，删除采用本账号幂等软删除；明确再次使用并成功保存后恢复，旧记录保留来源不会恢复。测量主表、健康数据、账号和既有审核请求不变。已在共享环境执行，不再修改；后续变化新增 migration。

`0013_meals.sql`新增饮食六表、数值约束、账号组合外键及请求／来源去重索引。生成后将新表的唯一索引置于组合外键之前，确保首次安装可执行；meta保持对应schema。已有身体、认证表不作结构或数据修改，总计27表。

0013已在共享环境执行，后续结构变更创建新migration，保留本文件与快照。迁移前后私有备份核对确认原21表字段和值一致，新增六表；初始化预览通过独立维护入口创建。

0014_meal_images 增加私有原图及同账号餐次／食材关联，meal_items增加nullable amount_decision；组合外键依赖的唯一索引先建立。共享migration保持原样，新版本上线前备份并执行此迁移。

0015_meal_review_images增加nullable meal_items.review_explanation并将meal_images_size_valid改为1–20971520字节；不修改原列和值，不补造旧审核依据。共享环境执行前备份，之后核对旧字段与迁移账本。

0016_silly_adam_warlock 仅扩展 foods_source_valid，接受 reference（手动合并的标签／成分表），继续接受原 label／composition_table／estimated／unknown。没有新增列或数据回填，迁移前后核对所有旧表字段和值以及账本；旧 migration 保持。

0017_dry_pandemic 新增 foods.category，默认 ingredient，CHECK 仅接受 meal／ingredient。旧记录分类随后通过指定账号、ID／版本／摘要的授权维护完成，不改营养、单位及历史快照。没有新增表，共29张业务／认证表。

0018_sudden_silverclaw 仅新增 record_operations，保存统一审核请求、草稿、父子审核版本与终态，并关联既有子操作。账号／请求和两个子操作标识唯一；不改原29张表和值，迁移后共30张业务／认证表。

0019新增公式资料、每日消耗、活动明细、消耗审核及审计5张表；统一审核增加可空消耗子操作和版本关联。0020新增energy_defaults，以及日记录active_estimated／notes，迁移后共36张应用表。默认值表仅保留退役存储与审计，业务不再读取或允许新增／恢复默认规则；共享migration保持原样。

0021_tranquil_leo为energy_days增加可空entry_mode、activity_mode、resting_source_system、active_source_system，以及非空默认false的resting_estimated，并校验模式取值。旧行模式保留null以兼容旧请求的取值优先级，不回填个人热量、活动0或默认规则。没有新建表，meta快照及journal同步纳入版本控制。迁移前后逐表核对原字段和值保持，账本只增加对应1条；生产执行和私有核对位置见[部署文档](../docs/deployment.md)及[项目交接](../handoff.md)。

0022_daily_marauders新增六列energy_sources，按账号／名称唯一，名称1–200字，保存创建／最近使用及软删除时间、删除操作者。迁移从未删除日记录的来源字段和运动来源按账号去重建立建议；不改任何既有表、健康事实、原始请求或审计。

0023_amused_master_mold新增meal_days／meal_day_events，保存每天是否记完、版本与餐次摘要、幂等和审计；39张应用表加迁移账本。用户确认截至2026-10-23已有有效餐次的历史日期视为已记完，migration只建结构；指定授权账号的一次性维护初始化状态，空日不建、其他账号不处理；旧表与所有健康事实保持。后续餐次保存与状态失效同一事务，不能沿用历史默认。
