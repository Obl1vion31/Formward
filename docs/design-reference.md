# MacroFactor 设计参考与 PC 方向

## 参考边界

Formward 学习 MacroFactor 如何组织高密度健康信息和降低记录摩擦，不复制其品牌、文案、图标、页面构图或视觉资产。参考结论来自 MacroFactor 官方产品页与知识库，截至 2026 年 9 月 30 日。

## 值得学习的产品设计

### 同时提供今日、每周和长期视角

MacroFactor 的营养看板把当日摄入、每日目标和一周进度放在同一组件中；Energy Balance 使用更长时间区间观察摄入与消耗；Expenditure、Weight Trend 和 Goal Progress 再提供解释性指标。

Formward 应保持同样的信息层级：

```text
现在发生了什么
→ 本周是否形成趋势
→ 长期目标是否需要调整
```

### 将事实和解释分开

MacroFactor 的看板既有 Scale Weight、Nutrition 等原始记录，也有 Expenditure、Weight Trend 和 Goal Progress 等解释结果。

Formward 页面必须区分：

- 事实：用户、设备或导入产生的记录。
- 派生值：根据明确公式计算的汇总与趋势。
- AI 判断：包含假设、不确定性和可追溯依据的建议。

三种信息不能使用相同的确定性语气。

### 让高频记录足够快

MacroFactor 通过统一 Food Logger、Plate、多入口快捷操作、常用食物和批量记录减少重复步骤。Formward 的 PC 端从手动汇总录入起步，并逐步支持：

- 全局快速记录入口。
- 键盘优先输入与搜索。
- 常用餐食、运动和模板。
- 一次提交一整餐的多个条目。
- 外部 AI 助手通过正式 API 提交候选记录，并由用户检查需要确认的写入。

### 看板可调整，但默认必须优秀

MacroFactor 允许用户隐藏和调整看板模块。Formward 首版先提供经过设计的默认布局；用户形成稳定习惯后，再增加组件显示、顺序和密度设置。

### 教练体验保持克制

MacroFactor 的 Check-In 在固定节奏中给出调整，并允许用户拒绝；其 adherence-neutral 理念关注实际行为而不是对偏离目标进行惩罚。

Formward 的 AI 教练应：

- 先解释观察，再提出动作。
- 只在答案会影响决策时提问。
- 允许拒绝、修改或延后建议。
- 不使用羞辱、夸张警报或道德化食物标签。
- 明确区分一般健身建议与需要专业人员判断的健康问题。

## PC 端信息架构

```text
┌──────────────┬──────────────────────────────────┐
│ 主导航       │ 工作区                           │
│              │                                  │
│ 总览         │ 日期与时间范围                   │
│ 饮食         │ 记录、趋势和详细内容             │
│ 运动         │                                  │
│ 身体         │                                  │
└──────────────┴──────────────────────────────────┘
```

- 左侧导航保持稳定，按用户概念命名，不暴露技术术语。
- 中央工作区使用可伸缩网格，优先呈现比较、趋势和记录详情。
- AI Coach 分析栏在形成可靠数据与教练功能后再评估，不占据首版常驻空间。
- 顶部提供日期、周期和快速记录，避免重复进入多层页面。
- 表格、图表和建议共享同一时间范围，减少上下文错位。

## 视觉方向

首页使用中央人物舞台式登录入口，具体内容与交互见 `interface.md`。进入记录工作区后的完整配色和密度在相应页面里程碑确定。

首页当前使用的颜色：

- `Graphite #10100F`：舞台背景。
- `Warm white #F0E9DD`：主要文字。
- `Gold #BEA478`：品牌点缀和主要操作。
- `Muted #A8A195`：辅助文字。
- `Line rgba(210, 194, 168, 0.32)`：表单边框。

设计约束：

- 颜色编码必须同时配合文字、图形或图案，不单独表达状态。
- 大数字只用于真正需要扫读的核心指标。
- 数据字体与正文形成层级，但不把整个产品做成工业控制台。
- 动效用于页面进入、数据更新、面板切换和确认反馈；以可追踪、简短的空间变化帮助理解操作，并支持 reduced motion。
- 图表默认显示单位、时间范围、数据缺口和来源说明。
- PC 首版必须支持键盘操作、清晰焦点和可缩放文字。

## Formward 的标志性交互

长期的核心交互是“证据链建议”：用户选中外部 AI 助手提交的建议时，工作区标出它引用的饮食、训练和身体趋势；用户能够检查证据、调整方案并确认写入。首版先保证记录和来源可追溯，不提前展示尚未实现的教练界面。

## 参考资料

- [MacroFactor Dashboard 结构](https://help.macrofactorapp.com/dashboard/consistency/)
- [MacroFactor Workouts Dashboard](https://help.macrofactorapp.com/en/articles/275-getting-to-know-your-workouts-dashboard)
- [MacroFactor Dashboard 自定义](https://help.macrofactorapp.com/en/articles/283-how-to-customize-your-workouts-dashboard)
- [MacroFactor Food Logger](https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor)
- [MacroFactor Check-In 与 Coaching Modules](https://help.macrofactorapp.com/en/articles/247-introduction-to-check-ins-and-coaching-modules)
