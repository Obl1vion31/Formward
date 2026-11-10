# 公网 HTTPS 部署

## 当前正式部署：豆包参数兼容与海外回源恢复

当前上海应用 `dual-entry-395fa322-mobile-onboarding-20261111`，源码`395fa322eef156996a1a9003b71457dd37dee3bc`，BUILD_ID `TllG814QHTC4pRj-N7WGa`，目录`mobile-onboarding-20261111`。手机首次引导任务发布的该版本已包含本次929a9d47参数修复；豆包适配、OAuth和共用MCP源码哈希相同，未覆盖另一任务的发布。

海外READY `dpl_7LC5LTzjS7zokZa6atCsrHpT5vxa`，网关代码仍为74754129，实际发布区域固定为`iad1`；`formward-ten.vercel.app`与`global.formward.top`均已核对指向该部署，257项静态文件、路由和网关代码哈希保持。

原GPT的issuer、resource、客户端和凭据保持；AppSecret仍只在上海root 0600私有配置，环境文件字节未变。参数修复基线929a9d47保留47项Server Action、原绑定密钥和285项旧静态资源；后续手机引导发布的兼容及视觉验收由对应任务记录。55表／36条migration保持，无新增健康计算、数据库迁移或正式虚构健康记录。

本人手机2026年11月10日23:53的“检查连接”已通过令牌和归属校验，但空参数工具收到两项额外字段，在SDK工具入参校验阶段失败；scope完整，刷新也成功。依据豆包平台协议，适配层只移除`from_mcp_call`与`_miniapp_permitted_data`，不使用其数据或推断身份；其他业务字段仍严格校验。隔离测试先复现旧失败、修复后通过；2026年11月11日01:02真机复测中，两项工具实际命中这两个平台字段并完成、HTTP200；用户确认连接检查与身体查询正常，原因已由真实调用闭环。

参数修复基线929a9d47的593项单元／集成全部通过，其中14项豆包／桥接专项；lint、typecheck、干净兼容production build及实际Next production HTTP双协议验收通过。带平台保留字段的连接检查与身体查询成功，非法日期、其他未知字段和无效凭据仍拒绝，健康写入0。原无隔离完整运行耗尽本机WSL内存，中断记录保留；最终按78个原测试文件串行独立运行同一套断言，未放宽检查。原生4项、此前H5尺寸与独立review保持原验收范围，不冒充本次手机查询或新视觉验收。

发布后另捕获海外回源ETIMEDOUT：上海公开入口200，海外两个别名503，原GPT复核也曾失败。固定公开版本接口的保护探针实测香港`hkg1`无法建立TCP，而美国东部`iad1`的TCP、TLS及HTTP200均通过；切换到iad1后，三入口版本一致，新旧协议发现18工具，8项公开资源SHA一致，原GPT实际get_profile恢复且为同一账号。运行日志的sin1标记不能单独当作函数实际区域；上述探针直接读取VERCEL_REGION。不据此追认更早间歇503的根因。

上海临时JSON诊断preload和本人systemd drop-in已移除，实际服务环境无探针；Vercel四个本轮候选／诊断部署已安全删除，临时保护绕过令牌已撤销，两正式别名的诊断路径即使带旧私有头也返回404。只保留不含健康内容的私有证据和兼容回退，不删除其他任务。

测试版`0.0.1-dev.20261110.2`保持，本人OpenID交换、WebView回传、绑定、换码和续期已验证。本人确认手机连接检查与最近七天身体查询正常；服务端两工具complete／HTTP200，分别5ms和126ms。无需重扫或重新授权。国服写入确认及完整真机布局未覆盖本轮。

2026年11月11日00:29上海切换成功，2538项产物逐项核对，2483项复用、55项差量；使用当日已异机加密回读校验的备份。上一应用`doubao-mcp-request-20261110`保留，应用回退只切兼容指针，不回退数据或撤销状态。网关回退须保留已验证iad1，不直接复用本次失败区域。

本轮私有证据归档至主线main-current工作区的`.codex/doubao-integration-20261111`，包含`doubao-platform-arguments-release`、`doubao-gateway-recovery`、`doubao-research`及前期平台／请求修复材料。真实手机问题已闭环，归档后清理本轮分支与临时工作区；不能公开凭据、真实UID或健康结果。后续网关发布须显式传`--regions iad1`并核对部署API和真实回源；不能只依赖本地vercel.json。

## 公开协议静态发布（2026-11-10）

