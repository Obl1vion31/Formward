# 今日总览

聚合饮食和身体事实，不拥有原始记录。model.ts 只统计当天有效餐次和截至当天的最新空腹实测；overview-view.tsx 显示四项摄入、餐次数、身体数值与实测日期、7日变化，并链接到详情。日期随设备时区及跨日更新。全天消耗和活动尚未接入，energyBalance／activities 保持 null。

网页保存和 AI 确认刷新 /dashboard；身份和数据查询在 app 入口执行，计算复用 meals 和 measurements。model.test.ts 验证日期、软删除与未知数据。
