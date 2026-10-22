# Database

## 目的

本目录集中管理 Drizzle 数据库连接和 PostgreSQL schema。

## 当前内容

- `client.ts`：通过 postgres.js 连接 Neon 或本机 PostgreSQL，按服务端进程复用连接池。创建连接池时将 Node 的单地址自动选择尝试时限设为至少 1000ms，保留进程已有的更长设置；数据库连接时限为 15 秒。默认连接池为 3，连接串的标准 max 参数可指定正整数；本地 PGlite 使用 max=1，避免其单会话多路复用协议混淆未命名 statement，Neon 保持默认。
- `schema.ts`：Better Auth 的 users、accounts、sessions、verifications 表，以及身体测量 measurements、日期与提醒状态 measurement_days、操作批次 measurement_imports、写入事件 measurement_events；所有健康表关联 user_id。数值为 numeric，保留当地时间、每次测量时区、UTC 时刻、唯一记录日期 record_date和空腹确认；空腹来源区分 `user_confirmed` 与晚间非空腹的 `evening_rule`，真实性 `record_kind` 与录入入口 `entry_channel` 独立，另存合并设备来源及估计依据／样本快照。实测与估计均允许仅体重或仅体脂，至少一个主要指标非空，不能用全空测量代表空日期；估计有效时段唯一，占位或日期时段时间的 UTC 时刻为空；写入／维护事件保存前后快照。`measurement_days` 按账号／日期唯一，保存创建人、时间和当天停止提醒状态，不进入实测统计。`measurement_imports.request_digest` 绑定录入请求内容，`initialization_metadata` 保存独立初始化模式、规则、冻结范围、策略和完整报告；部分唯一索引保证每个账号仅有一个初始化批次。

## 维护约定

`rate_limits` 是登录前按来源与认证入口维护的共享限流状态，包含 id、唯一 key、count 和毫秒 last_request；没有健康数据或用户归属。Better Auth 负责原子计数与过期清理，0010 migration 仅新增此表。

Feature 可以直接使用 Drizzle。数据库结构变化必须生成 `drizzle/` migration，并分别在开发、测试和生产环境执行。

运行配置与账号创建见 [数据库与账号接入](../../docs/auth-setup.md)。身体、饮食及对应导入已建表；消耗与活动已建表。测量缺少时区时 UTC 时刻为空；来源指标缺项不补零，软删除字段供后续恢复入口使用。网页仍使用内部邮箱密码，不启用第三方身份登录，accounts 的外部提供方令牌字段保持空值。MCP OAuth 是 Formward 向外部客户端提供的账号授权，使用独立 oauth_* 表。

`measurement_sources` 保存账号、历史来源名称、创建与最近使用时间，以及软删除时间和操作者；账号／名称唯一。0012 migration 新增 nullable deleted_at／deleted_by，保留原四列和值。来源建议删除仅影响可选列表，旧记录仍保存自己的名称快照；明确再次使用并成功保存后恢复。测量以 `device_label` 保存独立名称快照，不通过外键联动历史。主表 30 列，BMI 仅可留在原文件及既有输入／审计快照。完整连接流程、关系图、字段、约束和维护入口见 [数据库字典](../../docs/database.md)。

`ai_tokens` 保存不可逆令牌摘要、权限、过期／使用／撤销状态；`measurement_operations` 保存不可变原始请求、快照摘要、含行草稿／结果的预览、审核 revision、15 分钟到期时间及混合确认状态。所有读取与审核校验 user_id，网页逐行保存和整批事务共用 feature。结构由 0008／0009／0011 migration 演进；token_id 与 oauth_connection_id 恰有一个非空，确认复核对应授权。0011 新增 9 张 OAuth／JWKS 表，总计 21 张业务／认证表，不改变健康表数据。

OAuth Provider 的客户端、资源、授权同意、摘要令牌、刷新轮换与 JWKS 由 Better Auth 管理；oauth_connections 保存稳定、可撤销的账号连接，令牌刷新不改变预览归属。私钥加密保存，禁止公开这些表。字段、索引与迁移流程见数据库字典。

## 饮食结构

0013_meals.sql新增foods、meals、meal_items、meal_imports、meal_operations和meal_events；schema总计27表，既有21表结构与值保留。食材按同单位基准换算；餐项保留营养与食材快照，初始化整餐估算与杂使用同一汇总。组合外键校验餐项／食材／导入的账号归属，先创建唯一索引再添加组合外键。原请求、修订草稿、审核revision、授权、导入原行与审计独立保存。字段与流程见[饮食记录](../../docs/meals.md)。

0015_meal_review_images只将meal_images大小约束扩大到20 MiB，并为meal_items新增nullable review_explanation JSONB；旧值不回填。身份／份量／油酱／营养依据分别保存来源、说明和不确定性；用户在审核页修正数值时更新对应说明，原始AI内容留在审计。expectedImageCount保存在操作JSON，不改变历史事实。缺图保存的明确选择记录在meal_events快照。

0016_silly_adam_warlock 只扩展 foods_source_valid 接受 reference，供手动“标签／成分表”使用；旧来源、旧表和值保持，不新增表。当前食材规格可独立演进，历史餐项继续读取自己的营养、用量、单位、基准和版本快照。

0017_dry_pandemic 为 foods 新增 category text NOT NULL DEFAULT ingredient，CHECK 仅允许 meal／ingredient；旧字段、营养、单位和历史 JSON 不变。食材物理删除先由 feature 解除所有历史 meal_items.food_id 外键并保留 food_snapshot。

0018 新增 record_operations 统一审核批次，关联身体／饮食子操作及其审核版本，保存不可变混合请求与人工草稿。0018结构有30张业务／认证表；旧表和值保持。字段、索引和事务规则见数据库字典。

0019新增energy_profiles、energy_days、activities、energy_operations、energy_events，并为record_operations增加可空消耗关联及revision；0019结构共35张表。归属组合外键在唯一索引建立后添加；有效日记录／资料生效日期按账号唯一。字段与优先级见[消耗文档](../../docs/energy.md)和[数据库字典](../../docs/database.md)。

0020增加energy_defaults和energy_days.active_estimated／notes，当前36张应用表。默认值仅在账号明确保存后生效；旧字段值保持，原日记录新增列为false／NULL。默认规则写入复用消耗操作和审计，不创建每日事实。

0021仅为energy_days新增可空显式模式、分项来源及内部静息估算标识，原36表原字段和值保持。旧行模式为空，服务端按旧口径解释，新保存显式选择；energy_defaults仅留退役存储和审计，禁止旧预览重新启用。
