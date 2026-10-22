# openapi.json

公开接口协议，不含用户数据或令牌；内容由 measurements 和 meals feature 定义；当前仓库协议1.11.0包含20 MiB照片导入、附件预期、逐食物审核说明、核对状态、食量决策，以及兼容原细分类别的 reference 手动标签／成分表来源。

servers.url 在请求时由 feature 生成完整地址，公网使用 BETTER_AUTH_URL 的正式 HTTPS 域名，本机保留实际回环地址。

维护时同步接口文档与隔离测试，新业务规则留在 feature。

食材可选 category:meal／ingredient，新条目省略为 ingredient，省略更新保留原分类；查询返回分类。餐项查询返回稳定 id，编辑时以 originalItemId 引用同一餐次／版本原项。食材已永久删除的旧餐项不传 foodId 或 nutrition，服务端沿用原快照按同单位 quantity 换算；不能将已删食材用于新餐。永久删除只在网页最近删除提供，不新增 MCP 工具或 HTTP 写接口。

消耗查询为GET /api/v1/energy与MCP query_energy，统一提交支持每日消耗、活动及公式资料的保存／软删除／恢复。OAuth独立energy:read／energy:write，旧连接须重新授权；手动令牌沿用read／write。规则、字段及虚构例子见[消耗文档](../../../../../docs/energy.md)。

消耗显式支持entryMode／activityMode与分项来源；日常默认动作不在新工具schema中提供。旧消耗预览刷新后遵循新规则，不能直接确认退役动作。公式独立对照，未录日期不自动生成消耗。
