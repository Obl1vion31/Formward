# openapi.json

公开接口协议，不含用户数据或令牌；内容由 measurements 和 meals feature 定义；当前仓库协议1.5.0包含照片导入、附件、核对状态及食量决策。

servers.url 在请求时由 feature 生成完整地址，公网使用 BETTER_AUTH_URL 的正式 HTTPS 域名，本机保留实际回环地址。

维护时同步接口文档与隔离测试，新业务规则留在 feature。
