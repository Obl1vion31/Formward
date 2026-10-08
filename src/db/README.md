# Database

## 目的

本目录集中管理 Drizzle 数据库连接和 PostgreSQL schema。

## 当前内容

- `client.ts`：通过 postgres.js 连接 Neon 或本机 PostgreSQL，按服务端进程复用连接池。创建连接池时将 Node 的单地址自动选择尝试时限设为至少 1000ms，保留进程已有的更长设置；数据库连接时限为 15 秒。
- `schema.ts`：Better Auth 的 users、accounts、sessions、verifications 表，以及身体测量 measurements、日期与提醒状态 measurement_days、操作批次 measurement_imports、写入事件 measurement_events；所有健康表关联 user_id。数值为 numeric，保留当地时间、每次测量时区、UTC 时刻、唯一记录日期 record_date和空腹确认；空腹来源区分 `user_confirmed` 与晚间非空腹的 `evening_rule`，真实性 `record_kind` 与录入入口 `entry_channel` 独立，另存合并设备来源及估计依据／样本快照。实测与估计均允许仅体重或仅体脂，至少一个主要指标非空，不能用全空测量代表空日期；估计有效时段唯一，占位或日期时段时间的 UTC 时刻为空；写入／维护事件保存前后快照。`measurement_days` 按账号／日期唯一，保存创建人、时间和当天停止提醒状态，不进入实测统计。`measurement_imports.request_digest` 绑定录入请求内容，`initialization_metadata` 保存独立初始化模式、规则、冻结范围、策略和完整报告；部分唯一索引保证每个账号仅有一个初始化批次。

## 维护约定

Feature 可以直接使用 Drizzle。数据库结构变化必须生成 `drizzle/` migration，并分别在开发、测试和生产环境执行。

运行配置与账号创建见 [数据库与账号接入](../../docs/auth-setup.md)。身体记录与导入已建表；饮食、运动和 AI Token 尚未建表。测量缺少时区时 UTC 时刻为空；来源指标缺项不补零，软删除字段供后续恢复入口使用。OAuth 登录未启用，account 的 OAuth 字段保持空值。

`measurement_sources` 仅保存账号、历史来源名称、创建与最近使用时间；账号／名称唯一。测量以 `device_label` 保存独立名称快照，不通过外键联动历史。主表 30 列，BMI 仅可留在原文件及既有输入／审计快照。完整连接流程、关系图、字段、约束和维护入口见 [数据库字典](../../docs/database.md)。
