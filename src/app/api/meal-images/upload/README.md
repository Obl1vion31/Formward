# 私有照片上传

GET在有效本人会话下返回当前入口默认区域及服务器配置的受控探测地址，no-store；不读取或创建照片。聊天与饮食每批并行HEAD探测，以首个可达通道继续；均失败使用入口默认，不按账号永久缓存。客户端仅提交cn／global，服务器决定地址、票据及位置；历史照片不搬迁。

POST验证同源及有效会话，委托meals feature处理prepare、签名和complete。JPEG／PNG／WebP最多8张，每张20MiB，原图一次读取后同时用于校验与上传，不缩放或重新编码。凭据绑定账号、会话、随机路径、SHA256、类型、大小及15分钟期限。complete复核实际对象，按摘要幂等返回本人附件ID；传输100%仅表示核对中。

国内COS POST与国际Private Blob官方预签名PUT共用XHR报告真实字节。总传输期限10分钟，连续60秒无新增字节结束等待；每张独立取消、重试，人工换通道仅覆盖当前批／重试，不静默重传或在中途换路。准备、传输和核对分开反馈，失败保留文字、引用及其他照片。

国内网页入口的国内直传网络故障后可人工使用此POST的application/octet-stream同源备用，x-image-upload-ticket沿用原票据。Next Proxy及Nginx上限21MiB，业务严格20MiB；备用读取10分钟、专用代理及回环上传监听660秒（主监听保持Node原期限），其他请求期限不扩大。国际原图不进入旧4MiB multipart兼容入口。完成流程再次验证会话、归属、摘要、类型及期限。prepare的私有relayAvailable仅对国内网页为true；国际网页不提供此恢复动作，服务端也拒绝其备用请求，避免20MiB原图进入受限函数请求体。国际直传仍支持10分钟，总网关普通请求期限120秒保持。

私有diagnostic只接受请求编号、受控通道、阶段、耗时、字节数、响应状态和错误分类，204不代表成功。不记录照片、文件名、原始URL、签名或凭据。读取、申请、传输、存储与核对故障分别定位。

来源校验复用auth/site-url，BETTER_AUTH_URL与可信入口为准；不接受任意代理Host。localhost／127.0.0.1只在同端口隔离验收兼容。写入拒绝缺少Origin和跨站请求，不增加MCP字段或scope。

国际直传由服务器通过Vercel官方issueSignedToken／presignUrl签发单次PUT地址，与国内共用受控XHR；不经过浏览器SDK的隐式重试或分片重传。旧blob.generate-presigned-url兼容入口保留，新增私有sign_direct步骤及sign-direct内部命令不改变外部MCP／HTTP契约。0%到100%按真实字节，存储响应后仍须核对登记。

COS跨域精确来源名单包含正式根域、海外受控别名及旧网页入口；只允许POST与Content-Type，不启用公开读写或通配来源。上线时核对实际OPTIONS及原图上传，不以服务端预检代替浏览器跨域验收。
