# 公开运行配置

`runtime.ts` 由构建准备脚本生成，仅含公开 AppID 与业务入口。AppID 的手工来源是项目根 Manifest；AppSecret、登录码和用户记录不得进入此处。原生请求与应用注册共同读取该配置。
