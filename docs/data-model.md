# 数据模型原则

## 核心事实

首版围绕以下数据建立：

- `User`：内部账号。
- `Session`：网页登录会话。
- `AccessToken`：AI 访问令牌摘要与状态。
- `Meal`：一次进食事件。
- `MealItem`：一次进食中的食物或整餐估算项。
- `Activity`：计划或已完成的运动事件。
- `Measurement`：直接记录的体重、体脂、BMI、肌肉量等身体指标；实际字段在身体数据里程碑确定。
- `DailyStatus`：正常、放纵或无法计算等日期状态。

每日汇总和趋势属于派生结果，首版不作为独立事实来源。

## 通用字段

用户健康事实应具备：

```text
id
user_id
occurred_at
local_date
timezone
source_type
source_system
source_record_id
source_confidence
created_at
updated_at
deleted_at
```

- `source_type` 区分人工、AI、导入和外部同步。
- `source_system` 标识具体平台、设备或文件。
- `source_record_id` 用于重复识别和回写。
- `source_confidence` 表达 AI 或估算数据的不确定性，不用于伪造测量精度。

## 单位

内部使用稳定标准单位：体重 kg、营养 g、能量 kcal、时长 minute、体脂百分比。连接器负责外部单位转换，并保留必要的原始值与原始单位。

## 多生态连接

每个外部来源作为 Connector 实现，遵循：

```text
认证授权
→ 增量拉取或接收数据
→ 保存同步游标
→ 转换为统一候选记录
→ 校验与去重
→ 写入事实
→ 保存同步结果
```

首版不创建完整 Connector 表，但 schema 中的来源字段不能省略。真正接入第一个平台时，再增加连接账号、授权状态、同步游标、错误和冲突记录。

## AI 数据规则

- 外部 AI 代用户写入的记录保留 AI 操作者、用户提供的值及原始来源；不把 AI 操作等同于设备测量。
- AI 建议不自动覆盖事实数据。
- 计划变更保存提出者、依据、用户确认和生效时间。
- 任何外部或 AI 重试都应使用稳定请求或来源标识去重。
