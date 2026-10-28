# 登录后工作区

/dashboard 为统一总览和模块入口；measurements 为身体记录，meals 为饮食／食材及审核，energy为消耗与活动记录，ai为授权和统一审核，export为当前账号Excel导出。Logo 返回总览。桌面详情显示“← 总览”和账号操作；手机页头48px，账号与退出收进更多菜单，AI接入与Excel移入独立“工具”侧栏，四个主页面显示底部导航。工具默认收起，覆盖式打开不挤正文；未开放的打卡、总结、站内AI录入只展示禁用项。审核页只保留统一保存栏，不显示四栏导航或工具入口。header.tsx管理菜单、侧栏及关闭后导航，header.module.css维护对应布局。layout、每页和 Server Action 分别校验会话，账号取服务端身份。

page.tsx 顺序读取当前账号饮食、身体与消耗快照，委托 dashboard feature 汇总；单连接 PGlite 不并发查询。身体 actions.ts 复用 measurements，饮食 actions 调用 meals，消耗actions调用activities；保存和确认刷新对应详情及总览。数据加载、导航、保存共用200ms延迟反馈，失败保留草稿。

独立身体入口保留六项实测摘要、双折线图、最近记录及 Inspector；首屏实际宽度和默认区间就绪后显示图表。详细规则见各 feature README，页面不实现 SQL、营养计算或估算规则。
