# Source

## 目的

本目录保存 Formward 的运行时代码，从 Next.js 页面和 API 入口到业务功能、数据库访问和共用界面组件。

## 内容

- `app/`：Next.js 入口。
- `features/`：用户能够理解的业务功能。
- `db/`：数据库连接与 schema。
- `components/`：跨页面复用的 UI。

## 维护约定

保持 `app → features → db` 的简单方向。真实复杂度出现前不增加额外架构层。

