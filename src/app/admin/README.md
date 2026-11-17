# 全站管理

`/admin`提供总览、用户、邀请、安全与操作记录。页面与Server Actions分别检查owner、动态码及5分钟内的管理验证；`/admin/users/[id]`为独立详情，保留列表返回条件。统计与AI策略在admin feature，原账号／邀请规则在auth feature，不读取健康正文。加载外壳与实际内容共享尺寸；验证到期保留未保存的策略和筛选。完整规则见[安全与全站管理](../../../docs/security-admin.md)。
