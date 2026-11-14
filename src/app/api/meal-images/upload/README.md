# 饮食照片上传

POST校验有效本人会话及同源请求，委托meals feature处理JSON prepare、签名直传和complete登记。国内使用私有COS，国际继续Private Blob。JPEG／PNG／WebP最多8张、每张20 MiB；原图读取一次，校验与传输共用原始字节，不缩放或重新编码，不进入public或Git。

凭据限定账号、会话、随机路径、SHA-256、真实类型、大小及10分钟期限；complete验证实际对象后幂等返回附件ID，字节上传100%不代表登记成功。COS使用XHR真实进度，120秒总期限、30秒无新增字节结束等待；取消和错误不自动重传。

国内直传网络失败、停滞或超时后，用户可手动选择“换方式上传”。该私有同源入口仍为此POST：application/octet-stream原始字节，x-image-upload-ticket携带既有session票据。Next Proxy缓冲上限与Nginx均为21 MiB，业务服务端严格限制20 MiB及120秒，复核传输前后会话、实际字节、摘要、类型与归属，再写入票据对应暂存对象，客户端继续原complete。国际不启用此恢复通道；旧multipart兼容入口仍仅4 MiB。

JSON step=diagnostic仅接收受限请求编号、阶段、耗时、字节、响应状态及错误分类，响应204；不记录文件名、照片、原始URL、签名或凭据。诊断不是业务成功回执，不影响上传结果。

允许来源复用auth/site-url，以BETTER_AUTH_URL配置为准；反向代理内部HTTP地址、端口和Host不能改变允许来源。本机同端口localhost／127.0.0.1兼容隔离验收；缺少Origin、跨站或错误端口拒绝。所有响应no-store，不新增对外MCP字段、scope或迁移。
