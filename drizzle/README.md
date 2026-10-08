# Drizzle Migrations

本目录保存由 Drizzle Kit 生成并纳入版本控制的 PostgreSQL migration 历史。生成的迁移子目录和快照属于工具产物，无需单独 README；已进入共享环境的 migration 不再修改。

`0000_flat_hawkeye.sql` 建立内部账号、凭据、会话和 verification 表；`0001_broken_moira_mactaggert.sql` 建立身体测量、导入批次与写入事件表，以及数值校验、账号归属与去重约束。`0002_complete_lockjaw.sql` 增加实测／估计、录入入口、设备、连接应用及模型信息，并约束有效估计时段唯一、占位时间不生成 UTC。`0003_pretty_mister_sinister.sql` 首次放开仅体脂估计。`0004_dapper_valeria_richards.sql` 增加批次初始化元数据，并以部分唯一索引约束每账号至多一次初始化；报告与冻结范围持久保存。`0005_medical_beyonder.sql` 支持仅体脂实测，要求每条测量至少有体重／体脂之一；新增按账号／日期唯一的空白日期与提醒状态表，以及请求内容摘要。`meta/` 是生成的快照与 journal，随 migration 纳入版本控制。生成命令为 `pnpm db:generate`，执行命令为 `pnpm db:migrate`，连接配置见 `docs/auth-setup.md`。

`0006_living_tarantula.sql` 将设备和连接应用合并为 device_label、保存来源合并审计，移除 BMI 列和约束，测量主表为 31 列；新增四列 measurement_sources，按账号／来源唯一并按最近使用检索。旧原始输入、审计、去重键、冻结依据及日期／提醒状态保留。执行前先保存私有一致性备份；当前账号未知来源的授权补齐通过独立 feature／维护脚本完成。完整结构见 [数据库字典](../docs/database.md)。

`0007_strong_omega_sentinel.sql` 合并两列日期为唯一 record_date，测量主表 30 列；日期与提醒表同步命名。原 analysis_date 的分组值保持，local_date 由原始当地时间读取。迁移先锁定测量表并检查实际日期可完整恢复，不一致则拒绝；保留所有数值、准确时间、时区、指纹、原始输入、审计、初始化依据与提醒状态。执行前保存私有一致性备份，执行后逐字段核对。
