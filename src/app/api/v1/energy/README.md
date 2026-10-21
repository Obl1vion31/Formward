# 消耗查询接口

GET 读取授权账号的每日静息／活动／总消耗、公式依据、原始每日数值、活动和公式资料。支持 from、to、timezone，默认最近30日，最长10年；未知为 null。HTTP 使用独立 AI 令牌，MCP 使用 energy:read；写入统一提交 record-operations，由登录网页确认。

计算、来源和归属复用 activities feature；本目录仅负责 HTTP 入口，不直接查询 SQL 或重复计算规则。
