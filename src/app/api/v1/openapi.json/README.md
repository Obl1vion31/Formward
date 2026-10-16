# openapi.json

公开接口协议，不含用户数据或令牌；内容由 measurements 和 meals feature 定义；当前仓库协议1.8.0包含20 MiB照片导入、附件预期、逐食物审核说明、核对状态、食量决策，以及兼容原细分类别的 reference 手动标签／成分表来源。

servers.url 在请求时由 feature 生成完整地址，公网使用 BETTER_AUTH_URL 的正式 HTTPS 域名，本机保留实际回环地址。

维护时同步接口文档与隔离测试，新业务规则留在 feature。

食材可选 category:meal／ingredient，新条目省略为 ingredient，省略更新保留原分类；查询返回分类。餐项查询返回稳定 id，编辑时以 originalItemId 引用同一餐次／版本原项。食材已永久删除的旧餐项不传 foodId 或 nutrition，服务端沿用原快照按同单位 quantity 换算；不能将已删食材用于新餐。永久删除只在网页最近删除提供，不新增 MCP 工具或 HTTP 写接口。
