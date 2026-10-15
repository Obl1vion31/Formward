# 饮食照片 HTTP 入口

提供登录账号的原图上传和受保护读取；校验会话和归属后调用 meals/images。原图仅进入私有 Blob，不通过 public 提供。新版私有直传限制20 MiB，支持 JPEG、PNG、WebP。
