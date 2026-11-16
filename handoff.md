# Formward 项目交接

正式站[formward.top](https://formward.top)运行`dual-entry-fe2b7749-energy-clarity-20261116`，源码`fe2b77497b1d1fef1ba2bb14c2cf3f95134d9037`，BUILD_ID `MS3DKmppwRcuw_Tf8nAA1`；北京时间2026-11-17 00:17:58切换。功能已合入推送main，后续验证与文档提交不改变运行源码。

## 当前能力

每日消耗先选择帮我估算／手动输入／从设备同步。手动直接呈现同样式的静息与活动输入，支持只填已知部分；“只有总数？”切换并保留分项草稿。静息旁“估算”比较自动选择、体重与体脂、身高年龄性别三种结果，显示公式、引用值、日期与来源；选择使用后填入，手改则转人工来源并清除快照。系统估算与设备结果只读，活动估算与运动明细保持互斥、草稿及包含核对。历史计算固定，主动采用新估算才更新。

计算遵循[消耗规则](docs/energy.md)：30日内各指标最近有效实测、同日晨优先；有体脂用Cunningham，否则在常规资料齐全时用Mifflin–St Jeor；指定公式不静默回退。四档1.3／1.5／1.7／1.9只乘系统静息，按总数保存，保存前核对依据版本。旧手填请求保持兼容，未知不补零，身体仅实测。

MCP2.0.2／18项、HTTP1.15.1；现有preview_energy及组合预览增加可选计算请求，共用网页服务器函数。AI计算额外要求measurements:read，普通返回只给脱敏计算摘要；确认流程、幂等、归属和版本保护保持。查询、总览和Excel说明估算来源。

## 验收与发布

lint、typecheck、807项单元／集成及production build通过。实际兼容运行包在虚构原生PostgreSQL中通过Chromium／WebKit各23项专项、90张截图，覆盖双主题、320／390／430／1100／1440、200%文字、同级输入、三公式预览与依据、填入后手改、仅总数往返、缺资料仅存活动、0与未知、慢读改期、返回草稿、失败重试、固定历史、偏好、补填及设备。五主页面两尺寸两主题正常／900ms慢读80场景，两种记录偏好下消耗入口两引擎另12场景，稳定锚点最大偏差0 CSS px。实际Chrome验证两端、公式填入后改写、总数往返与虚构保存。

本轮不执行数据库迁移，schema0041、41项账本保持。最新原生备份、加密异机回读通过；实际服务账号下候选与旧721c7d36就绪通过。切换前后60张表原字段、账号凭据摘要和配置保持；未回填真实资料。51项旧Server Action与绑定密钥保留，补留961项旧静态文件。正式域名、原IP与国际入口核对同一版本；网关无代码变更，沿用现有READY部署和别名。

完整兼容运行包73,400,052字节，SHA256 `8091cd6ced97e812df5003ad9dc2af08e8ee206eae6127e2a752fef8a4bfbb8a`，永久位于原入口`.codex/backups/regional-releases/energy-clarity-20261116`。立即兼容回退为`energy-estimation-20261116`（721c7d36）；只回切应用，保留0041与新记录，不恢复旧库。

私有原始证据与发布程序归档于原入口`.codex/energy-clarity-20261116`，实际界面图位于Windows私有`C:/Users/14878/.codex/private/formward-energy-clarity-20261116`及本聊天visualizations目录，不进入public。原始测试失败与修正保留：PGliteSocket协议竞争改用原生隔离PostgreSQL，公式面板等待定位到真正的应用按钮，手动偏好fixture补齐必填showBodyFat；浏览器保持前台、等待完整页面流与预加载后再离开，WebKit复验无错误，未过滤错误断言；最终对应场景均重测通过。

未测试真实iPhone系统软键盘、系统文字设置、屏幕阅读器或物理帧率；沿用用户已认可的键盘／视口策略，不将Chromium／WebKit模拟记为真机通过。未调用收费模型，未写正式健康测试数据；正常设备同步保持。

## 工作入口

日常入口仍为`/home/obl1vion/projects/Formward`。原入口24项AI未提交现场、`full-ui-review`及锁定的`main-current`归其他进行中任务；不得强行切换、清理或顺带提交。仅本聊天工作树在证据保全、合入发布后由Git移除。实时目录与进程以带核对时间的`.codex/workspace.md`为准。

继续阅读AGENTS、README、目标README及[设计与视觉验收](docs/design-reference.md)，沿用已认可方向和Mobile Design／Impeccable／既定Unslop；不因技能重新探索风格。正式发布和迁移边界遵循当前授权。
