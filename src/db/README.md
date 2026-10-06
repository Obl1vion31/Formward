# Database

## 目的

本目录集中管理 Drizzle 数据库连接和 PostgreSQL schema。

## 当前内容

- `client.ts`：通过 postgres.js 连接 Neon 或本机 PostgreSQL，按服务端进程复用连接池。创建连接池时将 Node 的单地址自动选择尝试时限设为至少 1000ms，保留进程已有的更长设置；数据库连接时限为 15 秒。
- `schema.ts`：Better Auth 的 users、accounts、sessions、verifications 表，以及身体测量 measurements、导入批次 measurement_imports、写入事件 measurement_events；所有健康表关联 user_id。数值为 numeric，保留当地时间、每次测量时区、UTC 时刻、分析归属和空腹确认；空腹来源区分 `user_confirmed` 与晚间非空腹的 `evening_rule`，真实性 `record_kind` 与录入入口 `entry_channel` 独立，另存设备、连接应用及估计模型／预测区间。估计有效时段有唯一约束，占位或日期时段时间的 UTC 时刻为空；写入／维护事件保存前后快照。

## 维护约定

Feature 可以直接使用 Drizzle。数据库结构变化必须生成 `drizzle/` migration，并分别在开发、测试和生产环境执行。

运行配置与账号创建见 [数据库与账号接入](../../docs/auth-setup.md)。身体记录与导入已建表；饮食、运动和 AI Token 尚未建表。测量缺少时区时 UTC 时刻为空；来源指标缺项不补零，软删除字段供后续恢复入口使用。OAuth 登录未启用，account 的 OAuth 字段保持空值。
