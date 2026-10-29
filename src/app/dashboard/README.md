# 登录后工作区

/dashboard 为统一总览和模块入口；measurements 为身体记录，meals 为饮食／食材及审核，energy为消耗与活动记录，ai为授权和统一审核，export为当前账号Excel导出。Logo 返回总览。电脑四个主页面采用左侧72px图标文字窄栏，页头64px；手机页头48px，底部贴底显示四个图标文字入口，最右侧单独放工具。账号与退出在人像菜单内。电脑工具由屏幕右边三点把手打开，AI接入和导出页保留工具入口，手机这两页采用右下角入口。工具默认收起，覆盖式打开不挤正文；未开放的打卡、总结、站内AI录入只展示禁用项。审核页只保留统一保存栏，不显示四栏导航或工具入口。header.tsx管理菜单、侧栏及关闭后导航，header.module.css维护对应布局。layout、每页和 Server Action 分别校验会话，账号取服务端身份。

page.tsx 顺序读取当前账号饮食、身体与消耗快照，委托 dashboard feature 汇总；单连接 PGlite 不并发查询。身体 actions.ts 复用 measurements，饮食 actions 调用 meals，消耗actions调用activities；保存和确认刷新对应详情及总览。数据加载、导航、保存共用200ms延迟反馈，失败保留草稿。

独立身体入口保留六项实测摘要、双折线图、最近记录及 Inspector；首屏实际宽度和默认区间就绪后显示图表。详细规则见各 feature README，页面不实现 SQL、营养计算或估算规则。
