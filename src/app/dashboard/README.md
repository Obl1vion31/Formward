# 登录后工作区

`account/` 提供本人账号设置：邮箱只读、修改密码、登录设备和 AI 入口。右上角账号菜单增加账号设置，owner 另可进入站内 `/admin`；角色来自服务端验证身份。所有网页写入由会话上下文覆盖，feature 在账号行锁内再次验证，撤销后旧请求不能继续保存。

/dashboard为统一总览；measurements、meals、energy、ai、export分别管理身体、饮食、消耗、AI连接与Excel导出。Logo返回总览，电脑72px左栏、64px页头、正文左右112px对称留白；手机48px页头、贴底四栏及助手。右下角助手电脑展开400px非模态窗口，手机底部85dvh模态面板，AI／导出页也提供入口；审核、授权、首次使用与教程不提供。header仅管理入口与账号菜单，独立助手由features/assistant提供，layout按账号挂载并重置。常用功能迁入助手，旧禁用占位退出。layout、页面与Server Action分别校验会话。

page.tsx 顺序读取当前账号饮食、身体与消耗快照，委托 dashboard feature 汇总；单连接 PGlite 不并发查询。身体 actions.ts 复用 measurements，饮食 actions 调用 meals，消耗actions调用activities；保存和确认刷新对应详情及总览。数据加载、导航、保存共用200ms延迟反馈，失败保留草稿。

独立身体入口保留六项实测摘要、双折线图、最近记录及 Inspector；首屏实际宽度和默认区间就绪后显示图表。详细规则见各 feature README，页面不实现 SQL、营养计算或估算规则。
