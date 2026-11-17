# 饮食页面

内部view=trend链接通过linkedTrend校验date/from/to，对齐卡片范围且不打开日期Inspector；entry优先，原date详情语义保持。

提供饮食汇总、餐次与食材库网页入口。身份与数据归属在页面和每个 Server Action 分别校验，计算与写入调用 meals feature。初始化与 AI 预览在 review 中确认。

page.tsx 按当前 Next.js 约定等待 searchParams，校验 ?date=YYYY-MM-DD 后打开对应日期历史。非法日期忽略，不改变今天摘要；不接受 URL 账号标识。

最近删除覆盖食材与餐次。permanentlyDeleteAction 独立验证会话，调用 meals/recently-deleted.ts 的事务，再刷新饮食和总览；不在 Action 实现 SQL 或历史快照规则。

页面先完成原有的服务端归属验证和数据读取。ChartArrivalContent在共享图形前进期间暂不挂载目标业务视图，数据读取与路由照常推进；图形到达后再挂载并接管。边界位于WorkspaceSnapshot之外，缓存内容不包含等待门，返回仍可直接使用真实快照。普通进入与减少动态效果不增加等待。
