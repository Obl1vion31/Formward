# 饮食照片上传

POST校验会话与同源请求，调用meals/image-upload提供JSON prepare、SDK预签名和complete登记；原图从浏览器直传Private Blob，最多20 MiB，不进入函数请求体。凭据限定账号、随机路径、SHA-256、真实类型、大小及10分钟期限；完成后验证实际字节并幂等返回附件ID。沿用OIDC，不需要静态读写令牌。

旧multipart客户端仅兼容4 MiB；大图需刷新使用新版。所有响应no-store，业务与存储规则留在meals feature。
