# Database

## 目的

本目录集中管理 Drizzle 数据库连接和 PostgreSQL schema。

## 计划内容

- `client.ts`：数据库连接。
- `schema.ts`：首版数据表与约束。

## 维护约定

Feature 可以直接使用 Drizzle。数据库结构变化必须生成 `drizzle/` migration，并分别在开发、测试和生产环境执行。

