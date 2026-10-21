# Formward 项目交接

更新日期：2026-10-22。仓库`/home/obl1vion/projects/Formward`，main。先读根README、AGENTS、本文和目标目录README；改Next.js前读安装包本地指南。保留已有学习指南重写，不覆盖无关变更。

## 用户确定的口径

静息与活动直接相加，活动数字原样使用；全天总消耗覆盖最终总数，活动合计覆盖明细。不要再次引入活动扣静息或普通日常活动估算。未知留空、明确无活动才填0。公式资料默认当天生效，回溯须展示影响日期并确认。体重回退与完整规则见[消耗文档](docs/energy.md)。

总览仅保留一张综合图：D日浅蓝摄入、浅红最终消耗、金色盈余三柱并排，暖白线显示D+1晨重−D晨重。严格相邻日配对，缺记录或候选未决留空；估计开关只展示已有数据。标题与日期紧邻，图例和读数收紧，保留区间、键盘和日期详情；移除晨重基准、晨晚差及实现说明，身体详情保持原有规则。

总览、身体、摄入、消耗图形使用450ms首次可见／200ms变化动画，数字和命中区域稳定，减少动态效果即时显示。清理冗余实现说明，保留估计、未知、失败和确认信息。完成本轮后进入维护优化，不扩展训练计划、预算或佳明同步。

## 代码定位

- `src/features/activities`：model校验和纯计算、records预览／版本／幂等／确认事务与审计，energy-view／editor／CSS提供消耗界面，ai-api／ai-openapi提供共用接口。
- `src/app/dashboard/energy`：会话保护的页面和Server Action；`src/app/api/v1/energy`为只读HTTP入口。
- `src/features/dashboard`：综合图、相邻晨重配对与三张模块卡；身体详情规则独立。
- `src/features/records`：混合身体／饮食／食材／消耗审核，同一外层事务确认，旧链接和部分已保存行兼容。
- `src/components/use-chart-motion.ts`：共享原生SVG动效，悬停不重放。
- `drizzle/0019_needy_stephen_strange.sql`：5新表、统一审核2可空列与组合归属外键；先创建唯一索引再添加外键。已共享migration不能改。

协议OpenAPI1.10.0／MCP1.7.0、12工具。新增query_energy和energy:read／energy:write；旧OAuth连接不自动扩权，需重新授权，手动令牌沿用read／write。统一提交按项目检查对应权限，AI只有预览，正式保存仍由网页登录确认。

## 验证

288项单元／集成通过，包括0019迁移保持30旧表原字段值、权限撤销、跨账号、版本、重复和混合事务回滚。production build通过。统一审核专项已通过1440／1100／390／320px，含消耗混合确认、摄入占比、旧链接与草稿保护，客户端异常0。消耗专项、饮食、身体／来源／AI／加载反馈及认证／OAuth浏览器回归均通过；消耗专项包含四种宽度、优先级覆盖、编辑恢复、历史资料确认、正负柱、相邻晨重、键盘和减少动态效果。

测试使用独立PGlite、独立端口及虚构账号，不读`.env.local`真实数据库。Playwright位于`/tmp/formward-browser-check`；环境准备见tests/README.md。截图不进public，消耗截图`/tmp/formward-energy-visual/`、统一审核`/tmp/formward-records-visual/`。同一.next不同时构建和运行测试服务。

## 发布与数据

正式地址[Formward](https://formward-ten.vercel.app)，Vercel CLI手动发布；Git推送不更新网站。当前正式READY部署为`dpl_FDwUtfYN638BABnP2LoM6A5hUhR5`，功能提交`7af5bdd`，数据库0019。迁移前后30张旧表原字段和值均保持，新增5表初始为空，账本仅新增1条；报告为data/exports/energy-migration-verification-2026-10-22.json。新migration先提交版本控制，再做私有一致性备份、执行和逐表核对。

使用现有本机生产数据库配置；生产敏感变量不能从Vercel下载，不覆盖.env.local，不打印凭据。直连不可达可在单次进程改用已有pooler。备份／报告存data/exports、0600，Git与部署忽略。验收只用虚构账号，结束清理对应事实、操作、审计、令牌、会话和账号，再核对既有健康数据不变。

Private Blob保持Production-only，通过BLOB_STORE_ID与平台OIDC使用，无静态读写令牌。网页原图20MiB预签名直传，旧multipart4MiB兼容；MCP逐图返回stage／code／retryable／requestId，日志不含URL或健康内容。真实用户原图／过期链接无法靠测试恢复；已有餐次补图须id／version更新，独立pending不自动取消。

历史私有备份和正式站报告定位见[部署说明](docs/deployment.md)。食材维护保留历史营养、单位、描述快照和原始请求／审计，不能批量改写；永久删除仅网页提供，先断开引用并保留food_snapshot。

定位见[学习指南](docs/code-study.md)、[界面](docs/interface.md)、[身体](docs/measurements.md)、[饮食](docs/meals.md)、[数据库](docs/database.md)、[AI接口](docs/ai-api.md)、[当前状态](docs/status.md)。

## 正式验收结果

正式站使用两组虚构账号通过消耗录入、覆盖清空、活动编辑、删除恢复、公式资料回溯、身体／饮食／消耗混合确认、正负柱、相邻晨重、键盘、减少动态效果及1440／1100／390／320px验收，客户端异常0。所有虚构账号及所属事实、操作、审计、令牌和会话已清理。再次备份核对29张既有非限流表的原值保持、5新表为空，只有正常认证限流状态变化；全部字段结构和迁移账本与迁移后备份一致。

报告`/tmp/formward-energy-production.json`、`/tmp/formward-energy-final-http.json`；READY核对`/tmp/formward-energy-inspect.log`。Runtime error／fatal和请求5xx均0，见`/tmp/formward-energy-runtime-errors.jsonl`与`/tmp/formward-energy-server-errors.jsonl`。私有终验备份`data/exports/database-after-energy-production-2026-10-22.json`、核对`data/exports/energy-production-verification-2026-10-22.json`均0600并忽略提交。正式功能提交7af5bdd；交接文档提交独立于运行代码，Git推送不触发发布。
