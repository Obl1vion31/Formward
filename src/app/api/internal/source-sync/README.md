# 数据来源每日同步

Vercel 每日调用 GET，使用 CRON_SECRET 的 Bearer 验证。账号只取服务器固定试运行账号，缺少配置即拒绝；不接受 user_id 参数。同步租约、版本与撤销复核由 data-sources 执行。端点不返回健康值、账号标识或凭据。
