# 饮食记录

## 记录与汇总

`/dashboard/meals` 与身体记录并列导航。每日摘要显示已记录热量、蛋白质、碳水、脂肪；趋势图切换指标，支持7D／30D／90D／全部／自定义。桌面默认30D，窄屏及触屏默认7D。日期表展开餐次，支持新增、编辑、软删除及恢复。无记录不等于零摄入，缺项只显示已知合计并标记不完整。

| 餐项 | 内容 | 统计 |
| --- | --- | --- |
| food | 具体食物，引用食材库或直接填实际食用营养 | 各项相加 |
| misc | 杂：未单列的剩余食物，描述写备注 | 只计剩余；只有杂时代表整餐 |
| whole | 整餐估算，具体组成写备注 | 必须是本餐唯一项 |

每餐只能有一个杂项。AI分析照片先识别已单列食物，再估剩余，避免重复计算整餐。每日合计来自有效餐次的餐项，不保存独立每日事实。显式热量独立保存，不强制用三大营养素反算；未知null，真实零值可为0。

历史初始化一行一餐，每餐保存一个whole及已有四项营养，具体食物和原备注放在餐次备注；来源统一初始化、显示整餐估算。未知品牌和地点留空，初始化不创建未经核实的食材库条目。日期按原表保存，凌晨不套用身体记录的前一天规则；未知钟点不生成UTC。以后准确发生时间与时区同时提供时须与餐次当地日期一致。

## 食材与营养依据

食材库保存名称、可选品牌／规格做法、营养基准数量与单位、四项营养、依据文字和来源链接。单位可为只、块、包、碗、份、g、ml，例如每1包、每1只、每100g。选择后按同单位数量换算，保留四位小数。餐项保存当时的营养和规格快照；食材更新不自动改变历史，历史修正食量仍使用原基准。

依据为label（标签）、composition_table（成分表）、estimated（预估）、unknown（未知）。标签和成分表须附文字转录或HTTP(S)来源链接。营养依据独立于AI／人工入口，不以录入工具代替真实依据。

同账号名称、品牌、做法、基准数量和单位标准化后识别同规格；重复新增要求选择已有项或恢复。相似名称供搜索核对，不自动合并。相同日期和餐次允许多次进食；完全相同内容提示重复，明确另一次进食可仍然新增。停用与删除可恢复，历史引用保留。

## 代码和接口

| 定位 | 职责 |
| --- | --- |
| [model.ts](../src/features/meals/model.ts) | 校验、营养换算、单餐／每日合计 |
| [records.ts](../src/features/meals/records.ts) | 归属查询、预览、版本与快照保护、确认事务、审计 |
| [meals-view.tsx](../src/features/meals/meals-view.tsx)、[meals.module.css](../src/features/meals/meals.module.css) | 摘要、NutritionChart、餐次表、食材库、MealEditor／FoodEditor／EditorDialog |
| [meal-review.tsx](../src/features/meals/meal-review.tsx) | 初始化与AI审核、修订、刷新、确认及取消 |
| [imports/meals.ts](../src/features/imports/meals.ts)、[preview-meals.mts](../scripts/preview-meals.mts) | TSV只读解析、参考热量采用、初始化预览 |

MCP提供search_foods、query_meals、submit_meal_operation、get_meal_operation。HTTP对应GET foods、GET meals、POST meal-operations、GET meal-operations/{id}，协议为 `/api/v1/openapi.json`。写入action支持save_food、save_meal及delete／restore meal／food；编辑携带id＋version。引用已有食材使用foodId＋foodVersion、quantity和同unit，不另传nutrition；新食材可先save_food或在food餐项内提交foodDraft，一起预览与事务确认。

OAuth使用meals:read／meals:write，旧身体授权须重新授权取得新增权限；手动令牌沿用read／write。AI预览15分钟有效，初始化预览持续保存。刷新重新核对当前快照；授权撤销或过期阻止旧预览保存。原请求不可变、修订草稿独立，revision防覆盖，operationId绑定请求与授权并保护重试。正式保存仅由当前账号登录网页确认。

## 初始化维护

```sh
pnpm meals:preview data/imports/私有饮食.tsv
pnpm meals:preview data/imports/私有饮食.tsv --reference data/exports/私有参考.json --email 已有账号邮箱 --stage
```

默认只读核对；stage创建确认预览。参考JSON为date、mealType、description、caloriesKcal数组，仅匹配同日期、餐名与描述，用于采用标签或旧Excel显式热量，差异保留在导入批次，原文件和原值不变。同文件与参考资料重试复用批次。资料存私有data目录，测试仅用虚构数据。

机器接口及授权见[AI接入](ai-api.md)，结构与维护见[数据库字典](database.md)。
