# 身体记录页面

内部view=trend链接通过linkedTrend校验date/from/to，以同范围晨间实测进入趋势而不打开Inspector；entry优先，原date详情语义保持。

提供独立的身体记录入口，复用 measurements feature 的摘要、单一指标趋势、行内明细和录入功能。认证、加载和 Server Actions 沿用 dashboard；保存同时刷新今日总览。

page.tsx 等待并校验 searchParams 中的 date，合法 ?date=YYYY-MM-DD 打开对应日期 Inspector；普通入口不自动弹窗，非法日期忽略，账号仍来自会话。

页面先完成原有的服务端归属验证和数据读取。ChartArrivalContent在共享图形前进期间暂不挂载目标业务视图，数据读取与路由照常推进；图形到达后再挂载并接管。边界位于WorkspaceSnapshot之外，缓存内容不包含等待门，返回仍可直接使用真实快照。普通进入与减少动态效果不增加等待。
