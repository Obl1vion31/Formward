# 豆包授权阶段

`login` 使用已有 Formward 账号；`consent` 按实际请求展示查询与提交预览权限及处理链路；`callback` 通过官方 WebView SDK 回传短期兑换码或拒绝结果。无效、过期和未启用状态只显示错误，不创建授权。
