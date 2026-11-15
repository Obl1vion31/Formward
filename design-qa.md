# 62项体验整改视觉验收

final result: blocked

当前阻止项：真实iPhone Safari键盘开合未通过；加载与录入首帧需在冻结构建重新验收。

视觉基准：C:/Users/14878/.codex/visualizations/2026/11/15/formward-experience-audit/final-A.png、final-B.png、proposal-C.png、proposal-D.png、final-followup.png。私有实际截图位于.codex/visual；同一业务／视口状态的并排比较将在候选冻结后归档。

已发现与修正：身体加载行盒高5.5px导致图表锚点偏移；构建期间修改代码造成服务端和客户端录入结构不一致，后续只验收冻结源码归档。键盘第一轮收起跳动，第二轮位置补偿尝试导致面板移出可视区域，尚未闭环。

五项审查：字体层级／包围与放大、间距与版面、主题颜色、原有图标与真实图形、业务文案，均需在最终候选逐状态通过，不能以编译或单次截图代替。
