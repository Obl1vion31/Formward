# Drizzle Migrations

本目录保存由 Drizzle Kit 生成并纳入版本控制的 PostgreSQL migration 历史。生成的迁移子目录和快照属于工具产物，无需单独 README；已进入共享环境的 migration 不再修改。

`0000_flat_hawkeye.sql` 建立内部账号、凭据、会话和 verification 表；`0001_broken_moira_mactaggert.sql` 建立身体测量、导入批次与写入事件表，以及数值校验、账号归属与去重约束。`0002_complete_lockjaw.sql` 增加实测／估计、录入入口、设备、连接应用及模型信息，并约束有效估计时段唯一、占位时间不生成 UTC。`meta/` 是生成的快照与 journal，随 migration 纳入版本控制。生成命令为 `pnpm db:generate`，执行命令为 `pnpm db:migrate`，连接配置见 `docs/auth-setup.md`。
