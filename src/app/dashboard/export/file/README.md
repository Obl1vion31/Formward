# 私有 Excel 下载

GET只接受单一from／to参数，重新验证当前会话。服务器以内存生成.xlsx附件，所有响应使用private/no-store；文件不进入public、Blob或缓存，不允许按客户端user_id切换账号。具体记录和工作表由features/exports维护。
