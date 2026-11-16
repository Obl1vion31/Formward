# Formward 项目交接

正式站[formward.top](https://formward.top)运行`dual-entry-721c7d36-energy-estimation-20261116`，源码`721c7d364283ee214cb0bb1e5cf72994cea6c711`，BUILD_ID `iUifbTa55xxFSnmeoVK6p`；北京时间2026-11-16 21:22:17切换。功能已合入推送main，后续文档提交不改变运行源码。

## 当前能力

已有采用设备事实的日期直接使用设备分项或总数，不乘活动系数。新日默认系统静息估算，计算方式可选，说明收在圆圈图标；个人资料增加可空计算用性别。活动估算和运动明细是并列、互斥的采用路径，切换保留明细和共同草稿；全天估算不叠加运动。未知活动留空，每日明确保存，历史计算固定，主动重算才更新。

计算遵循[消耗规则](docs/energy.md)：30日内各指标最近有效实测、同日晨优先；有体脂用Cunningham，否则在常规资料齐全时用Mifflin–St Jeor；指定公式不静默回退。四档1.3／1.5／1.7／1.9只乘系统静息，按总数保存，保存前核对依据版本。旧手填请求保持兼容，未知不补零，身体仅实测。

MCP2.0.2／18项、HTTP1.15.1；现有preview_energy及组合预览增加可选计算请求，共用网页服务器函数。AI计算额外要求measurements:read，普通返回只给脱敏计算摘要；确认流程、幂等、归属和版本保护保持。查询、总览和Excel说明估算来源。

## 验收与发布

lint、typecheck、806项单元／集成、production build通过。最终兼容运行包在隔离虚构数据库中通过Chromium／WebKit各19项专项、39张截图；覆盖双主题、320／390／430／1100／1440、200%文字、公式浮层、补填返回、设备分项与仅总数、采用返回、保存失败重试、历史固定、偏好及改期留稿。五主页面两尺寸两主题的正常与900ms慢读共80场景，消耗入口320×560／390×667／1440×900两引擎另6场景，稳定锚点最大偏差0 CSS px。最后草稿修正只影响切换行为，未改变这些加载槽位。

0041_energy_calculation已执行，账本40→41；原生加密备份、异机回读和隔离恢复迁移演练通过。生产迁移及切换前后60张旧表原字段、账号凭据摘要和配置保持；性别未回填。实际服务账号下，新应用就绪及旧46287cbc对新增结构兼容均通过。48项旧Server Action与绑定密钥保留，补留931项旧静态文件。正式域名、原IP和国际回源核对通过；国际网关无代码变更，沿用既有READY部署与别名。

完整兼容运行包73,240,317字节，SHA256 `9b01283dc0ee7245cc1f6ffda4bb5c5a2d66fce02fb9e530bfc12f94c8bc1772`，永久位于原入口`.codex/backups/regional-releases/energy-estimation-20261116`。立即兼容回退为`energy-form-reference-20261116`（46287cbc）；只切应用，保留0041及新记录，不恢复旧库或执行反向迁移。

私有原始证据与发布程序归档于原入口`.codex/energy-estimation-20261116`，界面图与报告位于Windows私有`C:/Users/14878/.codex/private/formward-energy-estimation-20261116`；本聊天实际Chrome截图保留在对应visualizations目录，不进入public。原始失败记录保留；测试断网恢复后撤销拦截，完整导航等待真实请求完成，不过滤错误断言。

实际Chrome已核对最新页面与返回；Chromium／WebKit不冒充真实iPhone、系统软键盘、屏幕阅读器或物理帧率验收。本轮未实测这些物理设备能力，沿用用户此前认可的键盘／视口定位策略；没有启用旧失败实验。未调用收费模型，未写正式健康测试数据，也未从聊天补填真实个人资料。

## 工作入口

日常入口仍为`/home/obl1vion/projects/Formward`。原入口24项AI未提交现场、`full-ui-review`及锁定的`main-current`归其他进行中任务；不得强行切换、清理或顺带提交。仅本聊天工作树在证据保全、合入发布后由Git移除。实时目录与进程以带核对时间的`.codex/workspace.md`为准。

继续阅读AGENTS、README、目标README及[设计与视觉验收](docs/design-reference.md)，沿用已认可方向和Mobile Design／Impeccable／既定Unslop；不因技能重新探索风格。正式发布和迁移边界遵循当前授权。
