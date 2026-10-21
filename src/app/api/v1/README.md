# v1

身体记录 AI API 入口，Bearer 鉴权后调用 feature；接口不包含 SQL 或独立业务规则。

维护时同步接口文档与隔离测试，新业务规则留在 feature。

饮食增加foods、meals与meal-operations，沿用Bearer鉴权及64KiB限制。公开OpenAPI1.10.0同时包含身体与饮食，确认只由网页Action执行。

POST /meal-images接收ChatGPT文件引用，私有保存并返回附件ID；新草稿支持imageIds、photoReview及amountDecision。GET /foods保留兼容的presets:[]，GET /meals支持timezone并返回日期上下文。正式保存继续仅通过网页Action。

食材可选 category:meal／ingredient，新条目省略为 ingredient，省略更新保留原分类；查询返回分类。餐项查询返回稳定 id，编辑时以 originalItemId 引用同一餐次／版本原项。食材已永久删除的旧餐项不传 foodId 或 nutrition，服务端沿用原快照按同单位 quantity 换算；不能将已删食材用于新餐。永久删除只在网页最近删除提供，不新增 MCP 工具或 HTTP 写接口。

record-operations 支持身体／摄入／食材任意混合预览及状态查询，稳定 key 和 foodRef 解析集中在 records feature，返回一个确认链接。旧单类接口继续兼容。

消耗查询为GET /api/v1/energy与MCP query_energy，统一提交支持每日消耗、活动及公式资料的保存／软删除／恢复。OAuth独立energy:read／energy:write，旧连接须重新授权；手动令牌沿用read／write。规则、字段及虚构例子见[消耗文档](../../../../docs/energy.md)。
