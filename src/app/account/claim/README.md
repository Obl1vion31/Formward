# 激活与重设

浏览器从 URL fragment 读取令牌，再通过同源 Server Action 检查或提交。服务端按链接记录确定用途和目标；保存成功后移除 fragment。已有登录必须显式退出后继续。
