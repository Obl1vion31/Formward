# 首次使用、个人资料与教程

个人资料按本人账号云端保存身高、生日和引导进度；年龄按生日计算，体重和体脂继续归身体记录。无资料行的旧账号正常进入，新邀请及维护创建账号在同一事务中初始化待填写状态。资料保存与步骤切换校验会话、账号行锁和版本；未知保持空值。

model.ts提供表单校验与年龄；records.ts负责本人资料和引导事务；server.ts只在四个主页面检查未完成引导，不拦AI确认和OAuth。profile-form.tsx复用已认可布局；tutorial-view.tsx挂载经过核对的播放器，教程媒体与无用户数据的浏览器运行代码在public/tutorials。

管理员演练由网站后台验证owner身份，使用同样的页面组件，但不调用真实保存或修改完成状态。新菜单入口在DashboardHeader；Next.js页面和Server Actions位于app。
