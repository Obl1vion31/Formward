# Garmin Personal 与设备数据来源

## 账号定向试运行

正式站已启用直接同步、历史补齐与独立保留相似运动；2026-11-07已载入10月18日起的21天汇总和6条真实活动，首次载入保留3条原手工运动，随后按用户明确确认清理10月27／30日的2条重复手工运动，目前保留6条设备运动与1条非重复手工运动。重复读取未创建记录或增加正式版本，日总数不叠加运动。发布与真实联调边界见[部署](deployment.md)和[维护验收](maintenance-verification.md)。

“连接设备与数据来源”位于账号菜单及账号与安全，独立地址为 `/dashboard/sources`。手机复用既有底部面板，电脑使用连接独立页。仅服务器明确配置的本人账号开放绑定、同步与历史补齐；其他账号看到“暂未开放”，继续手动记录。不能用 owner 角色或前端隐藏代替服务器资格校验。当前仅接国际站 Garmin Personal，连接代表 Garmin 账号，不虚构每块手表独立来源。

手表需先通过 Garmin Connect 上传数据；本站读取云端已有记录，不会通过刷新唤醒手表。首轮读取最近七个日历日，时区为 Asia/Shanghai。今天为累计值，不能据此声称全天最终消耗或收支；来源覆盖结束时间不是手表最后同步时间。

## 配置与凭据

初次部署复用用户已填写的 `/home/obl1vion/.config/formward/garmin-personal.env`，只读校验归属和0600权限后，把密钥绑定到已核验账号。网站以后可在“更换个人密钥”中更新；输入不存入浏览器，绑定成功即清空。更换并同步沿用当前勾选及已有手动保护。不要把密钥贴到聊天、命令行、Git、公共截图或 public。

服务器配置：

| 变量 | 用途 |
|---|---|
| `FORMWARD_DATA_SOURCE_USER_ID` | 唯一试运行账号的固定 user_id，缺失默认关闭 |
| `FORMWARD_DATA_SOURCE_ENCRYPTION_KEY` | 独立随机32字节的64位hex主密钥，用于AES-256-GCM，附加认证数据绑定账号与连接 |
| `CRON_SECRET` | 内部每日任务的独立Bearer密钥，不能用于用户接口 |

部署维护的私有主密钥副本放在用户配置目录 `data-sources-production.json`，0600且不进入源码归档。数据库只保存上游凭据密文；主密钥不可随意重建，否则已有连接无法解密。Formward 自己签发的 AI／OAuth 访问令牌仍只存不可逆摘要。

## 同步与采用

可以分别勾选总消耗、静息消耗、活动消耗、步数与运动记录。勾选是 Formward 的采集及采用策略，不会缩小 Personal API 密钥在 Garmin 的权限。适配器丢弃未选的新字段、身份、坐标与设备号，不持久化整份上游 JSON。关闭字段和暂停连接均保留已采用历史。

采用依据随同步勾选自动确定：优先官方每日总数，取消后仅在静息与活动两个分项完整时求和。标量每项只有一个采用来源，不将多设备总数、步数或活动热量相加。日总数不会再加单次运动；只有同一来源快照且分项与总数一致时展示占比。不同来源的分项须有同一日期边界，不能拼成虚假占比。

网页“连接并同步”“保存并同步”或“立即同步”一次完成授权范围内的读取和应用，不再展示七日对照或逐日保存。独立只读脚本仍不连接数据库；未激活连接的纯后台读取不代替用户连接操作。勾选项与采用来源在同一事务映射：勾选总数时使用官方总数；取消总数后只在两个分项完整时求和，单项不补零。配置成功但读取失败时保持已保存设置，只重试同步。

“补齐历史”默认从2026-10-18读取至当天，复用原官方接口及现有表。全部有效运动独立载入，按连接及activityId幂等；与手工相似也不合并、删除、阻挡或要求另行确认。旧手工记录保留来源和原编号。历史总数不同或手动保护时保留旧值与来源事实；相同日期不会因相同数值而移动记录。

手动或用户确认的 AI 修改消耗数值、步数、日期／方式或活动事实时，整天转为手动保护；备注不冻结。新来源仍可读取，但不能覆盖保护日。保护日只追加首次出现的来源运动，不覆盖人工维护的明细或复活删除项。同步完成前复核账号、连接和规则版本；旧的私有逐日采用操作仅保留兼容，不是页面流程。

## 后台任务与失败

Vercel 每日任务安排在22:00 UTC（上海次日06:00），不保证精确时刻；消费现有套餐，不增加付费升级。进入消耗页、恢复前台及手动刷新补充同步，自动前台刷新至少间隔5分钟，手动刷新至少15秒。同一连接有90秒租约；请求在事务外执行，提交前重新锁账号，核对资格、会话／访问版本、连接及规则版本。关闭、撤销、停用及设置变化使在途旧结果失效。

后续从上次成功日向前回看6天，补齐未同步间隔并接收迟到更新。活动分页不完整明确报错，已存在记录不因来源缺席被删除。失败保留正式值、上次成功时间与草稿；部分成功保存有效来源区域，不伪装成全部成功。无变化不增加正式记录版本。密钥过期需重新绑定；关闭同步不删除历史。

