# 登录后工作区

/dashboard 为统一总览和模块入口；measurements 为身体记录，meals 为饮食／食材及审核，energy为消耗、活动和公式资料，ai为授权和统一审核。Logo 返回总览，详情显示“← 总览”，页头仅保留账号、AI 接入和退出。layout、每页和 Server Action 分别校验会话，账号取服务端身份。

page.tsx 顺序读取当前账号饮食、身体与消耗快照，委托 dashboard feature 汇总；单连接 PGlite 不并发查询。身体 actions.ts 复用 measurements，饮食 actions 调用 meals，消耗actions调用activities；保存和确认刷新对应详情及总览。数据加载、导航、保存共用200ms延迟反馈，失败保留草稿。

独立身体入口保留六项实测摘要、双折线图、最近记录及 Inspector；首屏实际宽度和默认区间就绪后显示图表。详细规则见各 feature README，页面不实现 SQL、营养计算或估算规则。
