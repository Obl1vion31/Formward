# 完善任务验收

## 四页交互与手机核心数据（2026-10-26实施，10-27归档）

按design-reference.md的D1—D6检查实际网页，使用独立PGlite与虚构账号，未触碰真实健康数据。361项单元／集成、lint、typecheck与production build通过。新增回归覆盖有效餐次直接永久删除、当天确认失效与重试、包装食材快照／已记完保持、旧软删除规格重建、运动混合删除与审计失败回滚。

Chromium和WebKit各通过四页×7组视口：320×560、390×560、390×640、430×780、844×390、1100×900、1440×900。手机模拟34px安全区，未滚动首屏检查完整总览双图、身体体重图、摄入／消耗主图；图中文字实际≥12px、无横向溢出。逐页查看实际截图；标题、次晨读数与刻度纳入碰撞检查。触屏点击／纵向滚动、键盘固定与Escape解除、区间、自定义、历史侧栏和记全切换通过；减少动态效果及总览150% CSS放大通过。真实iOS浏览器和系统软键盘没有实机验收，不用模拟结果冒充。

AI混合审核与餐次／消耗编辑、取消、事务保存、两种营养占比、盈余与次晨对齐浏览器回归通过，覆盖1440／1100／390／320px。实际图像在.codex/unified-ui-visual/，双浏览器几何与总览报告分别为*-geometry.json及*-report.json。曾发现并修正首次SSR本地日期为空、窄屏占比按钮折行及不同滚动条宽度改变消耗图高度；保存中拒绝关闭的既有保护保留，测试等真实保存结束再关闭。

0025先纳入版本控制，再进行私有备份、生产迁移和实际索引核对；仅修改有效食材规格唯一索引，不清理或回填旧事实。正式域名https://formward-ten.vercel.app已核对READY部署dpl_2UiExPvi9DbYcmhGuYNpmHwVwXgv、运行代码c5830eb，数据库0025，分支已推送且未合入main。

主界面710055c在正式域名完成上述双浏览器四页×7组视口验收，报告.codex/unified-ui-release/production.json。之后c5830eb只修正Inspector从全部有效活动读取明细，保留未完成运动；正式Chromium／WebKit专项确认未完成项可见、标有未完成且总消耗不变。报告energy-details-production.json及*-energy-details.json与完整验收同目录。15项公共／保护入口通过；本轮验收客户端异常及请求5xx为0。虚构账号与全部所属测试数据已清理。

迁移后、主界面发布后及最终发布后均与迁移前私有备份对照40表：既有列、健康事实、原始请求、来源、审计和旧软删除数据保持，账本仅增一条；正常会话续期／授权使用元数据与限流单独排除。备份为data/exports/database-before-unified-ui-2026-10-26.json、database-after-migration-unified-ui-2026-10-26.json、database-after-primary-unified-ui-2026-10-26.json、database-after-production-unified-ui-2026-10-26.json；核对为unified-ui-after-migration-storage-verification.json、unified-ui-after-primary-storage-verification.json、unified-ui-after-production-storage-verification.json。文件0600，Git与部署忽略。


使用虚构账号验收，真实健康数据不进入截图、测试或公开报告。

## 此前总览首屏维护

统一依据为[设计与视觉验收](design-reference.md)，实施前与验收前读取同一文件。本机与正式域名均按适用条目检查，结果如下。

| 适用条目 | 核对证据与结果 |
| --- | --- |
| D1 核心事实 | 手机紧凑日期、三项能量读数与双图；其他摘要在图后，未增加基代或体脂字段，通过 |
| D2 实际首屏 | Chromium／WebKit：320×560、390×560、390×640、430×780；未滚动、模拟34px底部安全区，完整SVG和日期刻度在实际导航上方，通过 |
| D3 紧凑可读 | 轴文字至少12px且有实际字形尺寸；两图刻度及日期不碰撞；选日不移动图形区域或改坐标，通过 |
| D4 直接操作 | 悬停／移出、点击固定／换日、图外与Escape解除、范围内保留／范围外解除、自定义应用收起与取消、实际触屏点击，通过 |
| D5 事实保持 | 354项业务测试及消耗／审核回归通过；尖峰、低谷、缺测、未知、零和日完整状态保持；本轮无migration或健康计算变化 |
| D6 实际网页 | 逐张查看双浏览器视口截图；1100／1440px桌面、触屏844×390、150% CSS放大、减少动态效果通过；正式域名同样通过 |

本机图片与报告在私有.codex/overview-compact/，均为实际网页视口，不用长截图替代首屏。日志为.codex/overview-compact-*。测试工具Fontconfig曾导致WebKit SVG文字不绘制；修正系统字体别名配置后重新检查，新增SVG文字字形尺寸断言。真实iOS／微信及软键盘仍需实机复核，模拟结果不冒充实机。

