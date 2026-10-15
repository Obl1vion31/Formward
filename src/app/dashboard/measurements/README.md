# 身体记录页面

提供独立的身体记录入口，复用 measurements feature 的摘要、稳定尺寸双图和录入功能。认证、加载和 Server Actions 沿用 dashboard；保存同时刷新今日总览。

page.tsx 等待并校验 searchParams 中的 date，合法 ?date=YYYY-MM-DD 打开对应日期 Inspector；普通入口不自动弹窗，非法日期忽略，账号仍来自会话。
