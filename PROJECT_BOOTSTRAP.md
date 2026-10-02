# Formward 项目初始化基线

本文件固定 Formward 的技术实施边界。当前已有 Next.js 首页运行框架；账号、数据库和业务功能仍按 `docs/milestones.md` 逐步接入。开发者应先读取 `README.md`、`AGENTS.md` 和与任务相关的 `docs/` 文档，并保留已有私有数据。

## 技术栈

- Node.js 24 LTS，具体版本由 `.nvmrc` 锁定。
- Next.js 稳定版 App Router、React、TypeScript、pnpm。
- Tailwind CSS 与按需加入的 shadcn/ui 组件。
- PostgreSQL，由 Neon 托管。
- Drizzle ORM 与 Drizzle Kit migration。
- Better Auth 的邮箱/密码登录和数据库 Session。
- AI 使用 Formward 自己签发的 Personal Access Token。
- Zod 输入校验、Vitest 单元与集成测试、Playwright 端到端测试。

## 稳定结构

```text
src/app          页面、Server Actions、Route Handlers
src/features     业务功能
src/db           数据库连接和 schema
src/components   共用 UI
drizzle          migration 历史
public           公开静态资源
data             本地私有文件
docs             当前产品与技术说明
scripts          维护工具
tests            跨功能测试
```

## 初始 Features

- `auth`：账号、Session 和 AI Token。
- `meals`：饮食记录与营养数据。
- `activities`：运动记录与完成状态。
- `measurements`：体重、体脂和后续身体指标。
- `dashboard`：每日汇总和阶段趋势。
- `imports`：Excel 解析、校验、预览和确认。

每个 feature 起步时使用少量清晰文件。只有文件数量、替换实现或跨模块协作产生实际维护问题时，才在该 feature 内增加更细分层。

## 初始化完成标准

- 项目名称统一为 Formward。
- 每个项目自有目录都有 README。
- 环境变量示例不包含真实凭据。
- 本地开发数据库可通过 migration 从空库重建。
- 网页和 AI API 共享业务函数。
- 私有文件不会被 `public/` 暴露或提交到 Git。
- lint、typecheck、test 和 build 命令可运行。
