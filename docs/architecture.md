# 轻量架构

## 目标

Formward 使用一个 Next.js 应用和一个 PostgreSQL 数据库完成首版。目录只表达当前真实职责，不提前建立多层抽象。

```text
页面 / Server Action ─┐
                     ├─> Feature 函数 ─> Drizzle ─> PostgreSQL
AI / HTTP API ────────┘
```

## 目录边界

### `src/app`

Next.js 页面、布局、Server Actions 和 Route Handlers。入口负责身份、输入解析、调用 feature 和返回结果，不保存完整业务规则。

### `src/features`

按用户功能组织代码：`auth`、`meals`、`activities`、`measurements`、`dashboard` 和 `imports`。网页与 AI API 必须调用相同的 feature 函数。

### `src/db`

集中保存数据库连接和 Drizzle schema。Feature 可以直接使用 Drizzle；只有出现第二种存储实现或测试替换需求时，才增加 repository 接口。

### `src/components`

保存多个页面共同使用的 UI。业务专用组件留在相应页面或 feature 附近。

### `drizzle`

保存由 Drizzle Kit 生成并纳入版本控制的 migration 历史。开发、测试和生产数据库执行同一历史。

## 依赖规则

```text
app → features → db
app → components
features 可以组合其他 feature 的公开函数
db 不依赖页面或 feature
```

- 页面和 AI API 不直接复制计算规则。
- Dashboard 调用饮食、运动和测量功能获取事实，再生成汇总。
- 导入先解析为候选记录，再调用对应 feature 写入。
- 外部连接器进入相应 feature，不直接向业务表任意写入。

## 演进条件

仅在出现具体问题后增加复杂度：

- 单个 feature 文件明显增多时，在其内部拆分 commands、queries 或 validation。
- 需要第二种数据库或内存实现时，引入 repository 接口。
- 长时间导入或 AI 任务超过 Web 请求时，引入队列和 worker。
- Python 分析成为核心并需要独立扩容时，增加推荐服务。
- 多个客户端需要独立发布节奏时，再评估拆分后端。

以上演进不改变 `app / features / db` 的首版职责。

