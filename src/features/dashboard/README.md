# 总览

三个独立绘图区共用日期：蓝色摄入／红色消耗并排柱、金色盈余正负柱、暖白次晨变化线。每图仅有一个左轴，整齐等距刻度覆盖全区间，不联动kcal与kg零点。相邻晨重缺测或候选未决留空；估计开关只控制体重，估算或部分摄入不阻止盈余相减。

`model.ts`负责业务聚合与严格相邻日配对；`presentation.ts`仅在服务端生成两种估计显示口径及摘要。`overview-view.tsx`和`overview-trend.tsx`只选择日期、绘图和查看详情；样式在`overview.module.css`，刻度共用components/chart-scale.ts。保留7D／30D／90D／全部／自定义、固定图宽、键盘、触屏及三张入口卡。身体详情规则保持。

网页保存和AI确认刷新总览，身份校验留在app。`model.test.ts`覆盖盈余、未知／零、相邻晨重、候选和独立刻度；浏览器见tests/energy.browser.mts。图形复用use-chart-motion.ts，数字、坐标与命中区域不动，悬停不重播。
