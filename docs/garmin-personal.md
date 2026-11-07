# Garmin Personal API 只读核对

## 当前范围

个人账号的最近七个日历日（含今天），按 `Asia/Shanghai` 或明确配置的 IANA 时区确定窗口。读取官方 Personal API 的每日 V2 汇总和分页运动列表，生成本机私有 HTML、字段观察及脱敏 JSON。当前没有自动同步、正式导入、公开 HTTP／MCP 接口、数据库变更或训练计划写入。

本阶段不会连接 Formward 数据库；生产站与已有饮食、身体、消耗记录保持独立。每日汇总不再叠加运动热量，未知不补零，原始值不因显示取整而改写。今天标记为累计值，不冒充全天最终值。来源的 `includesActivityData` 标记不等于每日活动消耗为零，也不能据此推算活动热量。

## 密钥配置

配置由当前操作系统用户持有，与代码仓库、网页及正式部署分离：

- Ubuntu：`/home/obl1vion/.config/formward/garmin-personal.env`
- Windows 编辑入口：`\\wsl$\Ubuntu-24.04\home\obl1vion\.config\formward\garmin-personal.env`
- 通用默认路径：`~/.config/formward/garmin-personal.env`

```dotenv
GARMIN_PERSONAL_API_KEY="在本机编辑器填写自己的密钥"
GARMIN_PREVIEW_TIMEZONE="Asia/Shanghai"
GARMIN_PERSONAL_REGION="global"
```

本次用户已明确使用国际站，省略 region 时采用 `global`，只向 `https://personal.connectapi.garmin.com` 发送认证和读取请求。中国站必须显式选择 `china`，对应官方 Swagger 列出的 `https://personal.connectapi.garmin.cn`；没有跨站点自动重试。中国站尚未真实联调。

Linux 配置须归当前用户所有、文件权限为 `600`；目录建议 `700`。脚本不打印密钥，不接受命令行明文密钥，不加载含正式数据库凭据的 `.env.local`。访问令牌只驻留本次进程，不落盘。配置文件、原始健康响应和报告都不应提交或放入 `public/`。

## 运行

在当前开发分支的项目根目录运行，使用 Node.js 24 和已有依赖：

```sh
pnpm garmin:preview --serve
```

脚本打印本机临时预览地址及私有文件位置。浏览器刷新只查看已生成快照，不再次请求佳明；重新执行命令才读取最新七天。服务仅监听 `127.0.0.1`，随机地址只提供该份脱敏 HTML，不提供目录、原始 JSON 或任何写入入口，按 Ctrl+C 关闭。本机地址不能当作手机可访问的公网地址。

其他方式：

```sh
pnpm garmin:preview                  # 只生成私有文件
pnpm garmin:preview --demo --serve   # 虚构数据，页面显著标注
pnpm garmin:preview --config /私有路径/garmin.env
```

认证接口按官方客户端使用 `Accept: */*`，返回纯文本 JWT；业务 GET 接口返回 JSON。不能把 Personal 认证响应当作业务 OAuth 的 `access_token` JSON。20 秒请求超时、4 MiB 单响应上限、活动每页 50 条／最多 1000 条；重复分页或达到上限明确标记未读完整。失败正文和上游异常不透传，避免它们携带凭据；认证失败不进入数据查询。不启用 `--serve` 时，退出码 0 表示生成成功且没有区域级错误，2 表示已生成含局部问题的报告，1 表示无法生成；预览服务通过 Ctrl+C 正常关闭。

## 字段对应

依据 [官方 Personal API Swagger](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/) 的 `UserDailySummaryV2DTO`、`CaloriesV2DTO`、`SummarizedActivityDTO`，以及 [官方客户端](https://github.com/garmin/connect-personal-api-python)。实际字段存在次数、类型、null、明确零及缺失关系显示在每次报告中；没有活动样本时，活动字段仅为文档依据，不算已验证。

| 来源路径 | 单位／含义 | Formward 拟用途 |
|---|---|---|
| `daily.data[].calendarDate` | 来源日历日 | 消耗记录日期 |
| `daily.data[].calories.burnedTotal` | 每日总消耗，kcal | 总数，直接采用来源值 |
| `daily.data[].calories.burnedResting` | 每日静息，kcal | 静息分项 |
| `daily.data[].calories.burnedActive` | 每日活动，kcal | 活动分项，不再加单次运动 |
| `daily.data[].movement.steps.value` | 步数 | 只读核对 |
| `daily.data[].wellnessChronology.endTimestampGmt` | 汇总覆盖结束时间 | 来源时间，不能冒充最后同步时间 |
| `daily.data[].includesWellnessData / includesActivityData` | 包含的数据类别 | 来源状态，不能据此断言全天完整 |
| `activities[].activityId` | int64 来源标识 | 后续去重；预览使用别名 |
| `activities[].activityType.typeKey` | 运动类型代码 | 活动分类，不推断无氧程度 |
| `activities[].startTimeLocal` | 无 UTC 后缀的当地时间 | 日期与来源时间 |
| `activities[].startTimeGMT` | GMT／UTC 时间，可能无 Z | UTC 发生时间；当地时间缺失时按配置时区换算并注明 |
| `activities[].duration` | 秒 | 显示分钟，不混用经过时长或毫秒 |
| `activities[].calories` | 单次运动总消耗，kcal | 仅核对；可能包含期间静息 |
| `activities[].bmrCalories` | 单次运动期间 BMR，kcal | 独立来源分项，本阶段不自动相减入账 |
| `activities[].averageHR` | 次／分钟 | 运动详情 |
| `activities[].distance` | 米 | 运动详情 |
| `activities[].caloriesEstimated` | **kJ** | 暂不采用，不能直接当 kcal |
| `activities[].isParent / parentId` | 多项运动包含关系 | 防止父子活动重复累计 |

来源可能更新结构；未知字段只列路径和类型，默认不展示其值。同日多份汇总不自动选择或合并，分项与总数不一致时保留原数并提示。读取活动时显式排除子活动，按来源 ID 去重；不将超出窗口的记录混入。来源 ID 超出 JavaScript 安全整数范围时标记待核对，原响应文本仍保留。

## 私有输出与验收

- `data/imports/garmin-personal-*.raw.json`：原始成功响应及响应文本、查询范围、区域读取结果；不包含认证响应或令牌。
- `data/exports/garmin-personal-*.report.json`：七日读数、活动、问题、字段对应与观察。
- `data/exports/garmin-personal-*.sample.json`：字段白名单样本。移除身份、位置、活动自由名称和设备号，标识替换为本次别名。
- `data/exports/garmin-personal-*.html`：自包含、无外部请求的只读预览，支持日期选择、字段搜索、深浅主题及 JSON 展开。

输出文件均 `0600`、独立命名且不覆盖之前响应。脱敏样本仍包含健康事实，供本次用户核对，不能当作公开演示数据。开发／截图演示使用 `--demo`，页面与文件均带 demo 标记。界面验收依照 [设计规范](design-reference.md)；真实联调、截图与未测范围见 [维护验证](maintenance-verification.md)。
