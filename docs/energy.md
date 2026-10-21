# 热量消耗记录

网页入口为 `/dashboard/energy`，业务在 `src/features/activities`。本功能记录用户提供的消耗，不连接佳明、不推算普通日常活动、不生成训练计划或预算。

## 每日口径

| 已填写内容 | 最终总消耗 |
| --- | --- |
| 静息 2000，完成的跑步 800 | 2800 kcal |
| 同时填当天活动合计 900 | 2000 + 900 = 2900 kcal，跑步仍保留 |
| 再填全天总消耗 3100 | 3100 kcal，不叠加分项 |
| 只有全天总数 | 直接采用，不倒推分项 |
| 清空全天总数／活动合计 | 回到静息＋活动合计／已完成明细 |

所有数字均为虚构例子。活动热量原样使用，不扣静息。未知用 `null`，明确没有活动可填 `0`；未启用默认零规则时，没有完成活动仍保持未知；用户可设置zeroActivityFrom，从该日起未录活动按0，已有未知热量明细不补零。已完成活动中任一热量未知，明细合计未知。未完成与已删除活动不参与汇总。没有总量覆盖且静息或活动缺失，总消耗为空。数值最多四位小数，热量单位 kcal、时长分钟；界面仅格式化读数。

## 静息估算

单日静息优先，其次采用用户设置的平均静息（仅restingFrom日起），两者均缺少时按 Mifflin–St Jeor：`10 × kg + 6.25 × cm − 5 × 周岁 + 性别常数`，男性参数 +5、女性参数 −161。[原始研究](https://pubmed.ncbi.nlm.nih.gov/2305711/)。该数值是静息估计，不能单独替代全天消耗。

公式资料包括身高、出生日期和公式性别参数，按生效日期选择最近一份有效资料；资料不全可直接录入静息或总消耗。当前公式限定成人 18–120 岁，资料无效不估算。

体重顺序：当天有效空腹实测 → 当天已有估计 → 过去30日内最近有效晨重。当天实测候选未决时保持空白；晚重、未来记录和过期体重不参与。查询只计算展示结果，不新增或改写身体记录。资料默认当天生效；历史保存展示起始日期并要求确认，删除／恢复资料同样明确确认。来源、体重日期、是否沿用／估计及算式在“来源与依据”中展开。

## 界面与总览

消耗页包含当天摘要、7D／30D／90D／全部／自定义历史图、每日记录、活动明细、公式资料历史和最近删除。蓝色为静息、红色为活动；录入全天总数用独立金色短线标记，只存在总数时画单色柱。保留录入分项，不按总数反算。

总览每天固定并排显示浅蓝摄入、浅红最终消耗和金色盈余（摄入−消耗），正盈余向上、负盈余向下。暖白细线对应 `D+1 晨重−D 晨重`，只配相邻两日；缺项、候选未决保持缺口。右轴 kg 与左轴 kcal 零点对齐。区间末日仍读取下一日已存在的晨重；不生成未来体重。可显示已有估计，以虚线区分。点击日期查看餐次、消耗与两日晨重，图表不作确定因果结论。

数据图形首次进入视口约450ms展开，区间变化约200ms，悬停／卡片约150ms；坐标、命中区域和真实数字不动画。减少动态效果时即时显示。

## 文件与调用

| 哪一步 | 在哪里运行 | 哪个文件／函数 | 收到什么 | 做什么 | 交给谁 |
| --- | --- | --- | --- | --- | --- |
| 1. 读取 | Next.js服务端 | `dashboard/energy/page.tsx` → `readEnergySnapshot`、`listMeasurements` | 当前会话 | 按账号读消耗与身体 | `EnergyView` |
| 2. 显示／输入 | 浏览器 | `energy-view.tsx`、`energy-editor.tsx` | 快照和用户输入 | 展示并保存表单草稿 | `saveEnergyAction` |
| 3. 校验预览 | 服务端 | `records.ts` 的 `submitEnergyOperation`、`planEnergyActions` | 身份、请求编号、动作 | 检查版本、归属、范围、重复及有效性 | 待确认操作 |
| 4. 写入 | 服务端及数据库 | `decideEnergyOperation` | 审核版本与确认人 | 事务保存事实和审计 | 返回快照，刷新消耗和总览 |
| 5. 外部读取 | HTTP／MCP服务端 | `ai-api.ts` 的 `queryEnergy` | 访问身份与日期 | 共用 `energyDays`、`restingEstimate` | JSON结果 |
| 6. AI保存 | 服务端及网页登录 | `records/operations.ts` → activities业务 | 混合items | 生成统一预览，网页确认后整体事务 | 身体／饮食／消耗事实 |

`model.ts` 是共同校验和纯计算；`energy.module.css` 负责布局，属于并列依赖，不是网络请求的一站。网页手动保存立即确认自己的操作；AI只生成15分钟预览，必须由网页登录确认。

## API 与授权

`GET /api/v1/energy?from=YYYY-MM-DD&to=YYYY-MM-DD&timezone=Asia/Shanghai` 与 MCP `query_energy` 返回日期、派生数值、依据、日记录、活动和公式资料；默认最近30日，单次最多3661日。HTTP手动令牌沿用 read／write，MCP独立 `energy:read`／`energy:write`；旧OAuth连接不自动获得新权限，需重新授权。

统一提交 `/api/v1/record-operations` 或 `submit_record_operation` 支持：

- `save_energy_day`：date、restingKcal、activeKcal、totalKcal。
- `save_activity`：date、name、durationMinutes、caloriesKcal、completed。
- `save_energy_profile`：effectiveFrom、heightCm、birthDate、sex。
- `delete_energy_day`／`restore_energy_day`、`delete_activity`／`restore_activity`、`delete_energy_profile`／`restore_energy_profile`。

每项含唯一key；编辑／删除／恢复提供id和整数version。省略保留，显式null清空可空字段。日记录与活动支持timezone、sourceSystem、sourceRecordId、sourceOccurredAt（带偏移的ISO时间）、sourceUnit:kcal。来源记录编号须同时有来源系统。同内容重试沿用operationId，改变内容不能复用。所有操作核对账号、授权撤销、审核revision和数据库快照；错误保留草稿，审计失败整批回滚。

## 存储与维护

0019 migration 新增 `energy_profiles`、`energy_days`、`activities`、`energy_operations`、`energy_events`，为 `record_operations` 增加可空消耗子操作和版本，共35张应用表。既有30表原字段和值保留。健康表均关联user_id；版本、软删除、创建／修改人及时间保存；每日有效记录／资料生效日按账号唯一，活动外部来源编号按账号唯一。完整字段见[数据库字典](database.md)。

验证入口：`pnpm test`、`pnpm test:energy-browser`。单元／集成覆盖优先级、公式、30日体重回退、未知和零、跨账号、重复、版本、撤销、回滚、软删除恢复及旧表保留；浏览器使用虚构账号与独立数据库，检查四种宽度、键盘、总览正负值和减少动态效果。


## 日常默认值与公式对照

网页“日常默认值”按账号保存平均静息、生效日期、未录活动按零的起始日期。空平均值允许继续用公式；空零值日期关闭默认零规则。该规则只是读取时补默认，不每天创建虚构的活动或静息实测。单日静息／活动合计和全天总数仍优先；早于起始日期保持原有未知。平均静息标记为估计，并在依据里注明沿用平均值。

“静息公式对照”独立使用公式资料与有效晨重，显示年龄、身高、体重日期、公式值及相对当前采用静息的差额／百分比。对照不替换记录，资料可在网页填写和修改。

日记录增加`activeEstimated`和`notes`，初始化估算活动可单独标记并保留用户依据，编辑／审核／API共用。统一提交增加`save_energy_defaults`（restingFrom、restingKcal、zeroActivityFrom）及对应删除／恢复，所有写入仍先预览、经网页登录确认，按账号、版本、请求标识和快照保护。

0020 migration新增`energy_defaults`和每日记录的`active_estimated`、`notes`，共36张应用表；旧字段和值保持，新默认规则为空，不自动给其他账号补零。`energy_defaults`的有效user_id唯一，沿用版本、软删除、创建／更新时间及energy_events审计。
