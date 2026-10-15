# 登录后工作区

/dashboard 是总览，保留今天摘要并提供身体／摄入历史联动；measurements 为身体记录，meals 为饮食／食材及审核，ai 为授权和身体审核。页头提供总览、身体记录、饮食记录导航，邮箱旁提供 AI 接入和退出。layout 和每个页面／Server Action 分别验证会话，账号取服务端身份，不采用客户端 user_id。

page.tsx 顺序读取当前账号饮食、身体快照，委托 dashboard feature 汇总；单连接 PGlite 不并发查询。身体 actions.ts 复用 measurements，饮食 actions 调用 meals；保存和确认刷新对应详情及总览。数据加载、导航、保存共用200ms延迟反馈，失败保留草稿。

独立身体入口保留六项实测摘要、双折线图、最近记录及 Inspector；首屏实际宽度和默认区间就绪后显示图表。详细规则见各 feature README，页面不实现 SQL、营养计算或估算规则。
