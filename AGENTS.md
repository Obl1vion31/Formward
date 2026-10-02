# Formward 仓库协作规范

本文件适用于整个仓库。

## 工作顺序

1. 修改前阅读根目录 `README.md`、本文件和目标目录最近的 `README.md`。
2. 保留用户已有内容，不覆盖或还原不相关变更。
3. 只创建当前功能真实需要的目录、抽象和依赖。
4. 完成后运行与改动风险相称的检查，并更新受影响文档。

## 目录 README 规则

- 每个由项目团队维护的目录都必须包含 `README.md`。
- 新建目录时，在同一次变更中创建 README。
- README 说明目录目的、主要内容、与其他部分的关系和维护约定。
- `.git`、`.agents`、`.codex`、依赖、缓存、构建产物和 Drizzle 自动生成的迁移子目录属于豁免范围。

## 文档表达

- 正文使用中文，代码标识、接口名和必要术语使用英文。
- README 和说明文档直接描述当前有效状态，不依赖修改历史才能理解。
- 需求变化时重写为最终方案并删除失效内容，不使用补丁式文件名、标题或叙述。
- 产品借鉴必须提炼原则，不复制竞品文案、布局、图标或品牌资产。

## 轻量架构

- `src/app` 只负责 Next.js 页面、Server Actions 和 HTTP 入口。
- `src/features` 负责登录、饮食、运动、测量、看板和导入等业务功能。
- `src/db` 集中管理数据库连接与 schema。
- `src/components` 只放多个页面复用的界面组件。
- 网页入口和 AI API 调用相同的 feature 函数，不能各自实现一套业务规则。
- 当前不提前创建 domain、application、ports、repository、bootstrap 等分层；真实复杂度出现后在单个 feature 内演进。
- 页面和 Route Handler 不直接散落 SQL、热量计算或外部同步规则。

## 数据与 AI

- 所有用户数据关联 `user_id`，所有读取和写入校验归属。
- 外部数据保存来源系统、来源记录标识、原始发生时间、时区、单位和同步状态。
- 未知值使用空值，不使用 `0` 表示未知。
- 每日汇总只统计有效饮食和已完成运动。
- AI 使用可撤销访问令牌，不使用网页登录密码或数据库凭据。
- AI 建议应说明依据和不确定性；影响计划或历史数据的操作需要明确确认。
- AI 与人工写入保存来源、操作者和时间；删除采用可恢复的软删除。

## 文件与安全

- `public/` 中的内容会被公开访问，不存放用户上传、健康记录、密钥或内部报告。
- 原始导入文件保持不变，存放在被版本控制忽略的 `data/imports/`。
- 密码只保存安全哈希，访问令牌只保存不可逆摘要。
- 外部写入需要重复请求保护，避免客户端重试生成重复记录。
- 测试使用虚构或脱敏数据。

## 数据库与验证

- 数据库结构只通过已纳入版本控制的 Drizzle migration 演进。
- 已进入共享环境的 migration 不再修改，后续变化创建新 migration。
- 数据库和认证变化至少覆盖正常、无效、重复和跨账号访问场景。
- 技术初始化后的质量门槛为 lint、typecheck、unit/integration test 和 production build。


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