[隐私政策](https://formward-ten.vercel.app/privacy.html)与[服务条款](https://formward-ten.vercel.app/terms.html)已公开，用户确认生效日期为2026年11月10日。READY为 `dpl_82o44w2e9c1xGDH3Yxep68LxP7FZ`，文稿源码38a3c611已合入推送main。以旧线上Build Output为基线，只新增两份HTML及legal.css，253个既有文件、网关函数和路由哈希不变；未切换国服业务，不涉及数据库结构或健康记录写入。

三个资源匿名HTTPS直接200、MIME与源码SHA一致、无Set-Cookie；两引擎8组公网390／1440及真实互链通过，页面异常和健康API请求均0。公开协议与下方国服应用独立发布，未授权身体接口仍401。完整范围、日期修复、68张截图、未测项与私有归档见[公开协议资料](doubao-onboarding.md)。本次没有执行旧数据库回退或创建正式测试账号。

## 保留的验收基线：浅色骨架扫光

浅色骨架验收基线为`dual-entry-04d25b30-skeleton-contrast-20261110`，源码`04d25b300dffee62f5669211beee3200c6a5880e`，BUILD_ID `fqTfJlxhDaX7x1bzy7WOH`，目录`skeleton-contrast-20261110`，改动已包含在顶部当前应用。该次只调整共用骨架颜色，没有数据库、业务计算、公开接口或加载时序变更；上海保持55表、36条migration。

浅色占位使用#D6D0C4暖灰底与90%暖白扫光，数字、卡片及图形占位共用骨架色。扫光保持1.6秒从左向右，底色与光层继续由同一圆角容器裁切。深色沿用原灰底和米色光；减少动态效果时静止显示。固定标题、图例及操作从首帧显示，真实数据原位接管。

579项单元／集成、lint、typecheck及干净production build通过。最终产物在Chromium和WebKit各20组五页面深浅主题慢加载检查通过，覆盖390×640与1440×900，固定槽位最大偏差0px；320／390／430／1440另作6组实际页面像素对照，浅色扫光中心与底色的亮度比约1.02升至1.45，深色取样点保持一致。真实扫光连续播放、数据接管及减少动态效果检查通过。

身体晨晚／体脂共用日期轴、居中图表和返回交接继续保留；Garmin双站点、原GPT授权及Blob／COS沿用既有逻辑。47项Server Action、原绑定密钥与238项旧静态资源保留，上一应用`chart-return-final-20261110`保留供兼容回退。原数据、结构、配置与OAuth安全摘要前后校验无差异。

两入口版本及新版CSS公网SHA核对通过，原OAuth issuer／MCP resource保持，匿名MCP POST为401，原协议HTML／CSS匿名200且SHA一致；本轮未重发Vercel网关。此前WebKit完整连续图形转场的未通过样本仍保留，本次骨架加载检查不代表该问题已解决；物理手机帧率及系统键盘未测。详细证据见[维护验收](maintenance-verification.md)。

发布前`formward-primary-20261110T105752238281Z.dump.json`已异机加密回读校验。候选3201就绪后切换3200，2473项相同文件复用，52项差量传输，完整2525项逐文件验证。应用、Nginx、PostgreSQL及相关timer均active。应用journal观察窗`2026-11-10T11:10:01.970471+00:00`至`2026-11-10T11:11:01.601819+00:00`共11条消息，匹配错误0条；只说明该短窗口，不代表长期或全量5xx统计。正式站未创建虚构健康记录，恢复只切兼容应用并保留合法更新。

私有记录位于workspace-flow工作树`.codex/skeleton-contrast`及服务器`/var/lib/formward/skeleton-contrast-20261110`；可展示对照与实际加载录像位于`C:/Users/14878/.codex/visualizations/2026/11/10/formward-skeleton-contrast`，使用隔离虚构数据。初版取样脚本的无效延迟参数、目标选择和取样时机诊断均保留；最终逐帧、像素与布局检查分别记录，不将中断脚本计为通过。

## 此前版本：全站静态内容与局部加载反馈（2026-11-08）

已按本会话此前明确的修改后直接发布授权更新[正式总览](https://formward-ten.vercel.app/dashboard)。READY部署dpl_Ds7qyEAu1jfhdWZyVqantWprDqkb，源码61eda5541ab7acd26a3b7e378b49a44aaac779de，构建static-loading-61eda554-20261108，来自codex/static-loading；正式别名、项目、sourceCommit／gitCommitSha及版本接口均一致，未合入或推送main。后续纯文档提交不改变正式应用。

总览、饮食、训练、消耗与身体的固定标题、操作入口、最近记录、历史入口及语义色从首帧显示，仅未知日期和数据占位。训练保留开始训练操作槽；资料、安全及连接采用200ms局部反馈，缓存命中直接接管。取消、迟到响应、真实重试、草稿和账号焦点恢复保持；根AGENTS及设计文档覆盖全站。

595项单元／集成、lint零错误零警告、独立typecheck、production build（静态生成38/38）及Vercel远程构建通过。本地Chromium／WebKit各80组布局和19组完整操作检查通过，固定锚点最大偏差1 CSS px；六组已知日期及完整记录区补查通过，实际截图和录屏已核看。正式站14项公开／保护入口通过，本轮不创建正式测试账号，登录状态与故障写入测试均限定本机隔离虚构数据库，不将本机验收冒充正式登录页面或真机验收。

发布前后0600私有备份均54表、33条migration；字段、账本、既有历史和旧审计保持；部署前的一次Garmin前台同步更新1条来源日汇总与步数，7日采用及8条新增审计的before／after逐项匹配。最终数据核对为concurrent-data-verification.json，原始严格差异保留。所有合法更新均保留，其他允许的元数据变化8项。无新增migration、公开接口、依赖或产品设置。Runtime error／fatal及请求5xx在实际观测窗口UTC 2026-11-08T10:04:36.000Z—2026-11-08T10:11:06.000Z均0，无排除区间或分页遗漏；不宣称新应用已持续运行20分钟。上一READY dpl_5LHExKEqQRyn73VJwEgm3ZbXyoop已核对保留供应用回退，不回退或删除合法用户更新。

私有证据为.codex/static-loading-release、.codex/static-loading-reviewed/chromium、.codex/static-loading-webkit-accepted/webkit和.codex/static-loading-fullpage；备份data/exports/static-loading-20261108-{before,published}.json不进入Git或部署。可展示截图、完整实录及连续导航片段位于C:/Users/14878/.codex/visualizations/2026/11/08/formward-static-loading，均为虚构验收数据。真实iPhone／Android、系统软键盘、屏幕阅读器、系统文字放大及真机帧率未测。

## 此前正式版本：训练页精简、触屏排期与完成记录删除（2026-11-08）

已按授权发布到[训练页](https://formward-ten.vercel.app/dashboard/training)。READY部署dpl_5LHExKEqQRyn73VJwEgm3ZbXyoop，应用源码a0d580b26adaa5c420a2af90cfa3169f25617a49，构建training-compact-a0d580b2-20261108，来自codex/training-entry；正式别名、项目、sourceCommit／gitCommitSha及版本接口一致。发布前确认上一正式a2ac651未发生漂移，保留动作库、GPT排期、饮食简化及其他已发布功能；未合入或推送main，后续纯文档提交不改变正式应用。

训练／消耗并入电脑原标题行与手机64px顶栏，不再占独立行。顶部按进行中、今日计划、最近完成、自由训练选择，只保留具体名称与日期状态。模板紧接开始区、默认收起，展开可看动作目标，通过手柄拖动到日历或点选排期；浮层、高亮、边缘滚动及取消保护已接通。月历位于模板下方，月度汇总在底部。完成记录的更多菜单可经明确确认永久删除，最后一场关联完成记录删除后恢复待练；同计划仍有完成记录时保持完成，完整审计与事务回滚保护保留，MCP不提供删除。

595项单元／集成、lint零错误零警告、独立typecheck、38页production build及Vercel远程构建通过。Chromium／WebKit本地各21组操作／65张截图通过，每引擎18组慢查询固定首屏锚点最大偏差0 CSS px，普通切换、缓存与返回通过。Chromium实际连续touch拖动、取消、边缘滚动及模板正文129px原生触摸滚动通过；WebKit验证原生tap与持续pointer，其测试接口不支持连续touch，不记作原生连续触摸或真机通过。真实手机、系统软键盘、屏幕阅读器和系统文字放大未测。

正式Chromium19组操作／29张截图通过，截图实际逐项复核；包含训练保存、删除取消／失败重试／刷新持久化／计划恢复、触屏拖拽、重复排期、点选替代及GPT人工修改确认。真实HTTPS OAuth PKCE MCP验证17工具、150动作、查询、请求幂等和pending预览，14项公开／保护入口检查通过，OpenAPI未暴露删除。正式站390与1440视口、普通／CDP限速网络、训练与消耗共8组加载帧采样最大偏差0px；5组观察到多帧骨架，3组训练仅1帧，完整慢查询证据以本地双引擎为准。

前后0600私有备份均54表、33条migration；逐表核对字段、账本、既有健康记录、来源、凭据与设置全部一致，无新表、migration或后台同步差异。唯一变化为正常限流元数据14→9行。两个虚构账号及45类所属表、临时OAuth客户端全部清理，无残留。Runtime error／fatal与请求5xx在实际复查窗口UTC2026-11-08T07:17:20—07:23:00均0，无排除区间或分页遗漏；不宣称自发布起持续观测。

证据.codex/training-compact-release及本地双引擎报告，备份data/exports/training-compact-20261108-{before,published}.json，均不进入Git／部署。演示截图C:/Users/14878/.codex/visualizations/2026/11/08/formward-training-compact来自虚构账号。素材、视频评估和数据集许可调研见[训练功能](training.md)，本轮未采购、接入摄像头或部署模型。上一READY dpl_eck1LqL2t7tC81Uu8pjHHXnxTkqj保留供应用回退，保留合法写入、删除审计与当前数据。

## 此前正式版本：训练动作库、GPT排期与稳定加载（2026-11-08）

已按授权发布到[训练页](https://formward-ten.vercel.app/dashboard/training)。READY部署dpl_eck1LqL2t7tC81Uu8pjHHXnxTkqj，应用源码a2ac651b4d7b5bcda137031946658d555a343e8a，构建training-library-a2ac651b-20261108，来自codex/training-entry。正式别名、项目、sourceCommit／gitCommitSha及版本接口一致。发布前检测到饮食版本更新，合并ade4f71及交接ffc1177，保留零／未知营养保存、严格重复餐轻提示及旧预览兼容；没有合入或推送main。后续纯文档提交不改变正式应用。

训练无计划只显示开始，有计划显示按计划／自由，进行中显示继续；主操作下面直接月历，消耗图表仍在消耗页。统一150项力量、有氧与拉伸动作库共用于模板和训练，支持搜索、筛选、多选、自定义及排序，记录次数／kg、秒和米；模板目标与实际完成分开。加载、设备识别及实页共用结构和槽位，月历固定六周；面板按静止位置到视口边界计算完整退出。强制加载规则已写入根AGENTS及设计文档。

MCP服务1.13.0共17工具，OpenAPI1.14.0，新增动作查询、本人模板／计划／训练查询、模板与多日排期预览及状态查询。复用record_operations JSONB、现有训练feature和统一网页确认，独立training:read／training:write；旧连接需刷新工具并重新授权。GPT提交只创建24小时预览，网页登录最终确认后才保存，不代写训练完成或热量。

合并后588项单元／集成、lint零错误零警告、独立typecheck、38页production build及Vercel远程构建通过。合并前Chromium／WebKit各15组操作／60图，合并后Chromium再验15组／60图；各18组慢查询的首屏固定锚点最大偏差0 CSS px。120张原图、合并后的关键页面及线上24图均实际查看；覆盖两主题、手机／横屏／电脑、空态／计划／进行中、失败重试、四种关闭路径及减少动态效果。真机、系统软键盘、屏幕阅读器和系统文字放大未测。

正式Chromium13组操作／24图通过，包含GPT四类动作预览、人工改目标、确认排期、正常站内进入训练及实测空值核对。真实HTTPS OAuth PKCE MCP验证17工具、150动作、查询、幂等与待确认状态。14项公网／协议保护检查通过。线上两视口、训练／消耗、普通／限速网络共8组加载过程最大偏差0px；6组观察到多帧骨架，另2组训练仅1帧骨架，完整慢查询覆盖以本地双引擎证据为准。

前后0600私有备份均54表、33条migration，字段、账本、既有健康读数、来源事实、设置与凭据一致，无新增表或migration。初次比对命中后台定时同步，逐字段及审计核实：7天采用仅版本与时间增加，before／after健康快照相同，保留8条正常同步审计和3项连接时间变化；其余差异仅限流。两个完整虚构账号、一个中断准备账号及临时OAuth客户端已清理，45类所属表及前后全表比对无残留。

Runtime error／fatal及请求5xx在实际复查窗口UTC2026-11-08T05:08:00—05:14:55均0，无排除区间或后续分页；不表示自发布起持续观测。私有证据.codex/training-refine-release，备份data/exports/training-library-20261108-{before,published}.json；此前基线、初次差异、失败与恢复记录保留。演示截图C:/Users/14878/.codex/visualizations/2026/11/08/formward-training-library全部来自虚构账号，均不进入Git／部署。

上一READY dpl_7joUqvbuPZfoQdoqPYSjRAiH5vMT保留。应用回退须兼容新增的训练记录字段、模板目标及training权限，先准备兼容版本；保留新旧记录与审计，不回退数据。


## 此前正式版本：饮食录入简化（2026-11-08）

已按授权发布到[正式饮食页](https://formward-ten.vercel.app/dashboard/meals)。READY部署dpl_7joUqvbuPZfoQdoqPYSjRAiH5vMT，应用源码ade4f71e5e2722a4b98a6a27ee6579a111cfe941，构建meal-entry-ade4f71-20261108，来自codex/meal-entry-simplify；正式别名、项目、sourceCommit／gitCommitSha、版本接口及公开allowDuplicate兼容说明已核对。基于最新正式训练应用ff08c99及交接60d302d，保留训练导航、会话和0033四表；没有合入或推送main。后续纯文档提交不改变正式应用。

饮食与食材取消历史数值倍数比较及额外确认；同日严格重复餐仅一条中性提示和查看入口，无须勾选即可保存。餐次允许全0或全部未知营养，未知不补0，全未知不冒充已知部分；空餐、非法输入、归属、版本、请求防重和草稿保护保持。旧待确认预览仅清除可识别系统提示及重复餐拦截，原请求／草稿／过期及真实错误保持；AI仍通过网页登录最终确认。消耗、运动及身体原有提醒保持。

全量73文件575项测试、最终13项专项复查、lint零错误零警告、独立typecheck、38页production build与Vercel远程构建通过。795项上传文件不含私有配置、健康材料或验收数据。13组实际操作、10组深浅尺寸检查及最终5组复查通过，覆盖320／390／430和1100／1440；未知／零保存、重复与大幅变化、失败留稿、连续点击、键盘草稿、食材编辑与旧审核已实际操作。提示实际对比深色7.43:1、浅色最低5.00:1，查看入口44px。初轮summary定位差异的原始结果及复核均保留，详见[维护验收](maintenance-verification.md)。

26项公网／授权／协议检查及公开字段兼容核对通过。Runtime error／fatal与请求5xx均0，无排除区间或后续分页；这是上线后的实际观测，不表示新应用已运行满20分钟。发布前后0600私有备份均54表、33条migration，schema、健康事实及来源事实保持；逐行核对issues0，16项允许变化仅为正常元数据，来源同步事件0。保留6条Garmin及1条非重复手工运动，没有新增migration、生产变量或正式测试账号。

证据为.codex/meal-entry-release，备份data/exports/meal-entry-20261108-{before,published}.json，均不进入Git／部署。实际截图和采样录像位于C:/Users/14878/.codex/visualizations/2026/11/08/formward-meal-entry，全部为本机独立PGlite虚构账号；测试进程已关闭。真实手机／触摸、WebKit、系统软键盘及系统文字放大未测，不计通过。上一READY dpl_rKAT7xqZmc1unBoqxqPBM3AH5tkA保留供应用回退，不回退用户数据。


## 此前正式版本：训练入口与真实训练会话（2026-11-08）

已按本轮明确“直接发布”授权上线[训练页](https://formward-ten.vercel.app/dashboard/training)。READY部署dpl_rKAT7xqZmc1unBoqxqPBM3AH5tkA，应用源码ff08c99f5ca3b3a7ef7601cb0fd2dfb868edb624，构建training-ff08c99f-20261108；正式别名、项目、源码元数据和版本接口均已核对。代码基于当前正式250a4ec及交接8342ba6，来自codex/training-entry，未合入或推送main。后续纯文档提交不改变正式应用。

主导航第三项为训练，今日训练下直接月历，不放消耗统计；原/dashboard/energy图表、设备同步、来源与录入保留，通过页内“消耗”进入。自由／模板训练、动作和组次自动保存、暂停继续、结束确认回看、空训练单独放弃、模板保存及点选／电脑拖放排期已接通。训练不自动估算或叠加热量，未知重量不补0，计划与完成分开。

569项单元／集成、lint零错误零警告、独立typecheck、38页production build、结构检查与Vercel远程构建通过。Chromium／WebKit本地各9组操作、18图通过，正式Chromium同样9组与18图通过，涵盖两主题、七种尺寸、网络失败保留输入并重试、真实保存与刷新恢复、结束回看、模板排期和消耗回归。Chrome已实际打开正式训练页，只读核看真实空态；全部写入测试限定虚构账号。手机标题被原面板把手遮挡的问题已修正并实际看图复验。

0033_training_sessions只新增训练四表，迁移前50表、迁移／发布后54表，账本由32增为33。前后私有备份逐表核对通过，既有字段和事实不变；仅普通限流元数据由4行变为6行，未豁免健康数据。两个虚构账号及45类所属数据已清理并确认无残留。备份data/exports/training-20261108-{before,migration,published}.json、证据.codex/training-release均0600／Git与部署忽略。当前来源同步及既有Garmin事实保留。

正式日志UTC2026-11-07T18:56:55—19:02:50，Runtime error／fatal及请求5xx均0，无排除区间或后续分页；这是实际观测窗口，不表示新应用已运行满20分钟。可展示截图位于C:/Users/14878/.codex/visualizations/2026/11/08/formward-training，production-entry.png为正式入口，其余为虚构验收样本。真实手机、系统软键盘、屏幕阅读器和系统文字放大未测。上一READY dpl_9d4tebN6GHjDXvNSPuLSB2Z2JzFW供应用回退；保留训练新表及所有合法写入，不回退或删除数据。


## 此前正式版本：电脑身体三卡横排（2026-11-07）

已发布到[身体页](https://formward-ten.vercel.app/dashboard/measurements)。READY部署 dpl_9d4tebN6GHjDXvNSPuLSB2Z2JzFW，应用源码 250a4ec855b5242b6d81a4b29e58a2e6882ef724，构建 body-cards-250a4ec-20261107，来自独立分支codex/body-cards-row；正式别名、项目、源码元数据与版本接口一致，没有合入或推送main。后续纯文档提交不改变正式应用。

电脑身体三张卡使用饮食／消耗同一横排网格，晨重卡略宽，数字和真实小折线并排，不再独占整行；体脂开启／关闭都保持三卡同排，空间不足整项退让。手机原有主卡／次卡构图、指标设置、统计口径、图表点选及全部编辑能力保持，骨架共用同一布局。没有新增动效、依赖、公开接口、生产变量或migration。

71文件561项测试、lint（0错误0警告）、独立typecheck、37页production build及Vercel远程构建通过；774项上传文件不含私有材料。实际10组电脑布局及3组窄屏检查通过，覆盖1100／1440／1920、深浅主题、体脂两种模式、320／390／430手机结构与指标卡切换。25项公网／授权／协议检查通过，浏览器错误、Runtime error／fatal及请求5xx均0。日志是上线后的实际观测，不表示新应用已运行满20分钟。

前后私有一致性备份均50表、32条migration，健康事实及来源事实保持，6条Garmin和1条非重复手工运动保持。逐行核对issues0，允许元数据变化7项，来源同步事件0项；真实更新按精确审计保留，未创建正式测试账号。证据为.codex/body-cards-release及data/exports/body-cards-20261107-{before,published}.json，均0600且Git／部署忽略。上一READY dpl_FRd4pBug5G73NSymfFMzyubhoDxG保留供应用回退，不反向改写用户数据。

截图及checks.json位于C:/Users/14878/.codex/visualizations/2026/11/07/formward-body-row，均为隔离虚构账号；不当作正式登录账号或真机页面验收。物理手机、真实触摸、WebKit、系统文字放大及电脑冷加载逐像素偏差本轮未实测。正式入口继续使用formward-ten.vercel.app，未修改既有自定义域名DNS。

## 此前正式版本：图表点选与电脑读数卡片（2026-11-07）

已发布到[正式总览](https://formward-ten.vercel.app/dashboard)及[饮食](https://formward-ten.vercel.app/dashboard/meals)／[消耗](https://formward-ten.vercel.app/dashboard/energy)。READY部署 dpl_FRd4pBug5G73NSymfFMzyubhoDxG，应用源码 553fbbccfea107ce06ad0b57ecbe573e31011c67，构建 chart-cards-553fbbc-20261107；正式别名、项目、sourceCommit／gitCommitSha及no-store版本接口一致。来自干净分支codex/chart-selection-cards，未合入或推送main；后续纯文档提交不改变正式应用。

修复四页把鼠标点击当悬停、移开即失去选择的问题：悬停仍临时预览，点击后保持，后续悬停及离开不取消；Escape或换区间解除，打开／关闭详情保留明确选择。身体点击后晨晚读数也保持，切换指标保留日期并建立新指标的选择。电脑饮食／消耗卡片原本仅在手机断点启用材质，现复用主页／身体的暖雾卡片、20px圆角、高光和阴影，显示真实供能环图与紧凑静息／活动比例；按全区间文字宽度稳定换列，骨架使用同一组件。手机原有卡片构图、业务表单和全部记录能力保持。

71文件561项测试、lint（0错误0警告）、独立typecheck及37页production build通过；Vercel远程构建成功，774项上传文件不含私有材料。20组实际选日／详情／键盘／区间／指标／三种关联图及数据边界检查通过；1100／1440／1920深浅主题、320／390／430窄屏点选与布局通过，浏览器错误0。25项公网／授权／协议检查通过，本轮未实际调用同步任务或创建正式测试账号。Runtime error／fatal与请求5xx均0，无排除区间或后续分页；这是上线后的实际观测，不等于已运行满20分钟。

前后0600私有一致性备份均50表、32条migration，schema、健康事实及采用的来源事实保持；6条Garmin与1条非重复手工运动保持，未复活已清理重复项。最终逐行核对issues0，9项允许变化均为正常限流，期间没有来源同步事件。没有数据库、HTTP／MCP、依赖或生产变量变化。证据为.codex/chart-selection-release与data/exports/chart-cards-20261107-{before,published}.json，均不进入Git／部署；上一READY dpl_CA9ZXvSNhX7kaaGn4C1Ti4dZKK1z保留供应用回退，保留用户合法更新。

实际截图与25帧关联进入录像位于C:/Users/14878/.codex/visualizations/2026/11/07/formward-chart-selection，均为隔离虚构账号；最多一层共享图形、结束后无浮层或隐藏目标，未以本地截图冒充正式登录账号页面。物理手机／真实触摸横拖、WebKit、系统减少动态／200%文字、真机帧率及电脑冷加载逐像素偏差本轮未实测。正式入口使用formward-ten.vercel.app，本轮未修改既有自定义域名DNS。

## 此前正式版本：主题、连接与历史同步（2026-11-07）

已发布到[正式总览](https://formward-ten.vercel.app/dashboard)及[连接设备与数据来源](https://formward-ten.vercel.app/dashboard/sources)。READY部署 dpl_CA9ZXvSNhX7kaaGn4C1Ti4dZKK1z，应用源码 a0d651715b8d1080e13a11c97456f15413b9b72c，构建 theme-sources-a0d6517-20261107；正式别名、项目、sourceCommit／gitCommitSha及no-store版本接口一致。来自干净分支codex/sources-theme-history，包含原有电脑关联交互；本轮未合入或推送main，后续纯文档提交不改变已发布应用。

顶栏日／月按钮从图标中心以450ms圆形揭示新主题，跟随系统为账号菜单单个开关；不刷新页面、重挂载表单或丢失滚动。连接入口直接进入电脑独立页／手机底部面板；只保留设备、最近读取、立即同步、内容勾选与保存并同步、换密钥及按需历史补齐。勾选直接采用同一Garmin来源，七日对照和再次采用流程退出。页面／面板骨架共用正式结构，冷加载实测前后偏差0px；消耗详情只保留一次来源与步数，今天为“今日已消耗”。

已正式载入2026-10-18—2026-11-07共21天汇总与6条Garmin活动；首次载入独立保留3条原手工运动；随后按用户明确授权清理10月27／30日的2条重复手工运动，目前保留6条Garmin和1条非重复手工运动。清理没有改变日消耗或设备采用状态，详见维护验收。6条真实活动的类型、本地／UTC时间、时长、gross热量、BMR、距离和平均心率均非空，已核验采用快照。21日计算均等于每日汇总，不再叠加运动；原日编号和备注保持。第二次读取新增活动、正式日版本变化、运动版本变化及写入通知均0。同一activityId稳定对应同一条记录。

仅原固定本人user_id可同步，其他账号只有未开放入口；没有新增账号、连接或生产虚构数据。后台继续UTC22点（上海次日约6点），进入／恢复消耗页补读至少隔5分钟，手动15秒保护；手表先通过Garmin Connect上传，本站不能主动唤醒手表。配置保存后读取失败明确区分，只需重试读取，已有手动保护继续生效。

70文件556项测试、lint（0错误0警告）、独立typecheck及37页production build通过，Vercel远程构建成功。773项上传文件不含私有数据、凭据、环境或验收材料。26项公网／授权／协议检查通过，内部任务为fresh。Runtime error／fatal与请求5xx均0，无排除区间或后续分页；这是新部署上线后的实际观测，不表示新版本已运行满20分钟。

本地Chromium实际检查320／390／430与1100／1440／1920深浅主题、圆形中间帧、来源冷加载、慢／失败保存、草稿及两个账号门禁，保存截图和按采样时间编码的完整录像。正式登录账号网页未代验，本地截图均为隔离虚构账号；真实活动联调依据正式服务与数据库，不冒充真机视觉验收。物理iPhone、系统键盘／VoiceOver／200%文字、原生减少动态切换及本轮WebKit未实测。

发布前／载入后／发布后私有一致性备份均50表、32条migration，schema及旧迁移不变；没有migration、生产变量或公开HTTP／MCP变更。逐行核对只允许精确来源审计对应的本人写入和正常限流，最终issues为0；没有笼统豁免本人健康表，用户合法更新保留。证据为本工作树.codex/theme-sources-release，0600备份为data/exports/theme-sources-20261107-{before,imported,published}.json，均不进入Git／部署。上一READY dpl_BKvm6vCXWqHAwgaSUUbuK1iBsNVT保留供应用回退，不反向删除健康数据。正式入口使用formward-ten.vercel.app，本轮未修改global.formward.top的既有DNS配置。

## 此前正式版本：本人账号 Garmin 数据源（2026-11-07）

已按授权发布到[设备与数据来源](https://formward-ten.vercel.app/dashboard/sources)。READY部署 dpl_BKvm6vCXWqHAwgaSUUbuK1iBsNVT，应用源码 4c96a4cf1b640f15357f8642e9f7d60cc5a95e4a，构建 source-pilot-4c96a4c-20261107；项目、正式别名、sourceCommit／gitCommitSha与no-store版本接口一致。来自干净分支codex/garmin-personal-preview，已包含最新桌面交互161057a，本轮没有合入或推送main；其他工作区保持。后续纯文档提交不改变已发布应用。

仅私有固定user_id对应的本人账号开放Garmin Personal绑定、同步、七日对照和采用，配置缺失默认关闭；owner角色不自动获权。其他账号同步设置／安全入口，进入只有“暂未开放”，继续原有手动功能。国际站密钥已从0600本机配置绑定，账号／连接AAD与独立AES-256-GCM主密钥加密；凭据、主密钥和原始上游JSON不返回浏览器或AI。

真实来源读取成功：最近七天总消耗、静息、活动和步数各7日非空；当前活动为0条。正式采用为0，原消耗和错日记录没有自动移动或覆盖。用户须在页面核对11月6／7日及其他日期差异，再确认采用。采用以后按已选来源同步，手动事实变更保护整天，备注不冻结；运动及步数不再加到设备日总数。

每日后台任务已在Vercel项目实际登记，路径/api/internal/source-sync、UTC 0 22 * * *（上海每日早间，平台调度不保证精确分钟）；本轮凭据验证请求为fresh、只返回状态。首次未来定时触发尚未发生，不计为实测通过。前台进入／恢复至少5分钟，失败保留旧数据、上次成功时间和草稿。

68个文件544项单元／集成、lint（0错误0警告）、独立typecheck及37页production build通过；Vercel远程构建成功。769项上传文件不含环境、凭据、私有数据或本机验收材料。26项公网／保护／协议检查通过，包括未登录来源页跳转、既有健康接口和导出401、MCP challenge、私有路径404、内部任务缺失／伪造密钥401及伪造账号参数400。

本地已检查两个隔离虚构账号、深浅主题及320／390／430／1100／1440×780，保存87帧实际操作序列和按时间编码的面板录像。首次确认、运动冲突、手动保护、失败／慢响应、草稿与暂停／恢复均通过。正式环境未创建测试账号或虚构健康记录；真实登录账号网页未代验，不能将本地截图当作正式账号页面实测。真实活动仍为空，活动字段及冲突仅虚构样本覆盖；物理iPhone、系统键盘／VoiceOver／200%文字／减少动态切换及本轮WebKit未测。

发布前后私有一致性备份核对通过：44→50表，仅新增6表及两个可空兼容字段；旧字段、旧行与30条原迁移保持，新增0031／0032。新来源行仅属于本人账号，4项允许变化仅为正常限流，健康事实例外为0，issues为空。没有生产验收数据需清理，用户合法更新保留。证据为本工作树.codex/source-release，备份为data/exports/source-pilot-20261107-{before,migrated,published}.json，均0600并被Git／部署忽略。

最终日志查询Runtime error／fatal与请求5xx均0，无排除区间或后续分页；这是新部署上线后的实际观测，不代表已运行满20分钟。上一READY dpl_8J4m5x2QYWUsGD1fPcTjzNpHvFNm保留供应用回退；不反向删除新表或回滚用户合法更新。正式入口使用formward-ten.vercel.app，global.formward.top的既有DNS问题未在本轮修改。设计规则见D13，字段与配置见[Garmin接入](garmin-personal.md)，完整实际验收见[维护验收](maintenance-verification.md)。

## 此前正式版本：电脑关联交互与 Inspector（2026-11-07）

用户在本地验收后明确要求直接发布，已部署到[正式总览](https://formward-ten.vercel.app/dashboard)。READY部署 `dpl_8J4m5x2QYWUsGD1fPcTjzNpHvFNm`，应用源码 `161057a0e53c348009dfab46c9e3b849a5bedca1`，构建 `desktop-linked-161057a-20261107`；项目、正式别名、sourceCommit／gitCommitSha、版本接口及客户端JS一致。来自 `codex/desktop-linked-interactions` 干净提交，本轮未合并或推送main，其他工作区保持。后续纯发布记录提交不改变正式应用。

电脑总览三张真实七日趋势卡前置，双端共用日期／区间／指标链接及一次300ms图形交接；电脑关联图区最大640px，返回恢复卡片、滚动、焦点和总览区间／估计选项。保留完整双图、六项读数、七日统计和区间摘要。Inspector标题直接排列在面板底色，桌面圆弧及把手占位退出；手机外壳保持。营养测量随实际组件挂载，手机／电脑切换不再空图；骨架高度、字体、刻度和真实数据平面匹配。

固定源码独立导出后重新通过505项单元／集成、lint（0错误0警告）、独立typecheck、production build和结构检查，Vercel远程构建成功。738项上传文件不含私有资料、环境文件或本机验收材料。18项公开／保护／协议检查与客户端版本检查通过；正式Chromium／WebKit各12组深浅首页、三类完整往返、18次尺寸切换、两种编辑器及三种触屏往返通过，页面异常和5xx各0，共46张截图。实际核看桌面／手机、关联趋势及普通／身体自定义Inspector。完整范围与原始失败见[维护验收](maintenance-verification.md)。

发布前后44表结构、30条迁移账本和既有健康事实保持，issues为空；独立虚构账号及36张所属表已按ID清理。仅正常限流及一行显示偏好版本更新经精确核对放行：九条缓存均在部署创建前过期，偏好最终选项不变，仅version及updated_at改变，与对应时段Windows网页成功请求及现有会话写入规则相符；前后备份及该行哈希绑定，不豁免健康表。私有0600备份与初核／最终核对在原主工作区 `data/exports/desktop-linked-20261107-*`，发布证据为本工作树 `.codex/desktop-linked-release`。

最终Runtime窗口2026-11-07T08:00:17.860Z—08:20:17.860Z、请求窗口08:00:19Z—08:20:19Z，error／fatal与5xx均0，无排除区间或后续分页；初轮日志也保留。没有migration、API／MCP、依赖或生产环境变量变化。上一READY `dpl_9KYWuxTQUQDTchCYXW8RBtt4oB4c`保留供应用回退，保留用户合法数据。

正式入口使用formward-ten.vercel.app。global.formward.top虽已绑定相同Vercel部署，本机与Cloudflare公共DNS查询均返回NXDOMAIN，未计实际访问通过；本轮未修改DNS。真实iPhone、系统键盘、VoiceOver、系统200%文字及真机帧率未测。实际截图位于 `C:/Users/14878/.codex/visualizations/2026/11/07/formward-desktop-linked-production`，全部为虚构数据。

## 此前正式版本：消耗改期与主导航（2026-11-07）

已按用户授权发布到[正式总览](https://formward-ten.vercel.app/dashboard)。READY部署`dpl_9KYWuxTQUQDTchCYXW8RBtt4oB4c`，应用源码`6f0a2f64e6d17c1513199561f0d5f7fb3fe6d14b`，构建`date-navigation-6f0a2f6-20261107`；formward-ten.vercel.app与global.formward.top、源码元数据、版本接口和客户端JS一致。来自codex/energy-date-navigation的干净提交，736项上传文件不含私有数据、环境文件与本机工具；未合入或推送main，原主工作区的国内基础设施修改保持隔离。后续纯文档提交不改变正式应用。

消耗改期按原编号、原日期及版本核对，禁止采用目标日另一编号；日汇总与原日运动同批移动，日期相关包含关系重新核对。目标日已有日记录或运动时不合并，失败保留草稿并说明原因；响应中断沿用原请求编号，成功同时确认原日与目标日变化。窄编辑区日期／时区分行，原生日期控件、16px输入和44px触控保持。四模块普通导航按顺序200ms轻横移并淡变，手机16px、电脑12px；骨架替换不重播，图形关联、录入及详情不叠加，顶栏和导航稳定。

504项单元／集成、lint、独立typecheck、本地与正式production build及目录结构检查通过；18项公开／保护／协议检查和客户端版本核对通过。本地15段与公网6段有效全程录像均结束后至少500ms无旧内容闪回；普通导航每个目标只启动一次，图形关联不叠加。饮食与消耗慢响应下可见骨架的日期、读数和图表槽位最大偏差0.1126 CSS px（扣除共同正文位移，隐藏节点不计）。12组深浅表单、12组1100／1440／1920px电脑四模块布局通过，正文中心最大误差0.00004px。

发布前后44表结构、30条迁移账本及全部既有健康事实保持，issues为空。临时虚构账号及36张所属表已精确清理；公网改期单独核对原编号、原值、时区及备注不变，无重复记录。15项变化仅为认证使用／续期与限流元数据；初核额外3项为两条已过期限流缓存清理和一次退出限流，按已安装Better Auth清理规则、实际时间与精确行哈希逐条核对，初核报告保留，不宽泛豁免健康表。私有0600备份与核对为原主工作区data/exports/date-navigation-20261107-*，发布证据为.codex/energy-date-navigation-release。最终20分钟Runtime error／fatal及请求5xx均0，无排除区间与后续分页。没有migration、公开HTTP／MCP、依赖或生产环境变量变化。上一READY `dpl_3cJVUyukZMA7PsN3SbRQrCtT2Nrc`保留供应用回退，保留用户合法更新。

实际截图、逐帧位置及录像位于C:/Users/14878/.codex/visualizations/2026/11/06/01a1af0c-e81b-7cd2-84c9-9702574d032c/date-navigation；public-time-fields.png、public-desktop-final.png、public-overview-meals.mp4和public-date-move-save.mp4可直接核看，内容均虚构。视频按实际采样时间编码、不插帧，只作偶数像素编码补边，不作为真机帧率证明。

物理iPhone／WebKit、真触屏横屏指针、系统软键盘／VoiceOver、系统200%文字、现场系统减少动态效果切换及真机帧率未实测，不计为通过；减少动态效果与取消清理由控制器测试覆盖。浏览器标签及临时视口已清理，临时账号已退出。

## 此前正式版本：底部面板与记录任务（2026-11-07）

已按用户授权发布到[正式总览](https://formward-ten.vercel.app/dashboard)。READY部署`dpl_3cJVUyukZMA7PsN3SbRQrCtT2Nrc`，应用源码`aa2036827d8bcf79f35f61fee1c3475abcbc431d`，构建`record-modes-aa20368-20261107`；正式别名、源码元数据、版本接口和客户端JS一致。从codex/record-modes干净提交导出732项文件，私有数据、环境文件及本机工具未上传；未合入或推送main，原主工作区国内基础设施改动未参与发布。后续纯文档提交不改变正式应用。

手机底部面板标题取消独立胶囊、弧线和内高光，拖动区底色连续，键盘焦点局限小把手；每日消耗按钮仅显示保存，完整目标日期独立显示并保留可访问名称。身体、消耗、饮食和食材详情均只读，外部列表统一编辑实底／查看次级；维护能力留在编辑任务，单餐保存回到当天编辑。小助手待核对明确进入intent=edit，同地址再次打开及三类entry录入均可重开一个外壳、一个表单。电脑保留现有侧栏。

lint、独立typecheck、493项单元／集成及本地／正式production build通过，18项公开／保护／协议检查通过。本地35组深浅／窄屏／横屏只读检查，查看前后24表219行完全一致；食材双端编辑入口、四类保存、失败留稿重试、草稿和删除取消已实测。12组隔离及9组公网有效全程序列中最多一个面板，退出后至少500ms无重现；初次同地址问题修复另有对照，保存未关完前发出的无效食材点击样本不计通过。公网四类详情无表单或维护控件，食材真实保存、320／390／430px日期和44px保存、1440px电脑600px侧栏通过，浏览器error为0。

本轮没有数据库结构、migration、公开HTTP／MCP、依赖或生产环境变量变化。发布前后44表、30条迁移账本及既有健康事实核对通过，issues为空；虚构账号及36张所属表已精确清理。13项预期认证限流／授权使用／会话元数据变化留有私有哈希，新增退出登录桶仅按本次核对的精确行接受，初核与审计均保留。最终20分钟Runtime error／fatal及请求5xx均0，无排除区间或后续分页。0600备份与核对在原主工作区data/exports/record-modes-20261107-*，发布证据在.codex/record-modes-release。上一正式READY dpl_Byhdr9JFnWkxTtkuooqoRXVK2CCm保留供应用回退，保留用户合法更新。

实际截图、逐帧位置和录像位于C:/Users/14878/.codex/visualizations/2026/11/06/01a1af0c-e81b-7cd2-84c9-9702574d032c/record-modes；public-energy-editor.png、public-desktop-final.png及public-energy-editor-cycle-close.mp4可直接核看，样本均虚构。视频按实际采样时间编码、不插帧，仅为兼容编码补至偶数像素，不作为真机帧率证明。物理iPhone／WebKit、系统软键盘／VoiceOver、系统200%文字及现场系统减少动态效果切换未实测，不计通过。浏览器标签和临时视口已清理，验收账号已退出。

统一规则见[设计与视觉验收](design-reference.md)，具体检查见[维护验收](maintenance-verification.md)。

## 此前正式版本：暖雾材质与手机交互（2026-11-06）

用户已查看实际页面并明确要求发布公网，以便在手机实际操作。正式总览https://formward-ten.vercel.app/dashboard已指向READY部署`dpl_91NTmbnYDMzWo8jddqkGfnuEzebS`，应用源码`166f715831d734a9694102158bef3cebec9a8921`，构建`mobile-warm-166f715-20261106`。项目、正式别名、sourceCommit／gitCommitSha与版本接口一致；从codex/mobile-workspace的干净提交导出部署，上传清单695项，不含私有数据、环境文件或本机工具。main未合并或推送，国内部署、COS、DNS及其他未提交内容保持隔离；项目未连接Git自动部署。

本轮包含暖雾深浅主题、B真实数据横带、同级记录动作、摄入／晨重共享图形转场、底部详情与完整记录入口，保留真实小助手及原有业务。电脑同步配色和控件。技术门槛467项单元／集成、lint、typecheck及本地production build通过，正式远程构建成功；18项入口／保护／协议检查通过。正式手机与桌面实际页面、虚构保存、助手及外观已核对，材质对照页在正式登录后404。实际视口、截图和未测项见[维护验收](maintenance-verification.md)。

发布前后43表结构、29条迁移账本与既有健康事实、请求及审计保持；独立虚构账号及35表所属数据已清理。认证限流仅8条过期缓存删除、5条本轮登录／发现请求缓存新增、1条发现请求计数／时间刷新，逐行哈希、路由与时间界定留档，未宽泛忽略健康表。备份与核对`mobile-warm-20261106-{before,after,verification}.json`在原主工作区私有data/exports，0600且Git／部署忽略；初始严格差异报告保留。最终部署20分钟Runtime error／fatal及请求5xx均0，无排除区间、无后续分页。

没有数据库迁移、公开HTTP v1／MCP、AI权限、运行依赖或生产配置变化。本地视觉对照开关未进入生产变量。应用回退基线保留上一READY `dpl_HFeRzEVLnECg3wbReUGhEZ2gzgAP`（0a566c1）；只回退应用，保留用户合法记录和审计。后续纯发布记录提交不重新部署。

## 此前正式版本：饮食详情精简与输入对齐（2026-11-05）

正式饮食页https://formward-ten.vercel.app/dashboard/meals指向READY部署`dpl_HFeRzEVLnECg3wbReUGhEZ2gzgAP`，应用源码`0a566c184b72edc072bf35592661fd22397a9cd0`，构建`meal-details-0a566c1-20261105`；项目、正式别名、sourceCommit／gitCommitSha及版本接口已核对。main统一本轮已发布应用与验收记录，纯测试／文档提交不代表另一次应用部署；Vercel项目未连接Git自动部署。原主工作区双区、COS、DNS及未提交内容保持隔离。

饮食与总览共用SavedMealList，只保留当天一个供能环图。展开餐次隐藏摘要，保留一次三项宏量与完整食物清单；食物的营养、来源和依据原位展开，备注／照片按需打开，打开附件后请求原图。每餐环图、百分比、中间重复热量块和来源数量退出；编辑／更多在餐末，添加一餐／已记全在全部餐次之后，总览只保留一个饮食跳转。手机读数按完整内容切换四列／2×2／极窄一列，触屏横屏全宽，固定滚动条空间，日期标题按完整文字块换行。 餐次编辑器表内10px内距优先于通用12px默认值，手填／下拉单位与表头内容边缘实测偏差由2px降至0px，输入16px与44px点击范围保持。布局测量同时包含实际控件文字、补足的小数位及待修改的长输入，使用真实字体与内距；空间不足切换布局，聚焦／失焦后复测，不改写输入、计算、精度或保存规则。助手窗口与主图表保持现有布局。

干净源码通过lint（0错误0警告）、typecheck、465项单元／集成、production build和结构检查。正式Chromium／WebKit各60种新详情、28组原详情及12组边界、6组展开、缩放与真实记全／编辑／删除取消通过；完整编辑器每引擎20组输入场景、15组气泡和12组独立食材库，含包装换算、旧精度及AI审核通过。十段教程每引擎实际播放与跳转通过；AI及补录四片与封面／预览已更新，其余六片和全部旧媒体保留，16个新媒体完整SHA256、8项Range及19项入口／协议检查通过。

六个虚构账号及34表所属数据已按明确ID清理；43表结构、29条迁移账本与既有健康事实核对通过，最终issues为空。私有快照`meal-details-20261105-before.json`、`-after.json`及`-verification.json`位于原主工作区data/exports，0600且Git／部署忽略。正式最终部署日志窗口2026-11-05T09:48:47.000Z—2026-11-05T10:20:01.000Z，Runtime error／fatal与请求5xx均0，无排除区间及后续分页。

真实iPhone、系统软键盘、原生全屏和系统级文字放大未测；浏览器模拟与CSS缩放分别记录。正式实际截图位于`C:/Users/14878/.codex/visualizations/2026/11/05/formward-meal-details-production`，全部自动化样本为虚构数据；已在Chrome实际打开正式饮食日期详情核看展开效果。私有证据`.codex/meal-final-release`，首次失败保留在`.codex/meal-publish/production-initial`，完整技术说明见维护验收。

本轮无数据库迁移、公开HTTP v1／MCP或AI权限变化。发布前的应用回退基线为READY `dpl_A9LrFGGKCuzrSnqfa43ve2hRcecK`（9307ed6）；只回退应用，保留用户合法更新和审计。正式应用绑定0a566c1，后续纯测试／文档提交不会重建部署。

## 此前正式版本：小助手与总览（2026-11-05）

按用户本轮明确授权发布并统一main。正式总览https://formward-ten.vercel.app/dashboard指向READY部署`dpl_A9LrFGGKCuzrSnqfa43ve2hRcecK`，应用源码`9307ed63ca11c67a51b19839ce08971232a84e96`，构建`assistant-9307ed6-20261105`；项目、正式别名、sourceCommit／gitCommitSha及版本接口核对通过。代码从main的6142fb9独立开发，main包含本次已发布应用及发布验收记录；原主工作区的双区、COS、DNS和未上线修改保持隔离。后续纯测试／文档提交不改变该应用部署；项目未连接Git自动部署。

电脑右下角非模态助手、手机底部面板替换工具，提供每日最多一次且有事项才出现的两日核对、补录和真实操作入口；总览新增区间摘要及每批50日的缺口展开。身体和总览的估计标识、读数说明共同参与稳定布局，真实鼠标切换实测／估计时各配置位置变化≤1px；更新两段AI教程，保留旧媒体。只读`/api/assistant-context`仅用网页会话，无数据库migration、公开HTTP v1、MCP或AI授权范围变更。

部署前从9307ed6导出干净源码重新通过465项单元／集成、lint（0错误0警告）、typecheck、production build和目录结构检查；`.impeccable/`已加入部署忽略，实际上传清单不含私有资料。正式Chromium／WebKit各31组、46张截图全部通过，客户端异常与非预期5xx均0；19项入口／协议检查及8个更新媒体文件完整SHA256校验通过。实际核看正式电脑、手机截图，完整视口与未测项见[维护验收](maintenance-verification.md)。

发布前后私有备份`assistant-20261105-before.json`、`assistant-20261105-after.json`及`assistant-20261105-verification.json`位于主工作区`data/exports`，0600且Git／部署忽略。43表结构、29条迁移账本及既有健康事实保持；期间已有账号正常新增一笔经网页确认的AI餐次、4食物项、1照片及一次OAuth续期，已按操作、审计和成功HTTP请求核实，仅放行由两份快照哈希绑定的精确新增行及旧令牌两项轮换字段，issues为空。两个虚构账号及34表所属数据已清理，正常用户写入保留。

日志窗口2026-11-05T04:48:26.000Z—2026-11-05T05:17:07.000Z，Runtime error／fatal及请求5xx均0，无排除区间、无后续分页。私有证据在本工作区`.codex/assistant-release`，最终正式报告为`production/chromium-final/report.json`与`production/webkit-final/report.json`；正式截图位于`C:/Users/14878/.codex/visualizations/2026/11/05/formward-assistant-production`。立即应用回退基线为上一READY部署`dpl_HfTwrwJYqBCdnA4YTcA3GMfHVdiV`（ff4357a）；保留用户合法写入及审计。

## 本次开发起点（2026-11-05）

用户已明确要求先统一并推送main。main从a9988ea快进至最新正式发布分支codex/detail-disclosure的8760792，包含此前已上线的餐次、来源、密码、录入、图表及详情展开改动与验收记录；后续仅补充本次基线说明。应用源码仍与正式ff4357a一致，本次不产生新的应用发布。

本次重新通过459项单元／集成、typecheck与production build；统一后的main工作区lint为0错误、0警告。应用目录、公开素材、构建脚本、依赖及Next配置与ff4357a逐项无差异，沿用该版本已有正式视觉验收。

后续功能从统一后的main建立工作分支。原主工作区codex/mainland-server-preparation及其未提交内容保留，双区、COS、DNS和未上线迁移不随本次进入main。小助手与总览已按本文当前正式版本交付。

## 此前正式版本：详情信息取舍与原位展开（2026-11-05）

正式域名https://formward-ten.vercel.app指向READY部署dpl_HfTwrwJYqBCdnA4YTcA3GMfHVdiV，应用源码ff4357a7fc141d5865f2d2b03a081da5bc719ec0，构建detail-disclosure-ff4357a-20261105；正式别名、项目、sourceCommit／gitCommitSha和版本接口已核对。该版本已发布，后续按用户要求统一到main；main包含截至8760792的全部已上线变更与验收记录，主工作区双区／COS／DNS等未上线内容保持隔离。

饮食餐次收起只显示餐次、热量和最多一行食物摘要；完整名称、营养和依据在同一餐展开后查看。运动收起保留本次总数、运动／期间静息分项和短计入状态，时长、来源与完整包含解释原位展开；编辑随记录展开，删除放本条更多并保留原确认。当天合计到餐次及各餐的结构横线保持，未改计算、原精度、未知／0、包含关系、数据库结构或公开接口。信息取舍和展开层级已纳入设计D12、AGENTS及共同技能约束。

459项单元／集成、lint无错误、typecheck、production build、结构和319处文档链接通过；原第三方Unslop脚本的1项既有lint警告保留。正式Chromium／WebKit各28组常规页面、12组边界，含深浅主题、320／390／430px、矮屏／横屏及1100／1440px；另验长数值、200%页面缩放和各6组展开／更多／删除取消。确认已记全、编辑后失效、原值1190保持、空白新增、键盘和Escape通过；WebKit操作再重复一轮通过。实际核看正式手机／电脑收起及展开截图。真实iPhone、系统软键盘、原生全屏及系统级文字缩放未测。

首轮正式操作回归及独立诊断捕获WebKit请求取消：测试在Server Action附带重验证流结束前刻意整页重开，取消了预取及一次仍收尾的POST。已按请求／导航／错误时间定位，验证脚本改为保存与整页重开前等待networkidle，保留全部异常断言；应用未为此变更。完整两引擎重跑和WebKit重复通过，原始失败、诊断事件与最终结果均保留，不将失败组计入通过。

发布前后私有一致性备份detail-disclosure-20261105-before／after.json及verification.json位于主工作区data/exports、权限0600且Git／部署忽略。43表结构及29条迁移账本保持，原已存健康条目、请求和审计对照通过，issues为空；期间真实录入、记全确认及授权续期已按对应操作、审计与成功请求逐项核实，仅为快照哈希绑定的精确行／字段放行，保留用户合法更新，未对健康表整体豁免。3个本轮虚构账号及34表所属数据已清理，含首轮与诊断账号。正式日志窗口2026-11-04T16:51:53.000Z—2026-11-04T17:10:53.000Z：Runtime error／fatal和请求5xx均0，无排除区间或后续分页。

私有证据.codex/disclosure-release；正式实际截图C:/Users/14878/.codex/visualizations/2026/11/05/formward-disclosure-production/final，含review.html。立即回退基线是上一READY dpl_CAopGdr6YKGyFL7kpustjnSpUK1c（ce3a141）；仅回退应用，保留用户合法写入及审计。正式应用绑定ff4357a，后续验证脚本／文档提交不代表新的应用部署。小助手当前状态见本文开头。


## 此前正式版本：详情层级与图表100ms（2026-11-05）

已按用户指定顺序完成两次发布：先图表3d0d415，再详情ce3a141。正式域名https://formward-ten.vercel.app现指向READY部署dpl_CAopGdr6YKGyFL7kpustjnSpUK1c，应用源码ce3a1410c029e876b9d0727f249cf49ee7e37ee5，构建detail-hierarchy-ce3a141-20261105；正式别名、项目及sourceCommit／gitCommitSha均已逐项核对。main保持a9988ea8996706d548a0ee6e9999455da3ab4d0c，未推送、合并或带入主工作区双区／COS／DNS等改动。

饮食日期详情明确“当天合计”，保留四项同排、下方占比及总量到餐次／各餐之间的结构横线；删除常驻催确认及保存后重复追加说明。餐次12px单层间距、44px展开、状态标记与底部添加／已记全保持。消耗日期只在标题显示，摘要12px、数字上距4px／行高1.2、单位同行，长值整项退让；查看样式不影响填写预览。极窄有效宽度和200%页面缩放可自然纵向阅读。计算、原始精度、未知／0和运动包含关系未改。

458项单元／集成、lint无错误、typecheck、production build、结构和237处文档链接检查通过；原第三方Unslop脚本保留1项既有lint警告。独立PGlite入口可复现。正式Chromium／WebKit各28组常规页面、9组边界，以及展开、320px长值和200%页面缩放检查通过；两引擎真实确认已记全、编辑后失效、名称还原、空白新增退出、键盘／Escape与1190保持通过。实际查看正式手机和电脑深浅主题截图，客户端异常及请求5xx为0。

一项虚构账号及34表所属数据已清理。43表结构、29条迁移账本、原健康事实／请求／审计保持。严格对照最初拦下正常OAuth续期；已结合现有客户端、账号、会话、连接、同范围权限和原部署token端点200日志逐项核实，仅为该次新增刷新令牌／防重放记录和旧令牌revoked／rotated_at放行，正常授权续期保留，未为健康数据增加例外。原始对照和核实证据均保留。

正式日志窗口2026-11-04 16:10:41—16:25:04 UTC，Runtime error／fatal与请求5xx均0，无排除区间和后续分页。私有备份detail-hierarchy-20261104-before／after.json及verification.json位于主工作区data/exports，0600且Git／部署忽略；任务跨11月4–5日，沿用起始日文件标签，实际时间见快照createdAt。证据在本工作区.codex/details-release；正式截图C:/Users/14878/.codex/visualizations/2026/11/05/formward-details-production。

真实iPhone、系统软键盘、系统原生全屏与系统原生文字放大未测；200%页面缩放仅为浏览器模拟。立即回退基线是图表READY dpl_jji9NBprqzDd9J7NUcCje9UBdNto，只回退应用，不回滚用户合法写入或授权续期。正式应用绑定ce3a141，后续纯文档提交不代表新的部署。小助手当前状态见本文开头。


## 已正式发布：图表100ms与统一高亮（2026-11-04）

正式域名https://formward-ten.vercel.app已核对READY部署dpl_jji9NBprqzDd9J7NUcCje9UBdNto，源码3d0d41588133b1b7752eca9b49aefff81863f96b，构建chart-100ms-3d0d415-20261104。四页100ms、共同底纹／辅助线／高亮圈及总览纵向滚动不误选已上线；main仍a9988ea，未带入其他工作区内容。

正式Chromium14组、WebKit10组图表交互及两引擎48张深浅／手机电脑页面通过。两项虚构账号及34表所属数据清理，43表结构、29条账本及原健康事实／请求／审计核对保持。首个逐日夹具创建阶段已中止并清理，改为相同目标的批量夹具；相关私有记录保留，并非忽略测试失败。正式日志窗口2026-11-04 15:11:34—15:28:25 UTC，运行error／fatal与请求5xx均0，无排除区间或后续分页。备份chart-100ms-3d0d415-20261104-before／after.json及verification.json在主工作区私有data/exports；证据在chart-selection-consistency/.codex/chart-release，截图C:/Users/14878/.codex/visualizations/2026/11/04/formward-chart-production。


## 此前正式版本：图表交互与 Unslop 界面（2026-11-04）

用户认可共同规则与B方案后明确要求发布，本次仅发布，不更新GitHub main。正式域名https://formward-ten.vercel.app已核对READY部署dpl_HKAXv65zohYhmp8UWHhSkk2my21W，源码ad7c6391ac298288adbebcec9d4aa5f7f713ef00，构建unslop-ad7c639-20261104。分支codex/unslop-shared-rules；源码包含已确认的登录舞台稳定、图表选日、营养环图及B版界面。主工作区双区、COS、DNS与未上线0028等保持隔离，没有新增迁移、依赖、公开接口或权限。

电脑鼠标选日采用约220ms慢快慢过渡，点击不固定；离开完整面板返回最近完整日，移至查看入口保留当前日期与晨晚目标；手机与键盘规则分别保留。饮食日期详情显示全天／每餐供能环图，四项营养同排、占比在下，餐次之后左侧添加／右侧已记全。身体日期合入标题、保存紧跟字段并靠右。食材库使用B的工具区与手机密度，消耗统一输入对齐及层级；Unslop与Mobile Design、Impeccable共用长期设计规则。

沿用已验证的458项单元／集成、typecheck、生产构建与结构检查；本次应用源码与已验收B一致，仅协作/文档提交不同。Vercel远程构建与类型检查通过。正式Chromium／WebKit合计80张实际页面、16组录入流程、14组图表交互及8组登录阶段结果通过；另以虚构账号真实保存身体、餐次及295千卡宏量换算。15项公开／保护入口与当前清单10段媒体Range206及首32字节校验通过。客户端异常和页面请求5xx为0。运行日志窗口2026-11-04 12:21:09—12:48:44 UTC，Runtime error/fatal与请求5xx均0，无排除区间、无后续分页。真实iPhone、系统键盘、系统原生全屏与真实系统文字放大未测。

发布前后私有一致性备份unslop-before／after-2026-11-04-ad7c639.json及unslop-production-verification-2026-11-04.json保存在主工作区data/exports，0600且Git／部署忽略。43表结构、29条迁移账本、原健康事实、请求与审计保持，issues为空；正常限流及认证使用元数据按既有规则核对。2个本轮虚构账号与34表所属数据均清理，无残留。私有证据.codex/unslop-release，实际图C:/Users/14878/.codex/visualizations/2026/11/04/formward-unslop-production。

主检查末尾的持久化断言误用了valueKind，导致本地核对失败；实际schema为recordKind。80张页面、16组流程、图表与登录结果在此之前均已完成，原始失败和首轮脚本保留；独立正确字段的两项真实保存复验通过，并非将失败冒充通过。另一次媒体探测包含未引用旧文件，已改以当前manifest检查十段；未改应用或删旧媒体。详细证据见maintenance-verification.md。

回退基线为上一READY部署dpl_9uJUw8RmFGxcq5xup3S3Yab1A27X（源码2e358ae65323453436a95f279eb0aed60105f5c9）；只回退应用，不回滚用户合法数据和审计。main仍为a9988ea8996706d548a0ee6e9999455da3ab4d0c。



## 此前正式版本：录入交互与表单密度（2026-11-04）

用户验看本地修正后明确要求发布。正式域名https://formward-ten.vercel.app已核对READY部署dpl_4GmECkX4DT8Wg7wLVjDC78gRZRA7，应用源码0af9b635b5f74bc742a29c6e13c6133b31083790，构建a679c6b1-713e-43b5-94a7-69e58d3f1223。独立分支codex/entry-interaction-unification；本轮只发布，未推送、合并或更新GitHub main。主工作区双区、COS、DNS、0028及其他未上线修改保持隔离。

身体录入采用晨晚切换、并排体重体脂、同行更多设置与紧邻来源；估算在字段原位显示已保存状态，与填实测同行。来源按晨晚合并的连续3次采用实测识别；草稿按有效值比较，空白或填后删空直接退出，已有值清空仍保护。首页提供真实缺项提醒，不自动补0或2058。食材营养默认四项一排，长数字及文字放大才自然退让；统一16px输入、44px操作与单层间距。无名营养行保留并阻止保存；包装只改名称不丢基准；超额照片整批拒绝且保留已有失败队列。直接添加活动、保存附近失败反馈、历史同日查看、导出错误与重试一并接通。总览排版和既有健康计算保持。

455项单元／集成及lint、类型、production build和结构检查通过；本地两引擎逐态检查后，正式Chromium 15项交互／48张主流程截图、39张密度截图，WebKit 15项／48张及39张密度截图通过。覆盖深浅主题、320／390／430px手机、矮屏、横屏及1100／1366／1440／1920px电脑，含200%文字、触屏、键盘与减少动态效果；实际查看正式手机身体、估算、食材及电脑截图。身体与补录两端共4段教程更新，其他6段保留；十段在本地播放核对，正式更新的身体两端在两引擎完整播放通过，全部媒体字节校验及Range206检查通过。共61项公开／保护入口与媒体检查通过；客户端异常和请求5xx为0，完整正式日志窗口Runtime error／fatal与5xx为0，无排除区间及后续分页。真实iPhone、系统键盘与系统原生全屏未测。

发布前后一致性备份entry-interaction-before／after-2026-11-04.json位于主工作区私有data/exports，权限0600，Git／部署忽略。43表结构、29条迁移账本及既有健康记录、请求、审计保持；5个本轮虚构账号及34表所属数据已清理。无迁移、历史初始化、运行依赖、公开HTTP／MCP或权限变化。私有证据在本发布工作区.codex/interaction-release；正式交付图在C:/Users/14878/.codex/visualizations/2026/11/04/formward-entry-production。本地虚构预览数据仍保留，未接触真实用户资料。

首轮正式检查在教程超时收尾时对已取消的拦截请求再次abort，导致检查脚本失败；客户端异常及5xx均0，失败截图／日志保留。修正测试为移除拦截后由页面／浏览器关闭请求，不吞异常；完整重验通过后才计入本次通过项。此处仅修改测试，无额外产品代码或部署变更。

上一READY部署dpl_7HXQr3oesTodRoLNQN3xGFeAXtVC保留用于应用回退，不回滚用户合法数据及审计。


## 此前正式版本：营养最多一位小数

正式域名https://formward-ten.vercel.app已核对READY部署dpl_7HXQr3oesTodRoLNQN3xGFeAXtVC，应用源码332115d0d2bc86f2588539d920af1cf4a6082e6a，构建0a48dc57-73d1-49da-a67b-1275d2741d2e。来自独立工作区Formward-worktrees/meal-entry-macros、分支codex/nutrition-decimal-input；仅发布本轮营养精度调整，未推main，主工作区双区／COS／DNS等未上线内容保持隔离。

蛋白质／碳水／脂肪的网页手填、AI手工修改与显示统一最多一位小数，去掉末尾0，第二位小数明确报错并阻止提交。热量仍按原精度计算和合计后四舍五入显示整数；1.2／0／0.1保留5.7kcal、显示6，17.5／4.3／1.1保留97.1kcal、显示97。Excel宏量列0.#，能量0，身体0.00。旧四位数只聚焦、失焦或改备注不舍入写回；公开HTTP／MCP、包装换算及计算落库原精度保持，没有迁移、依赖或权限变化，其他交互审查建议未实施。

443项测试及本地／正式两引擎复验通过；2个虚构账号清理，43表与29条迁移账本严格核对无差异，原记录保持。完整截图、日志及数据证据见handoff.md与maintenance-verification.md。

## 账号管理与安全边界

0027已应用生产，并按用户指定的已有邮箱预览、核对ID后初始化唯一owner。用户已验收实际页面并明确授权本轮发布、更新main；迁移与源码先提交，再保存私有备份、迁移、初始化、部署并复核。迁移默认旧用户普通／正常，旧密码、验证状态和健康事实保持；初始化只变更指定角色及对应审计。日常管理从站内完成，维护命令见 [账号接入](auth-setup.md)。

正式核对使用虚构账号、只清理所属测试数据，不破坏真实健康数据；不使用或仿造真实owner密码／会话。完整后台再次验密、停用恢复、权限与并发在隔离数据库验证，生产验证普通账号拒绝、激活／重设、本人改密、会话与AI统一失效。回滚优先回滚界面，保留新增结构和安全鉴权；不能退回忽略banned／access_version的旧认证代码或复活已撤销凭据，必要时先关闭管理写入口。

## 此前正式版本：营养小数与整数热量

P／C／F小数录入与整数热量展示已发布。正式域名https://formward-ten.vercel.app指向READY部署dpl_DpXQjf62CNDgHQSXqPtupeexqUF5，应用源码560e9a93f2597682acf061f5c5bf5f9a88156e04，构建16afb946-18f8-48b4-bcff-9bc58a9dfcef。分支codex/nutrition-decimal-input，独立工作区Formward-worktrees/meal-entry-macros。本轮仅发布，未推GitHub main，主工作区双区／COS／DNS及其他未上线内容保持隔离。

网页餐次、食材规格及AI手工修改的蛋白质、碳水、脂肪可填最多4位小数，编辑显示原精度；查看最多2位并去末尾零。kcal、消耗与热量差仍四舍五入显示整数，计算、合计与落库不提前取整。P1.2345／C0／F0.1保留5.838kcal、显示6；17.5／4.25／1.1保留96.9kcal、显示97。Excel宏量列0.##、能量0、身体0.00，仅改变显示格式。旧值聚焦／失焦及仅改来源／备注不舍入写回；未知与明确0、包装换算、公开HTTP／MCP精度保持。未接入上一轮其他交互审查建议。

443项单元／集成、lint、类型、production build、结构检查和修改目标设计检测通过。隔离原生PostgreSQL及正式Chromium／WebKit均通过各20组餐次场景、15组详情、12组独立库与3项小数专项；正式各79张截图，手机／电脑、深浅主题、320／390／430／横屏／1100／1440、四位输入／五位拒绝、真实保存、旧值保持、食材与AI确认复验。实际查看正式手机及桌面AI截图。最初PGlite协议异常和测试遗漏既有大幅变化确认的失败证据保留；改用独立原生PostgreSQL、等待真实页面就绪并显式完成确认后通过，没有吞异常或改变应用保护。真实iPhone与系统软键盘未测。

正式7项公开／保护入口通过，正式别名、源码与build再次核对；最终正式客户端异常及5xx为0，部署最近20分钟Runtime error／fatal与请求5xx均0，无排除区间或后续分页。2个本轮虚构账号及34表所属数据已清理。43表结构、29条迁移账本、既有健康记录、请求和审计保持。首次严格对照仅发现一次既有OAuth授权续期及同时间认证防重放缓存；旧令牌撤销、新令牌有效，身份／会话／client／授权码／权限／资源逐项相同，旧部署同秒token接口200佐证，正常使用保留。严格初报及最终窄范围核对均留档，最终issues为空。

备份nutrition-decimal-before／after-2026-11-03.json及nutrition-decimal-production-verification-2026-11-03.json在私有data/exports、0600并被Git／部署忽略；证据.codex/nutrition-decimal-release及独立工作区.codex/nutrition-decimal-check。没有迁移、历史初始化、运行依赖、公开字段或权限变化。上一READY部署dpl_5WnHbK1FTZtuSG1GjMYatBhxz84J保留供应用回退，不回滚用户数据或正常授权续期。

## 此前正式版本

密码至少六位与手机历史来源点选修复已发布。正式域名https://formward-ten.vercel.app指向READY部署dpl_5WnHbK1FTZtuSG1GjMYatBhxz84J，应用源码c11c977ab15f81a7d000d9b4c290d0c509b3cab6，构建8fcb296d-a9eb-4a75-b744-bb2399a5ef34。分支codex/password-minimum-six，工作区仍为Formward-worktrees/meal-entry-macros；本轮仅发布，未推GitHub main，主工作区双区／COS／DNS及其他未上线内容保持隔离。

新密码统一6–128字符，邀请激活、重设、本人改密、owner本地恢复、内部创建、认证配置和页面提示共用password-policy.ts；原有密码保持。SourceInput候选改成真实按钮，触屏不取消按下事件，输入先失焦时不抢先收起；身体、消耗与AI确认共用，选中仍先进入草稿，再按原流程保存。

本地440项单元／集成、lint、类型、production build及结构通过。正式Chromium／WebKit最终各18组来源检查、16张截图通过；来源触屏／失焦／重复／中文／键盘、身体及消耗保存、AI应用后统一保存、建议移除与旧来源保持均复验。普通虚构账号在正式网页验证五位不提交、六位改密后登录、旧会话和AI令牌失效；邀请／重设和owner维护六位流程仅在隔离环境验证，没有仿造生产管理员。首轮WebKit出现Load failed，追踪复跑发现AI收据2秒回总览与脚本提前跳页竞争；测试现等待真实返回再继续。两轮失败留档不计通过，最终WebKit复跑无页面异常、无过滤异常。真实iPhone与系统键盘未测。

7项公开／保护入口通过，正式别名与源码绑定再次核对；最终通过组客户端异常及5xx为0，部署最近20分钟Runtime error／fatal和请求5xx均0，无排除区间及后续分页。4个本轮虚构账号及所属数据已清理；发布前后43表结构、29条迁移账本和既有行值严格对照通过，issues为空。备份database-before／after-source-password-2026-11-02.json及source-password-production-verification-2026-11-02.json均位于私有data/exports、0600并被Git／部署忽略。证据.codex/password-minimum-six/release，最终截图为production/chromium及production-final/webkit；前两轮WebKit记录保留。没有数据库迁移、历史初始化、运行依赖或公开权限变化。上一READY部署dpl_9NN2wRePFTmKhbXnQ7Zit6xJcDfq保留供应用回退，不回滚健康数据。


## 品牌版本发布记录

用户于2026-10-31查看实际页面后明确要求发布公网。正式域名 https://formward-ten.vercel.app 已核对 READY 部署 `dpl_FWmg8Xf75oRAnasTNePGVAmf9Ye7`，应用源码 `273dbb5`，来自独立分支 `codex/brand-logo-release`。以此前正式基线 `42c7e8a` 仅接入 F＋手臂标志、透明导出、全站品牌组件及 favicon／Apple 图标；未带入双区、地区选择、COS 或新 migration。main 未修改，域名 DNS 与私有双区预览未切换。

发布基线 lint、typecheck、409项单元／集成、production build、目录及diff检查通过；隔离 Chromium／WebKit 各48张品牌截图、30组页头检查通过。正式两引擎各30张实际截图、18组页头检查通过，客户端异常及请求5xx为0；20项公开／受保护入口与5份图标文件逐字节SHA256校验通过。正式别名再次核对仍为新部署 READY；该部署20分钟查询窗口 Runtime error／fatal 与请求5xx均0，无排除区间。实际查看正式桌面首页和WebKit手机总览；真实iOS和主屏图标实机显示未测。

发布前后私有备份 `data/exports/database-before-brand-logo-2026-10-31.json`、`database-after-production-brand-logo-2026-10-31.json` 及 `brand-logo-production-verification.json` 均为0600，Git／部署忽略。42表结构及全部原有行值一致，无新增正式业务数据，临时普通账号、登录和所属审计已清理。证据位于 `.codex/brand-release/`，生产截图和报告在 `production/{chromium,webkit}/`；应用源码与发布记录保留在独立发布分支。

## 居中修正发布记录

正式域名https://formward-ten.vercel.app已核对READY部署dpl_2C8bsftEneVCMEVdPidswep4kxxQ，应用源码bcbca33，main已推送GitHub。以账号管理版本1cd5c4d为基础，纠正既有导航布局的居中定位：正文左右112px对称预留、页头对称回扩；右侧三点把手按自身中心对准视口中线，手机次级页入口清除电脑位移。

1440×900修复前实测正文向右24px、把手中心向下77px；修复后隔离和正式站Chromium／WebKit均为0偏移。两引擎正式各38张实际截图，覆盖1100／1440／1920px及不同高度、320／390／430px手机、滚动、原页窗口调整、150%CSS放大、工具展开／Escape、减少动态效果，以及AI／导出页手机右下角入口。实际查看修复前后及正式截图；真实iOS和系统软键盘未测。409项完整单元／集成、lint、类型检查、生产构建、结构及269项根文档／docs本地链接通过；两引擎共用饮食填写、旧精度、包装换算和AI确认回归通过。正式19项入口通过，客户端异常、请求5xx及该部署20分钟Runtime error／fatal均0，无排除区间。

本轮没有migration、历史初始化、账号角色／权限、健康计算或公开协议变化；保留0027及全部账号安全检查。生产前后data/exports/database-before-centering-2026-10-30.json、database-after-production-centering-2026-10-30.json及centering-production-verification.json均0600、Git／部署忽略；42表结构、账本、原账号／密码、健康事实、请求与审计保持，未新增原表行值变化，虚构普通账号、会话和所属审计已清理。证据.codex/centering-before/、.codex/centering-visual/、.codex/centering-meal-regression/及.codex/centering-release/。

上一账号管理READY部署dpl_GZNxCaMsEgWT3mwa4ZyhhW3SaF46保留用于界面回退，不回退0027或账号安全检查，不复活已撤销授权。

Next.js由Vercel Hobby托管，数据库沿用Neon PostgreSQL。AI使用正式[OpenAPI](https://formward-ten.vercel.app/api/v1/openapi.json)或https://formward-ten.vercel.app/api/mcp，不使用受Deployment Protection保护的单次部署/预览地址。

## 平台与变量

Vercel 项目 `formward`，Framework Next.js，仓库根目录，Node.js 24.x。`ENABLE_EXPERIMENTAL_COREPACK=1` 使用 package.json 的 pnpm 9.15.9。`vercel.json` 固定 frozen-lockfile 安装、`pnpm build` 和函数区域 cle1，靠近 Neon us-east-2。

通过 CLI 手动发布，没有 Git 自动部署；Git 推送不会更新正式网站。Standard Protection 保护 Preview 和单次部署地址，正式别名公开。项目关联信息在被忽略的 `.vercel/`。

Production 变量：

| 变量 | 内容 |
| --- | --- |
| DATABASE_URL | 原 Neon pooler 连接串，保留 TLS，敏感变量 |
| BETTER_AUTH_SECRET | 原认证 secret，敏感变量 |
| BETTER_AUTH_URL | https://formward-ten.vercel.app |
| FORMWARD_TIMEZONE | Asia/Shanghai |
| ENABLE_EXPERIMENTAL_COREPACK | 1 |
| BLOB_STORE_ID | Private Blob 连接自动配置；SDK 使用部署 OIDC |
| BLOB_WEBHOOK_PUBLIC_KEY | 平台自动维护，当前预签名流程不依赖 webhook |

真实数据库与存储不连接 Preview，不使用 NEXT_PUBLIC_ 变量保存秘密，不覆盖本机 `.env.local`。变量变化后重新部署。确认链接和 OpenAPI 使用 BETTER_AUTH_URL，忽略代理内部地址和请求 Host。默认时区使用 FORMWARD_TIMEZONE，HTTP 请求 X-Formward-Timezone 优先，按发生时的夏令时计算偏移。

## 私有原图

Blob 必须为 [Private](https://vercel.com/docs/vercel-blob/private-storage)，只关联 Production。当前 SDK @vercel/blob 2.8.1，通过 BLOB_STORE_ID 与平台 OIDC 认证，无生产静态读写令牌；不要把存储改成 Public。

网页原图最大 20 MiB、最多 8 张，JPEG／PNG／WebP。prepare 为当前账号签发限定路径、摘要、类型、大小和 10 分钟期限的凭据；SDK 取得受限预签名后，浏览器直接上传私有 Blob，complete 再校验实际内容并登记。大图不进入 Function 请求体；旧 multipart 入口只兼容 4 MiB，需刷新使用新版网页。该流程没有上传回调，不需要开放 webhook 路由。

MCP／HTTP 通过 ChatGPT 临时文件 URL 下载并存入同一私有库。API 函数最长 120 秒，单批上传设置 85 秒截止、最多两张并行下载，返回逐图结果；成功附件保留，失败项可单独重试。私有文件只由 `/api/meal-images/[id]` 校验会话与归属后返回，private/no-store；存储原始地址不提供匿名读取。

本机 OIDC 是 Development 身份，即便 `vercel env run -e production` 拉取变量仍不能访问 Production-only 存储。若必要的维护测试临时连接 Development，必须保留原连接快照，关闭敏感标记才能添加该环境，并在 finally 中恢复仅 Production 与敏感标记；不创建静态凭据、不连接 Preview。不要输出、提交或发送 OIDC／下载 URL／密钥。

Hobby 配额遵守 [Blob 用量规则](https://vercel.com/docs/vercel-blob/usage-and-pricing)，超过配额明确失败，不自动升级。

## 迁移与发布

修改前读根 README、AGENTS 和对应 README、当前 Next.js 本地文档。发布前运行 lint、typecheck、unit/integration test、production build、结构检查及受影响浏览器检查。浏览器使用独立 PGlite、端口和虚构账号；同一个 `.next` 构建目录不同时用于构建和正在运行的浏览器服务。

新增migration先纳入版本控制，再保存私有一致性备份、执行和核对旧字段／值。0024只新增份数、可靠包装与运动包含关系六列及CHECK；旧餐默认consumed_total，旧运动关系为空，保留原计算结果。迁移核对40表原字段和值保持，账本只增加对应一次。指定包装元数据通过私有维护预览／版本／事务审计更新，旧营养、食用量、快照和原始请求不改。0023日完整状态的历史初始化限定授权账号与固定截止日期，不在migration或未来默认中执行。0022及更早共享migration保持，构建不自动迁移。

```bash
node --network-family-autoselection-attempt-timeout=1000 --env-file=.env.local --import tsx scripts/backup-database.mts data/exports/私有备份.json
pnpm db:migrate
vercel deploy --prod
```

备份与迁移优先DATABASE_MIGRATION_URL；直连不可达而pooler可用时，在单次进程内使用DATABASE_URL，不改凭据文件。

Vercel的生产敏感变量不能下载，env pull的[SENSITIVE]占位符不能用于连接。发布维护使用已有本机生产数据库凭据，并通过既有迁移账本和备份核对目标；不覆盖.env.local或生产环境变量。

正式站验收结束再次备份与核对：全部结构及既有行值保持，只允许正常限流、令牌使用时间和会话续期元数据变化；会话身份与令牌字段仍须一致。虚构记录全部清理，既有健康记录、原始请求和审计保持。

0017仅为foods新增category（meal／ingredient，NOT NULL默认ingredient，CHECK），旧字段与记录保留，账本仅新增1次。已授权将Pasta Express和KL套餐两条当前记录标为meal，其他7条为ingredient；不修改营养、单位、说明或任何历史餐次。全库核对27张其他表以及全部既有操作／审计保持，仅新增1个维护操作和2条事件。

本批私有一致性备份为data/exports/database-before-stage3-2026-10-25.json、database-after-stage3-migration-2026-10-25.json、database-after-stage3-package-2026-10-25.json、database-after-stage3-production-2026-10-25.json；对应stage3-migration-verification.json、stage3-package-verification.json、stage3-production-verification.json全部通过。正式站虚构账号、OAuth客户端及数据已清理；15项公开／保护入口、MCP13工具和五种宽度操作验收通过，实际截图在.codex/stage3-release/。验收时段最近10分钟Runtime error／fatal为0，请求5xx与客户端异常为0。

以下为既有私有备份归档，均0600、Git与部署忽略，不输出健康值或凭据：

- `data/exports/database-before-record-review-2026-10-17.json`
- `data/exports/database-after-record-review-migration-2026-10-17.json`
- `data/exports/record-review-migration-verification-2026-10-17.json`
- `data/exports/database-after-record-review-production-2026-10-17.json`
- `data/exports/record-review-production-storage-verification-2026-10-17.json`
- `data/exports/database-before-unified-overview-2026-10-16.json`
- `data/exports/database-after-unified-migration-2026-10-16.json`
- `data/exports/database-after-unified-categories-2026-10-16.json`
- `data/exports/unified-migration-verification-2026-10-16.json`
- `data/exports/food-categories-2026-10-16*`、`food-categories-verification-2026-10-16.json`
- `data/exports/unified-categories-storage-verification-2026-10-16.json`

分类和说明维护通过scripts/maintain-foods.mts／food-maintenance.ts指定账号、ID／版本及摘要，updateMealDescriptions:false保持历史餐项。较早的food-editor-cleanup、food-analysis-correction、food-analysis-cut-specification私有请求／结果和database-before／after-food-analysis备份仍保留，历史营养、克数／勺数和原始请求／审计不改。ON当前每1勺约30.4g；Pasta保留原成分估计克数及汇总区间；牛排保留“可能保留中央筋膜”的原不确定措辞。

.vercelignore排除data、环境文件、凭据、Git、本机工具、依赖和构建缓存。

## 验收与维护

公网检查首页、OpenAPI、OAuth discovery／PKCE／CIMD／公钥、MCP 未授权 401 challenge、三个主页面登录保护及私有路径 404。OAuth、HTTP API 与网页登录分别认证；手动令牌及账号连接可撤销，AI 所有正式写入需网页登录确认。

真实连接排查已经复现旧版对 5,072,913 字节虚构 PNG 返回 image_size／4 MiB；68 字节同类文件可成功。原用户照片没有保留具体响应，不能倒推其实际大小、格式或失败阶段。新版日志记录上传阶段、字节数、错误码与 requestId，避免仅凭 GPT 的自然语言报错判断。

正式原图验收使用虚构文件与临时账号，测试结束删除仅属于这些测试的附件、Blob、账号与会话，不写真实餐次或修改既有健康记录。Runtime Logs 查错误与上传诊断，但不打印 URL、文件名、健康内容或凭据。既有账号的独立待确认预览不能因另一提交保存成功而自动取消。

部署成功后验证正式别名实际指向 READY 版本，再更新交接。失败时别名保留上一个成功部署；需要回滚时保留已发布的新列和约束，不删除数据或修改旧 migration。ChatGPT 已有连接需刷新工具列表，以获取分类、历史餐项引用、20 MiB、expectedImageCount 和详细依据协议；只在缺饮食权限时重新授权。真实手机／微信观感与用户原图最终复测由用户完成。

当前部署的Runtime与公开入口检查见handoff.md，不以本机资源hash推断线上版本。实际核对正式别名READY、协议字段和浏览器行为。保留版本绑定、私有备份、审计与回滚；真实原图及手机体验由用户最终核对。

食材客观分析规则、照片逐项失败和缺图审核要求见docs/meals.md，正式站使用独立虚构账号验收并清理。

统一审核专项报告保留在 `/tmp/formward-record-review-production.json`：混合审核与草稿并发、独立取消入库保留摄入、统一保存与自动返回、双PFC口径、旧链接和跨账号保护已验证，虚构账号清理完成。审核时间首屏统一UTC，再切设备时区，UTC服务端／东八区浏览器回归及正式站均无水合错误。当前总览、消耗及正式部署验收以下节为准。


## 既有0021消耗模式发布归档

以下描述0021发布时的验证；当前结果以上方0024与验收记录为准。该批已通过业务、安全、构建、目录README和文档链接检查。独立数据库的消耗、统一审核、饮食及身体／来源／AI／加载反馈浏览器回归通过；消耗覆盖两种录入模式、两种活动模式、未知与0、活动编辑、删除恢复、公式独立对照、正负盈余、严格相邻晨重、全部区间、键盘、触屏及减少动态效果。

正式站使用独立虚构账号，通过消耗模式及分项来源、运动累计、身体／饮食／消耗混合审核、双层独立整齐刻度、相邻晨重、跨账号保护、1440／1100／390／320px与减少动态效果验收，客户端异常0。最终部署另验证隐藏模式的无效数字草稿不阻断当前模式保存，也不写入未采用的值；1440／390／320px编辑器通过。全部虚构账号及其健康事实、操作、审计、令牌和会话已清理。

0021在版本控制中提交后执行；迁移核对36张应用表原字段和值保持，账本只增1条。正式交互验收后全库核对既有健康事实、原始请求、来源和审计保持，仅正常认证元数据变化。以下私有文件均0600，受Git及部署忽略：

- `data/exports/database-before-energy-modes-2026-10-22.json`
- `data/exports/database-after-energy-modes-migration-2026-10-22.json`
- `data/exports/energy-modes-migration-verification-2026-10-22.json`
- `data/exports/database-after-energy-modes-production-2026-10-22.json`
- `data/exports/energy-modes-production-verification-final-2026-10-22.json`
- `data/exports/database-after-energy-modes-history-preview-2026-10-22.json`
- `data/exports/energy-modes-history-preview-verification-2026-10-22.json`

正式交互报告`/tmp/formward-energy-modes-production.json`及`/tmp/formward-energy-modes-editor-production.json`；READY别名核对`/tmp/formward-energy-modes-inspect-final.log`。13项公开入口及认证保护通过，见`/tmp/formward-energy-modes-http.json`；MCP未授权challenge使用POST测试，GET的405不代表认证故障。最终部署Runtime error／fatal与请求5xx均0，见`/tmp/formward-energy-modes-runtime-errors.jsonl`和`/tmp/formward-energy-modes-server-errors.jsonl`。

既有一次性历史补齐批次已核对为confirmed，由用户完成网页登录确认；不能重新初始化或代确认其他预览。预览后另做全库核对，只新增统一审核及消耗子审核各1条，原健康事实保持；固定清理日没有正式静息记录，其错误默认派生已消失，无须删除健康事实。具体范围、私有请求和后续核对见[交接](../handoff.md)。

双层关联图已通过最终正式站1440／1100／390／320px截图复核、全部范围、键盘、减少动态效果与缺记录切换位置稳定检查。虚构账号及所属数据已清理；13项公开入口／认证保护通过，客户端异常、Runtime error／fatal和请求5xx均0。截图与报告位于被忽略的`.codex/overview-verification/final/`。本轮无数据库迁移、权限或健康计算变化。

本次发布前后私有备份为`data/exports/database-before-overview-release-2026-10-22.json`及`database-after-overview-release-2026-10-22.json`；`overview-release-storage-verification-2026-10-22.json`核对37张表结构和既有数据保持，仅排除正常限流及指定认证使用／续期元数据。全部文件0600，不提交或公开。

## 手机布局验收

手机四栏导航与48px页头、最近10日直接补录、单份有效消耗读数、单餐服务端合计及局部线图刻度使用现有数据库和协议，无迁移。隔离浏览器验证320／390／430px及矮视口、触屏横屏、1100／1440px，图片只含虚构数据；软键盘以缩小视口模拟，真实手机浏览器仍需用户复核。最终版本、305项测试、正式站虚构验收、备份与清理证据见[交接](../handoff.md)。

手机最终版本的正式域名验收通过，Runtime error／fatal及请求5xx均0，13项公开入口通过。虚构账号及其数据已清理，`.codex/mobile-verification/`归档实际截图与报告。发布前后备份`data/exports/database-before-mobile-2026-10-23.json`、`database-after-mobile-2026-10-23.json`及`mobile-release-storage-verification-2026-10-23.json`核对37张表结构与既有数据保持，只排除指定认证使用／续期和正常限流元数据；全部0600、Git与部署忽略。无migration。


总览首屏维护不涉及migration。正式站双浏览器、四个手机竖屏、桌面、触屏横屏、150% CSS放大和减少动态效果均复验；14项公共／保护入口通过。发布前后overview-compact私有备份与40表核对保持原数据，虚构账号清理完成。当前设计与视觉验收统一依据为[既有设计文档](design-reference.md)，截图和条目结果见[验收记录](maintenance-verification.md)。

## 运动分项版本的回退

0026为加列迁移，旧行保持NULL，不回算历史。若上线后已有分项运动写入，需要保留本轮分项计算与字段支持，采用修正版本回退界面；不能直接切回不认识运动分项的旧部署，以免旧代码把期间静息再次计入。不得删新列或改旧migration。

## 身体与运动分项发布核对

正式域名 https://formward-ten.vercel.app 已核对 READY 部署 dpl_HeNMUADh26b3D68zZPgx2kdgeNfm，运行代码 b654847，数据库0026；功能分支codex/latest-records-energy-sources已推送，尚未合入main。已合并32be0cd，保留此前餐次字号、列宽、单位及详情定位修正。OpenAPI1.13.0、MCP1.11.0，13个工具与既有权限种类保持。

379项单元／集成、lint、typecheck、production build、312项本地链接和15项章节锚点、60个团队目录README及diff检查通过。隔离Chromium／WebKit验证运动分项、AI修改不正式保存、单项删除、跨窗口保留输入与明确覆盖、自定义取消、慢图登录；四页矮屏、横屏、键盘、减少动态效果及历史回归通过。正式站两浏览器各五种宽度重走实际保存和更新提醒，Chromium发出真实浏览器触屏事件验证横拖选日及纵向滚动。16项入口保护通过；最终验收客户端异常与请求5xx为0，部署最近10分钟Runtime error／fatal和请求5xx均0。WebKit首轮捕获一次跨页请求错误，诊断保留；补充跳转前后等待请求完成后，无过滤重跑通过，不将首轮记为通过。真实iOS及系统软键盘未作实机测试。

正式报告与虚构截图在私有.codex/body-energy-release/，Chromium／WebKit分别为production-chromium.json与production-webkit.json；READY见.codex/body-energy-inspect-final.log。测试账号及所属记录、待确认操作、令牌与会话已全部清理。发布前、迁移后和发布后三份私有备份为data/exports/database-before-body-energy-2026-10-28.json、database-after-body-energy-migration-2026-10-28.json和database-after-body-energy-production-2026-10-28.json，均0600、Git与部署忽略。

body-energy-migration-verification.json与body-energy-production-verification.json核对40表原有列、健康事实、请求和审计保持，0026只加三列及一条账本，旧运动新列保持NULL。期间已有账号正常新增的图片、待确认提交及授权轮换均保留，未代确认、删除或回滚；body-energy-concurrent-verification.json单独核对新增归属与测试数据清理。回退必须保留运动分项计算及新列，不切回无法理解components的旧后端。


首次使用发布需应用0029_personal_profiles，只建个人资料表，不回填旧用户。生产基线不含未发布双区0028，严禁整包应用主工作区migration或配置。迁移前后私有备份核对旧表和值，正式验证仅虚构账号；清理时包括personal_profiles。双区分支未来合并必须重核迁移依赖和时间顺序。
