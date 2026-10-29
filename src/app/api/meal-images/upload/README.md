# 饮食照片上传

POST校验会话与同源请求，调用meals/image-upload提供JSON prepare、SDK预签名和complete登记；原图从浏览器直传Private Blob，最多20 MiB，不进入函数请求体。凭据限定账号、随机路径、SHA-256、真实类型、大小及10分钟期限；完成后验证实际字节并幂等返回附件ID。沿用OIDC，不需要静态读写令牌。

上传来源复用auth/site-url的校验，以BETTER_AUTH_URL配置为准；反向代理内部HTTP地址、端口和请求Host不能改变允许的来源。本机同端口localhost／127.0.0.1兼容SSH隧道验收；缺少Origin、跨站来源或错误端口均拒绝。

旧multipart客户端仅兼容4 MiB；大图需刷新使用新版。所有响应no-store，业务与存储规则留在meals feature。