[Garmin Personal API 官方文档](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/)、[官方客户端](https://github.com/garmin/connect-personal-api-python)、[热量口径](https://support.garmin.com/en-CA/?faq=lkl4cwCLlK7ox362uGQEV7)、[Vercel每日调度](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs)。

## JSON 字段对应

业务 GET 返回 JSON；Personal 密钥换令牌的 POST 按官方客户端使用 `Accept: */*`，返回纯文本 JWT。固定解析结构，不依靠 AI 每次猜字段。

| 来源路径 | 单位／含义 | 正式用途 |
|---|---|---|
| `daily.data[].calendarDate` | 来源日历日 | 消耗日期，不按服务器时区移动 |
| `daily.data[].calories.burnedTotal` | kcal | 来源每日总消耗 |
| `daily.data[].calories.burnedResting` | kcal | 静息分项 |
| `daily.data[].calories.burnedActive` | kcal | 全天活动分项，已涵盖相应运动 |
| `daily.data[].movement.steps.value` | 整数步数 | 可空 steps，未知不补零 |
| `daily.data[].wellnessChronology.endTimestampGmt` | GMT时间 | 汇总覆盖结束，不能冒充设备同步时间 |
| `activities[].activityId` | 来源ID | 连接＋活动ID去重 |
| `activities[].activityName / activityType.typeKey` | 名称／类型 | 活动详情，不推断无氧程度 |
| `activities[].startTimeLocal / startTimeGMT` | 当地／UTC开始时间 | 发生时间、来源日期、时区；不把本地字符串当UTC |
| `activities[].duration` | 秒 | 转为 durationMinutes，最多4位小数 |
| `activities[].calories` | 运动gross kcal | 采用快照 sourceDetails.caloriesKcal，可能含期间静息 |
| `activities[].bmrCalories` | 期间BMR kcal | 来源快照及期间静息，不自行相减猜纯活动 |
| `activities[].averageHR / distance` | 次／分钟、米 | 采用的活动详情 |
| `activities[].isParent / parentId` | 包含关系 | 请求排除子活动，返回子项仍不重复导入 |
| `activities[].caloriesEstimated` | kJ | 暂不采用，不能当kcal |

每日响应为对象中的 data 数组；活动响应本身是数组。重复同日汇总、冲突活动ID、无效日期或不安全整数不自动择一；格式异常不覆盖上次采用。纯活动热量尚无可靠字段时保持未知，活动本次总数可从已采用快照展示。

相似运动仍独立载入并标明来源，内部关联线索不成为必须处理的任务，不要求再保存日期。源事实与采用快照分开：受手动保护而未采用的更新不能改变网页、AI查询或导出的正式事实。活动gross热量与BMR保留在快照，只读展开可查；没有可靠纯活动字段时不自行相减。

## 存储与公共健康接口

0031创建六个来源表及可空步数，0032增加活动采用快照。连接、来源事实、策略、人工保护、冲突与事件均关联账号，跨账号外键及服务验证共同生效。旧记录和值不回算；采用日总数仍保存为兼容旧应用的 total 模式，同来源分项通过采用元数据展示。

现有 HTTP／MCP 消耗查询返回可空 steps、record.adoption 与已采用活动 sourceDetails，Excel 同用采用后的计算；凭据和未采用 JSON 不进入这些接口。现有 AI 写入仍只创建待网页确认预览，不增加管理数据连接的 MCP 工具。正式发布及实际联调边界以[部署](deployment.md)和[维护验收](maintenance-verification.md)为准。

## 独立本机只读预览

`pnpm garmin:preview --serve` 仍是完全独立的离线核对入口，不加载正式数据库或写入正式／审核记录。配置示例：

```dotenv
GARMIN_PERSONAL_API_KEY="在本机编辑器填写自己的密钥"
GARMIN_PREVIEW_TIMEZONE="Asia/Shanghai"
GARMIN_PERSONAL_REGION="global"
```

省略region默认国际站 `https://personal.connectapi.garmin.com`，中国站须显式china，不跨站重试；本轮中国站没有真实联调。配置Linux0600并归当前用户，目录建议0700；不接受命令行明文密钥，令牌只在进程。`--demo` 为明确标记的虚构数据，`--config` 可指定私有配置。

业务请求20秒超时、4MiB响应上限，活动50条一页／最多1000条，重复分页或超过上限明确表示不完整。读取错误不透传响应正文、headers或原始异常。

只读工具的原始响应保存在被忽略的 `data/imports/garmin-personal-*.raw.json`；报告JSON、白名单sample与自包含HTML在 `data/exports`，均0600，不含认证响应。HTML只展示白名单健康字段，隐藏身份、GPS、自由活动名称与真实来源ID；未知字段只观察类型。报告仍属健康数据，不能当公开样本。

预览仅监听127.0.0.1随机地址，不暴露文件目录；浏览器刷新只读快照，不重新请求Garmin，Ctrl+C关闭。非serve退出码0为成功，2为局部错误，1为未生成。它不能作为手机公网地址；手机请使用正式站已认证入口。
