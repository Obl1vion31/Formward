# Drizzle Migrations

本目录保存由 Drizzle Kit 生成并纳入版本控制的 PostgreSQL migration 历史。生成的迁移子目录和快照属于工具产物，无需单独 README；已进入共享环境的 migration 不再修改。

当前 `0000_flat_hawkeye.sql` 建立内部账号、凭据、会话和 verification 表。`meta/` 是生成的快照与 journal，随 migration 纳入版本控制。生成命令为 `pnpm db:generate`，执行命令为 `pnpm db:migrate`，连接配置见 `docs/auth-setup.md`。