lint、typecheck、354项单元／集成、production build、维护专项、消耗／手机／审核回归、四页面×四宽度图表交互通过。既有历史健康事实和规则不变；发布前后私有全库备份为database-before-overview-compact-2026-10-25.json和database-after-overview-compact-2026-10-25.json；overview-compact-storage-verification-2026-10-25.json逐项对照40表通过，原健康事实、请求、审计与结构保持，只排除正常限流和认证使用／续期元数据。文件位于data/exports，0600、Git忽略。

正式域名READY部署dpl_A9Ncxhg35CPxuN3WcMCKeVqwAt4Q、运行代码aaea8b3；数据库仍0024，无migration。正式站Chromium和WebKit同样检查七种视口、触屏点击／横屏、自定义／取消、区间内外固定、150% CSS放大和减少动态效果。已实际查看20张正式视口截图，私有路径.codex/overview-compact-release/；测试账号与所属数据清理完成。14项公共／保护入口通过，客户端异常和请求5xx为0，验收时段Runtime error／fatal为0。

## 已发布的第一批

功能提交f92f08f，正式别名READY部署dpl_GWZZQNsCyo1BHf52TLsiYsEMokki，数据库0023。337项单元／集成、lint、typecheck、production build、文档链接和受影响网页检查通过。仅授权账号截至2026-10-23的28个历史餐日初始化为已记完；空日和其他账号不处理。全库备份逐表核对，原有健康事实、原始请求和审计保持；虚构账号及所属数据清理完成。

## 此前三阶段实现与验收

| 范围 | 实际检查 |
| --- | --- |
| 总览 | 悬停、移出恢复、点击固定、另一日期切换、Escape；两餐详情默认无滚动，图片展开后加载 |
| 摄入 | 最近有记录日、明确日期优先、最近10日空行补录、50日期历史分页 |
| 录入 | 1.5份×90得到135；半包按可靠规格换算；旧总量不再乘份数；未知和0分别保留 |
| 消耗 | 已包含不加、额外增加相加、反向录入、总数变化重新核对、来源变化不重问、未知不补0 |
| 审核 | 普通单餐一次保存、缺图不阻止文字、无五项勾选；重复餐对照、取消不删除事实、整条AI删除拦截 |
| 账号与数据 | 跨账号、幂等、过期、撤销、版本冲突、事务回滚、删除恢复；人工餐次按实际保存顺序审计 |
| 视觉 | 320／390／430px手机及1100／1440px桌面；320×560矮屏；减少动态效果、长名、尖峰低谷和缺测 |

354项单元／集成、lint、typecheck及生产构建全部通过；283项本地链接及15项章节锚点、目录与diff检查通过。维护专项、原饮食、统一审核、日完整性、消耗、图表、身体完整回归、登录／OAuth、加载及Excel实际下载均通过，包含触屏横屏与跨零点。测试操作使用显式查看按钮，选择器区分编辑窗口与全站加载层，覆盖正式站较慢请求。

已人工查看实际网页截图：320px确认页可见日期、总量、前两项食物及保存按钮；1440×900两餐详情无需上下滚动。截图与机器报告保存在私有.codex/maintenance-visual/，日志在.codex/stage3-*；正式站截图和机器报告在.codex/stage3-release/。截图只反映虚构数据和所测视口，真实iPhone／微信键盘由用户最终复核。

## 此前三阶段数据与发布核对

0024只增加六个兼容列及约束；旧餐默认consumed_total，旧运动包含关系为空，沿用原结果。新migration须先纳入版本控制，再做私有全库备份、迁移和旧列／值核对。已授权包装规格以指定ID／版本维护，历史克数、营养和快照保持。正式站发布后用虚构账号复核、finally清理并再次核对旧数据。

正式域名https://formward-ten.vercel.app已核对READY部署dpl_5yW5kVWVmjozc837AaRpXeMUtgLU、运行代码83a773c，数据库0024，功能分支已推送、未合入main。正式站用虚构账号再次通过五种宽度的固定／解除日期、折叠详情、延后原图、每份与包装、运动包含关系、普通单次审核、缺图保存及减少动态效果。MCP经虚构账号OAuth授权实测1.10.0、13工具、删除限制与消耗查询；手动令牌供HTTP验证。OpenAPI1.12.0、15项公开／保护入口通过；客户端异常、请求5xx为0，验收时段最近10分钟Runtime error／fatal为0。

四份私有备份为database-before-stage3-2026-10-25.json、database-after-stage3-migration-2026-10-25.json、database-after-stage3-package-2026-10-25.json、database-after-stage3-production-2026-10-25.json。stage3-migration-verification.json、stage3-package-verification.json和stage3-production-verification.json逐项对照40表通过。仅新增六列与一次迁移账本；指定包装维护只增加一项操作与一个食材事件。旧健康事实、原始请求、来源、旧营养／克数、既有审计与权限保持，仅排除正常限流和授权使用／会话续期元数据。虚构账号、OAuth客户端及所属数据全部清理；备份和核对均在data/exports、0600，Git与部署忽略。
