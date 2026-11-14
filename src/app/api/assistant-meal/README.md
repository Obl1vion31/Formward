# 饮食页内 AI 任务入口

私有 GET 按 taskId 恢复本人饮食识别任务；POST 处理创建、识别、补充、停止、取消、回填和人工保存。与主聊天分别保存任务状态，共用指定 owner 校验、模型授权、运行、照片和每日用量。

入口只解析协议和登录来源，业务在 assistant/meal-task。识别仅生成统一待审核预览，人工保存调用 records/web-review。所有响应 private/no-store；不能由浏览器指定供应商地址、密钥或用户身份。
