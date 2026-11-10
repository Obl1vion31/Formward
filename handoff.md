# Formward 项目交接

## Vercel 发布归档与部署保留（2026-11-11）

- 已完成旧部署清理及七天保留策略设置，原正式域名绑定保持。归档、逐批 ID 与前后只读检查保存在 Git 公共目录所属工作区的私有备份；操作入口与保护范围见 docs/deployment.md。每次正式发布先归档，再切换并清理；工具不重新构建网站或替代原功能验收。
- 共用工具18项检查通过，实际压缩包与原始上传摘要核对、两项目小批次及后续清理、正式服务与湫云匿名401核对完成。Formward 旧项目别名保留 Vercel 登录保护，未绕过保护声称应用验收。平台最低数量字段仍回读10，精确近期保留由发布后工具落实；两个仓库工具与测试保持同一实现。
- 本轮仅维护工具和说明，无应用发布或正式业务写入。真实数据与独立密钥恢复仍单独管理，云盘由用户处理；不再作为本轮旧部署清理的前提。主工作区无关修改保持。

## 单餐参数精简

豆包新增`preview_meal`作为新增单餐首选，模型只提供日期、餐次及平铺食物；服务器映射原饮食预览，今天／昨天按用户时区解析。旧复杂提交工具继续承接历史修改和兼容，GPT仍18项。单餐首选定义1,687字节、零组合分支，对照原工具10,714字节约减少84%。

本次606项单元／集成（80个原测试文件串行独立执行）、lint、typecheck、原生4项、Manifest校验、原生本地构建及干净兼容production build通过。实际Next production双协议发现19项工具，单餐与多食物预览、未知与0、原页面200、非法参数与无效凭据拒绝均通过，AI正式健康写入0。Chrome实际核对桌面及390×780预览、依据和修改入口；截图位于私有验收归档，不冒充真实豆包WebView通过。

同组3个虚构请求在官方模拟器对照：旧版均在派发前出现tool_call_arguments_invalid；新版均调用preview_meal、返回pending且canConfirm=true，日期、未知／0与食物清单正确，模型回复包含真实确认链接。测试Manifest只在回环fixture用预授权虚构身份，两组设置一致；正式19项工具仍normal登录。CLI 0.0.41即使指定--expect-card none仍报card_binding_missing，因此完整模拟器Verdict未通过，不能把3次工具成功称为总体成功率或整体验收通过。先前网络错误、来源别名、错误相对日期及多杂项失败均留档，最终修正后样本不再出现这些错误。

测试版`0.0.1-dev.20261111.1`已云构建succeeded，Manifest、运行态Skill、原生源码及未扩权的业务声明已上传。平台配置预览核对19项工具、新增单餐的完整foods字段及最新Skill；Debugger二维码已打开。原`.20261110.2`保留供兼容查看。本人的既有连接检查和身体查询已通过；本次新记餐工具的真实手机调用与国服最终确认仍待复测，不要求重建既有GPT连接。

本轮保留47项Server Action及原绑定密钥，额外保留335项旧静态资源；配置字节及root 0600凭据保持，无数据库迁移。上一应用`onboarding-polish-20261111`保留供回退。海外网关未重新部署，两个别名仍指向既有iad1版本；三入口版本一致、8项公开资源SHA一致，自动／旧协议19工具及匿名／无效凭据保护通过。现有GPT发布前后get_profile均成功且为同一账号。

## 当前部署：手机引导与外部接入

用户已授权先用Vercel过渡、后续再迁国内，保留现有GPT连接；官方CLI登录与上海私有AppSecret配置已获授权并完成，不重复索权。

当前上海应用 `dual-entry-55ac4956-doubao-simple-meal-final-20261111`，源码`55ac4956f59205d480b21e8862cb4d0b4f6e4463`，BUILD_ID `z6eI-7owRfYDkdU2vdBuM`，目录`doubao-simple-meal-final-20261111`。包含此前手机引导与主题完善，新增豆包单餐入口及定义兼容适配；原GPT入口、工具和业务计算保持。

生日使用独立年／月／日选择，年份直接展开；饮食、消耗、身体、训练提供入口→填写→保存说明的首次三步高光。每账号、每设备、每模块一次，可跳过，小助手底部“常用功能 → 重播操作引导”可重播。原视频使用说明继续保留。

首次使用、owner演练、完成页与个人资料共用最新主题及输入／按钮控件，顶栏日／月圆形揭示与跟随系统选项一致。暂时跳过、保存和步骤更新仅提供按钮内局部等待，失败留稿；演练完成后的返回文字居中且已实际点击走通。高光沿用账号／浏览器／模块v1标记，本次发布不重置，助手可随时重播。320px两倍字号下按钮按整体换行、行高随文字变化。

595项单元／集成基线通过；最终CSS修正后12项引导测试、lint、typecheck与兼容production build复验通过。最终产物Chromium／WebKit各14组演练和20组录入高光检查通过，另核对慢请求、失败留稿、真实新账号完成及录像。此前五页加载锚点基线分别为0.328125px和0px，未冒充本轮重新测量。

手机引导原验收版本保留47项Server Action及绑定密钥、440项旧静态资源；55表和36条migration保持，健康数据、环境配置和OAuth安全摘要保护检查通过。上一正式应用 `mobile-onboarding-20261111` 保留供回退。

生日控件与操作引导的物理手机原生选择器、系统键盘、帧率及屏幕阅读器尚未实测；既有WebKit连续图形转场未通过记录保留。 详细证据见[维护验收](docs/maintenance-verification.md)。

海外READY `dpl_7LC5LTzjS7zokZa6atCsrHpT5vxa`，网关代码仍为74754129，实际发布区域固定为`iad1`；`formward-ten.vercel.app`与`global.formward.top`均已核对指向该部署，257项静态文件、路由和网关代码哈希保持。

原GPT的issuer、resource、客户端和凭据保持；AppSecret仍只在上海root 0600私有配置，环境文件字节未变。参数修复基线929a9d47保留47项Server Action、原绑定密钥和285项旧静态资源；55表／36条migration保持，无新增健康计算、数据库迁移或正式虚构健康记录。

本人手机2026年11月10日23:53的“检查连接”已通过令牌和归属校验，但空参数工具收到两项额外字段，在SDK工具入参校验阶段失败；scope完整，刷新也成功。依据豆包平台协议，适配层只移除`from_mcp_call`与`_miniapp_permitted_data`，不使用其数据或推断身份；其他业务字段仍严格校验。隔离测试先复现旧失败、修复后通过；2026年11月11日01:02真机复测中，两项工具实际命中这两个平台字段并完成、HTTP200；用户确认连接检查与身体查询正常，原因已由真实调用闭环。

参数修复基线929a9d47的593项单元／集成全部通过，其中14项豆包／桥接专项；lint、typecheck、干净兼容production build及实际Next production HTTP双协议验收通过。带平台保留字段的连接检查与身体查询成功，非法日期、其他未知字段和无效凭据仍拒绝，健康写入0。原无隔离完整运行耗尽本机WSL内存，中断记录保留；最终按78个原测试文件串行独立运行同一套断言，未放宽检查。原生4项、此前H5尺寸与独立review保持原验收范围，不冒充本次手机查询或新视觉验收。

发布后另捕获海外回源ETIMEDOUT：上海公开入口200，海外两个别名503，原GPT复核也曾失败。固定公开版本接口的保护探针实测香港`hkg1`无法建立TCP，而美国东部`iad1`的TCP、TLS及HTTP200均通过；切换到iad1后，三入口版本一致，新旧协议发现18工具，8项公开资源SHA一致，原GPT实际get_profile恢复且为同一账号。运行日志的sin1标记不能单独当作函数实际区域；上述探针直接读取VERCEL_REGION。不据此追认更早间歇503的根因。

旧测试版`0.0.1-dev.20261110.2`的既有验收，本人OpenID交换、WebView回传、绑定、换码和续期已验证。本人确认手机连接检查与最近七天身体查询正常；服务端两工具complete／HTTP200，分别5ms和126ms。原连接可继续使用；新增单餐需更新Debugger测试版资源，手机记餐与网页最终确认仍待复测。

上海临时JSON诊断preload和本人systemd drop-in已移除，实际服务环境无探针；Vercel四个本轮候选／诊断部署已安全删除，临时保护绕过令牌已撤销，两正式别名的诊断路径即使带旧私有头也返回404。只保留不含健康内容的私有证据和兼容回退，不删除其他任务。

本轮私有证据归档至主线main-current工作区的`.codex/doubao-integration-20261111`，包含`doubao-platform-arguments-release`、`doubao-gateway-recovery`、`doubao-research`及前期平台／请求修复材料。此前手机连接及身体查询问题已闭环，相关工作归档后清理本轮分支与临时工作区；不能公开凭据、真实UID或健康结果。后续网关发布须显式传`--regions iad1`并核对部署API和真实回源；不能只依赖本地vercel.json。

## 已发布：公开隐私政策与服务条款

用户确认后已发布[隐私政策](https://formward-ten.vercel.app/privacy.html)和[服务条款](https://formward-ten.vercel.app/terms.html)，可直接填入豆包控制台。个人运营者施绪飞扬，联系邮箱opg.obl1v@gmail.com，生效日期2026年11月10日。READY为 `dpl_82o44w2e9c1xGDH3Yxep68LxP7FZ`，文稿源码 `38a3c61139a34f70b28e9c71cf1aa669737a6de4` 已合入推送main；接入后续边界和完整发布证据见[豆包资料](docs/doubao-onboarding.md)。

本轮仅在既有海外Build Output新增三份公开文件，253个原文件、网关和路由哈希不变，网关源码仍0f3434d。正式HTML／CSS匿名200、无跳转／Cookie、SHA与源码一致；两引擎8组公网手机／电脑及互链通过，页面异常和健康API请求均0，国服版本不变、未授权身体接口仍401。原578测试、lint、typecheck及production build通过；正式稿52组矩阵及16组日期专项通过，日期孤字经独立复核resolved。68张正式稿和公网截图在 `C:/Users/14878/.codex/visualizations/2026/11/10/formward-legal-publication-final`。临时预览及本轮工作区在归档后结束，私有证据移至主线 `.codex/legal-publication`；物理手机、豆包WebView与完整法律评估未测。未执行数据库迁移或健康记录写入，未改变凭据或授权配置。

## 保留的验收基线：浅色骨架扫光

浅色骨架的已发布验收基线为`dual-entry-04d25b30-skeleton-contrast-20261110`，源码`04d25b300dffee62f5669211beee3200c6a5880e`，BUILD_ID `fqTfJlxhDaX7x1bzy7WOH`，目录`skeleton-contrast-20261110`，其改动已包含在顶部当前应用。该次只调整共用骨架颜色，没有数据库、业务计算、公开接口或加载时序变更；上海`formward_primary`保持55表、36条migration。

浅色占位使用#D6D0C4暖灰底与90%暖白扫光，数字、卡片及图形占位共用骨架色。扫光保持1.6秒从左向右，底色与光层继续由同一圆角容器裁切。深色沿用原灰底和米色光；减少动态效果时静止显示。固定标题、图例及操作从首帧显示，真实数据原位接管。

579项单元／集成、lint、typecheck及干净production build通过。最终产物在Chromium和WebKit各20组五页面深浅主题慢加载检查通过，覆盖390×640与1440×900，固定槽位最大偏差0px；320／390／430／1440另作6组实际页面像素对照，浅色扫光中心与底色的亮度比约1.02升至1.45，深色取样点保持一致。真实扫光连续播放、数据接管及减少动态效果检查通过。

身体晨晚／体脂共用日期轴、居中图表和返回交接继续保留；Garmin双站点、原GPT授权及Blob／COS沿用既有逻辑。47项Server Action、原绑定密钥与238项旧静态资源保留，上一应用`chart-return-final-20261110`保留供兼容回退。原数据、结构、配置与OAuth安全摘要前后校验无差异。

两入口版本及新版CSS公网SHA核对通过，原OAuth issuer／MCP resource保持，匿名MCP POST为401，原协议HTML／CSS匿名200且SHA一致；本轮未重发Vercel网关。此前WebKit完整连续图形转场的未通过样本仍保留，本次骨架加载检查不代表该问题已解决；物理手机帧率及系统键盘未测。详细证据见[维护验收](docs/maintenance-verification.md)。

## 随当前版本保留的工作区交互

主导航统一总览、饮食、训练、消耗、身体；账号菜单按外部接入、账号管理分组，owner另有管理与测试。手机助手在导航右侧并默认收起，常用功能由底部向上展开。AI待确认、今日未开始训练与昨日饮食形成角标及每日一次提示；按账号／日期跨设备忽略不会改健康事实。7D、30D及对应自定义采用同一居中图形，返回恢复来源位置并向真实卡片回缩一次，取消先隐藏浮层；饮食／身体骨架按容器比例预留高度，无模糊与减少透明度回退保留。

该基线由0f3434d发布至workspace-flow-final-20261110后进入Garmin基线6880811。此前双引擎各80组加载矩阵、各17组助手、19组原生库连续流程及三卡往返验证保留；修复前69次、修复后138次完整往返均有录像，未把本机结果写成真机帧率。574项基线测试及严格TLS旧Cookie／JWT／refresh、匿名回审核、旧页真实保存证据见[维护验收](docs/maintenance-verification.md)。0036只加assistant_reminder_dismissals，以独立管理身份迁移，运行账号只获必要读取／插入权限，不扩CREATE。

工作区交互发布时的海外基线为dpl_5Q1VAQn5XMDfJJsNTFhmuG4RELgp、CLE1，网关源码0f3434d；后续公开协议静态发布及当前豆包网关分别见顶部对应范围。旧基线观察窗为UTC 2026-11-09T19:35:37.597208+00:00—19:39:39.085899+00:00，不代表当前发布后的监控；不得冒充国服全量access或20分钟监控。

工作区交互的私有证据保留在workspace-flow工作树的.codex/release-control、final-release-control、loading-final、loading-native-webkit、loading-native-flows、assistant-final、linked-final-webkit及visual-final；服务器原目录/var/lib/formward/workspace-flow-20261110和workspace-flow-final-20261110保持。实录为C:/Users/14878/.codex/visualizations/2026/11/10/formward-workspace-flow。后续主线工作区为/home/obl1vion/projects/Formward-worktrees/main-current；其他进行中的工作区与私有运维证据不清理。


## 保留能力：身体仅保留实测

身体实测规则和0035已包含于当前应用，以下保留其数据迁移与验收依据。不能恢复旧估计能力。

身体估算已完整退役：网页录入、总览／身体估计开关、曲线标记、依据、助手／教程、AI能力、导出及初始化／补全／重建算法与脚本均移除。晨晚实测、体脂偏好、真实7日均值与变化保留，缺测为null并断线；饮食及热量估算保持。旧estimate_cell返回410 feature_removed，含该项的旧混合任务整批停止，原草稿及审计保留。

身体实测功能发布时的应用源码171f2492373be2e6d49353c8f65df5d7e8a3042f，分支codex/retire-body-estimates；版本dual-entry-171f2492-body-observed-20261109，BUILD_ID vHmep1SfdwCGO4zNwyCb2。国际READY dpl_4fNL8bJcnQtaaTwVeMPfzXia4BUg，两正式别名API均核对指向该部署。三个入口版本、OpenAPI1.15.0、原issuer、私有查询保护及实际身体JS的SHA均一致。后续文档提交不改变正式应用。本次身体估算退役分支已合入并推送main；旧工作区8份文档草稿已逐项比对：有效的手机／桌面职责与重设计规则归入现行文档，已收录的案例链接不重复保留，过时原型稿与临时保留分支清理。现行说明中残留的身体估算要求同步移除；此次仅整理文档，不改变正式应用或数据。

0035_retire_body_estimates已在上海主库完成：32条有效estimated归档，现有效估计0；90条observed（89条有效）及全部原始导入、既有审计在同一事务内按行摘要核对不变。估计仅为私有审计载体保留，数据库约束禁止其成为有效记录，估计专用索引移除。正式共54表（53张public业务表及1张drizzle账本）、35条migration。没有正式虚构账号或新增实测测试数据。

先部署停止估算的兼容应用，再备份、迁移及切换最终应用。安全回退为/srv/formward-primary/releases/body-observed-compat-20261109，BUILD_ID agdTOyDzPdc22QHb4PE1n，及国际READY dpl_EMfH8mcsj5seDQzkZsBTJwYWUYSB；该版本同样不含估算能力且兼容0035。回退只切应用，不恢复旧数据或旧估算版本，保留用户合法更新。两份产物均从同一干净源码重新构建，增量安装逐项核对2521份规范产物，静态资源兼容保留。

560项最终单元／集成、20项退役与OAuth专项、lint、typecheck及干净production build通过。Chromium全站80组及WebKit总览／身体32组加载矩阵通过，固定锚点最大1 CSS px；19组失败／重试／快速关闭／草稿／导航往返通过。身体14张深浅尺寸截图及保存刷新、体脂双模式和图形往返录像已核看；Impeccable机械检查无问题。原生真机、系统软键盘及系统文字放大未测，不计通过。

迁移前及迁移后的原生备份、AES-GCM异机副本与COS完整回读SHA通过。迁移后归档formward-primary-20261109T150658878231Z.dump（SHA f516a97eb0509245ef8767bd8b19440d1a717911f8e1191ca75d54ad7da09cbb）已完整恢复到新隔离库，54表／35 migration、约束和索引有效、有效估计0，演练库随后删除。正式应用、Nginx、PostgreSQL及备份／Garmin timer健康，实际发布观察窗口应用错误0，不冒充长期观察。

私有证据为本工作树.codex/body-retirement及服务器/var/lib/formward/body-retirement。正式备份在/var/backups/formward-primary及私有上海COS的database-backups/formward-primary/v1/；每日03:20原生与异机备份、06:00 Garmin同步和证书维护保持，远端不自动删除，本机日备份14天。备份不包含照片原件。此前切库／恢复证据在/var/lib/formward/dual-cutover及其backup-closeout-v1；详细运维边界见docs/server-operations.md与docs/regional-acceptance.md。

## 此前版本：全站静态内容与局部加载反馈（2026-11-08）

已按本会话此前明确的修改后直接发布授权更新[正式总览](https://formward-ten.vercel.app/dashboard)。READY部署dpl_Ds7qyEAu1jfhdWZyVqantWprDqkb，源码61eda5541ab7acd26a3b7e378b49a44aaac779de，构建static-loading-61eda554-20261108，来自codex/static-loading；正式别名、项目、sourceCommit／gitCommitSha及版本接口均一致，未合入或推送main。后续纯文档提交不改变正式应用。

总览、饮食、训练、消耗与身体的固定标题、操作入口、最近记录、历史入口及语义色从首帧显示，仅未知日期和数据占位。训练保留开始训练操作槽；资料、安全及连接采用200ms局部反馈，缓存命中直接接管。取消、迟到响应、真实重试、草稿和账号焦点恢复保持；根AGENTS及设计文档覆盖全站。

595项单元／集成、lint零错误零警告、独立typecheck、production build（静态生成38/38）及Vercel远程构建通过。本地Chromium／WebKit各80组布局和19组完整操作检查通过，固定锚点最大偏差1 CSS px；六组已知日期及完整记录区补查通过，实际截图和录屏已核看。正式站14项公开／保护入口通过，本轮不创建正式测试账号，登录状态与故障写入测试均限定本机隔离虚构数据库，不将本机验收冒充正式登录页面或真机验收。

发布前后0600私有备份均54表、33条migration；字段、账本、既有历史和旧审计保持；部署前的一次Garmin前台同步更新1条来源日汇总与步数，7日采用及8条新增审计的before／after逐项匹配。最终数据核对为concurrent-data-verification.json，原始严格差异保留。所有合法更新均保留，其他允许的元数据变化8项。无新增migration、公开接口、依赖或产品设置。Runtime error／fatal及请求5xx在实际观测窗口UTC 2026-11-08T10:04:36.000Z—2026-11-08T10:11:06.000Z均0，无排除区间或分页遗漏；不宣称新应用已持续运行20分钟。上一READY dpl_5LHExKEqQRyn73VJwEgm3ZbXyoop已核对保留供应用回退，不回退或删除合法用户更新。

私有证据为.codex/static-loading-release、.codex/static-loading-reviewed/chromium、.codex/static-loading-webkit-accepted/webkit和.codex/static-loading-fullpage；备份data/exports/static-loading-20261108-{before,published}.json不进入Git或部署。可展示截图、完整实录及连续导航片段位于C:/Users/14878/.codex/visualizations/2026/11/08/formward-static-loading，均为虚构验收数据。真实iPhone／Android、系统软键盘、屏幕阅读器、系统文字放大及真机帧率未测。

## 此前正式版本：训练页精简、触屏排期与完成记录删除（2026-11-08）

已发布[训练页](https://formward-ten.vercel.app/dashboard/training)，READY dpl_5LHExKEqQRyn73VJwEgm3ZbXyoop，源码a0d580b26adaa5c420a2af90cfa3169f25617a49，版本training-compact-a0d580b2-20261108。来自codex/training-entry，基于上一正式a2ac651并保留全部已发布功能；未合入main，后续纯文档提交不改变正式应用。

训练／消耗位于原标题行和手机顶栏；入口只保留日期、具体名称及开始／继续操作。默认收起模板置于开始区下方，展开看目标，44px手柄支持桌面／手机拖到月历、边缘滚动和取消，点选排期保留。完成记录更多菜单新增明确确认删除，最后一条完成删除后关联计划恢复待练；事务保留完整审计、幂等、归属和版本校验，MCP没有删除入口。

595项测试、lint、typecheck、production build及本地双引擎各21组／65图通过，正式站19组／29图和MCP通过；线上8组普通／慢网最大锚点偏差0px。54表、33条migration和既有健康／来源事实完全保持，唯一差异为限流元数据；两个虚构账号与临时客户端已清理。真实手机未测，WebKit连续原生touch受测试接口限制。素材与视频评估调研见[训练](docs/training.md)，证据、窗口及限制见[部署](docs/deployment.md)和[验收](docs/maintenance-verification.md)。

## 此前正式版本：训练动作库、GPT排期与稳定加载（2026-11-08）

已发布[训练页](https://formward-ten.vercel.app/dashboard/training)，READY dpl_eck1LqL2t7tC81Uu8pjHHXnxTkqj，应用源码a2ac651b4d7b5bcda137031946658d555a343e8a，版本training-library-a2ac651b-20261108。来自codex/training-entry，已合并最新饮食发布ade4f71／交接ffc1177，未合入main；后续纯文档提交不改变正式应用。

入口按无计划／有计划／进行中显示单一开始、按计划＋自由或继续；下面直接月历。150项动作库已接模板与训练，重量次数、时长、距离及目标／实测分别保存。训练和消耗骨架共用实页槽位，面板完全离屏后卸载；加载稳定性已成为根AGENTS强制规则。

GPT MCP已支持动作库、本人计划查询、模板与多日排期，服务17工具／OpenAPI1.14.0。旧连接须刷新并重新授权training读写；写入仍先生成预览，用户网页登录确认后保存。没有新表或migration，继续使用现有JSONB。

588项测试、lint、typecheck、production build、双引擎本地流程及正式站13组流程通过；线上8组普通／慢网固定槽位最大偏差0px。虚构账号和客户端已清理，54表／33条migration及健康事实保持，正常后台同步差异已逐字段核对。证据、观察窗口、真机限制及兼容回退要求见[部署](docs/deployment.md)与[验收](docs/maintenance-verification.md)。


## 此前正式版本：饮食录入简化（2026-11-08）

已按授权发布到[正式饮食页](https://formward-ten.vercel.app/dashboard/meals)。READY部署dpl_7joUqvbuPZfoQdoqPYSjRAiH5vMT，应用源码ade4f71e5e2722a4b98a6a27ee6579a111cfe941，构建meal-entry-ade4f71-20261108，来自codex/meal-entry-simplify；正式别名、项目、sourceCommit／gitCommitSha、版本接口及公开allowDuplicate兼容说明已核对。基于最新正式训练应用ff08c99及交接60d302d，保留训练导航、会话和0033四表；没有合入或推送main。后续纯文档提交不改变正式应用。

饮食与食材取消历史数值倍数比较及额外确认；同日严格重复餐仅一条中性提示和查看入口，无须勾选即可保存。餐次允许全0或全部未知营养，未知不补0，全未知不冒充已知部分；空餐、非法输入、归属、版本、请求防重和草稿保护保持。旧待确认预览仅清除可识别系统提示及重复餐拦截，原请求／草稿／过期及真实错误保持；AI仍通过网页登录最终确认。消耗、运动及身体原有提醒保持。

全量73文件575项测试、最终13项专项复查、lint零错误零警告、独立typecheck、38页production build与Vercel远程构建通过。795项上传文件不含私有配置、健康材料或验收数据。13组实际操作、10组深浅尺寸检查及最终5组复查通过，覆盖320／390／430和1100／1440；未知／零保存、重复与大幅变化、失败留稿、连续点击、键盘草稿、食材编辑与旧审核已实际操作。提示实际对比深色7.43:1、浅色最低5.00:1，查看入口44px。初轮summary定位差异的原始结果及复核均保留，详见[维护验收](docs/maintenance-verification.md)。

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

最终日志查询Runtime error／fatal与请求5xx均0，无排除区间或后续分页；这是新部署上线后的实际观测，不代表已运行满20分钟。上一READY dpl_8J4m5x2QYWUsGD1fPcTjzNpHvFNm保留供应用回退；不反向删除新表或回滚用户合法更新。正式入口使用formward-ten.vercel.app，global.formward.top的既有DNS问题未在本轮修改。设计规则见D13，字段与配置见[Garmin接入](docs/garmin-personal.md)，完整实际验收见[维护验收](docs/maintenance-verification.md)。

## 此前正式版本：电脑关联交互与 Inspector（2026-11-07）

用户追加明确发布授权后，已发布到[正式总览](https://formward-ten.vercel.app/dashboard)。READY部署 `dpl_8J4m5x2QYWUsGD1fPcTjzNpHvFNm`，应用源码 `161057a0e53c348009dfab46c9e3b849a5bedca1`，构建 `desktop-linked-161057a-20261107`；正式别名、源码元数据、版本接口及客户端JS一致。分支 `codex/desktop-linked-interactions` 基于干净56e7984，目录为 `/home/obl1vion/projects/Formward-worktrees/desktop-linked-interactions`。本轮未合并或推送main，其他工作区保持。

电脑总览先显示摄入／晨重／消耗三张真实七日趋势卡，再显示六项日读数、七日统计、完整关系双图及区间记录摘要；图后重复卡片退出。电脑自适应网格、手机横滑，卡片日期与大图所选日期独立。两端共用链接和图形交接，卡片进入正确专页日期及七日范围，电脑关联数据区最大640px、保持2:1，普通区间继续完整桌面图。

电脑关联页提供“返回总览”，恢复来源卡片、滚动、焦点及总览已应用区间／估计显示选项。返回状态仅在账号内存保存，不恢复旧健康数值；改区间／指标、记录更新、尺寸变化及无匹配来源时取消旧交接。减少动态效果直接完成。查看先捕获日期及晨晚，只读详情与明确录入／编辑继续分离。

Inspector 标题直接排列在面板底色上，移除桌面圆角玻璃、内高光、模糊和负边距；桌面把手不占空间，关闭44px，手机底部面板保持。营养绘图区测量跟随真实桌面组件挂载，修复手机切回电脑空图；三类关联骨架与目标使用相同数据平面、高度、刻度字体及体重小数格式，真实目标接管不取消或重播交接。交接首个可见帧在移动前绘出，取消同时清理待执行帧。

本地对照仍为 http://localhost:4240/dashboard 与固定基线 http://localhost:4242/dashboard，均只连接隔离虚构库；演示账号 `assistant@example.test`，口令 `formward-assistant-demo`，启动状态在私有 `.codex/desktop-linked/preview/preview.json`。正式资料与本地虚构库分开。基线由固定56e7984独立导出，不依赖其他活跃工作区的.next。

固定源码独立导出后重新通过lint（0错误0警告）、typecheck、505项单元／集成、production build及结构检查，远程构建通过，738项上传文件不含私有材料。正式Chromium／WebKit各12组首页、三类完整往返、18次尺寸切换、两种编辑器及三种触屏往返通过，页面异常与5xx各0，共46张截图，位于 `C:/Users/14878/.codex/visualizations/2026/11/07/formward-desktop-linked-production`。本地完整验收另保留72张截图、双端录像及review.html，目录为同级formward-desktop-linked。原始失败与未测边界见[维护验收](docs/maintenance-verification.md)；页面与设计规则见[界面说明](docs/interface.md)及[设计规范](docs/design-reference.md)。物理iPhone、系统键盘、VoiceOver、系统文字放大和真机帧率未测，浏览器模拟不代替真机。

18项公开／保护／协议检查及客户端版本通过，最终20分钟Runtime error／fatal与请求5xx各0，无排除区间或后续分页。发布前后44表结构、30条迁移账本及既有健康事实保持，临时虚构账号与36张所属表已清理，issues为空。正常限流及一行显示偏好版本更新按精确快照／行哈希和对应请求核对保留，没有健康数据例外。私有0600备份为原主工作区data/exports/desktop-linked-20261107-*，发布证据为本工作树.codex/desktop-linked-release。

后续第四批顺序保持：用户目标 → 真实训练会话 → 训练计划与排期；目标、执行和全天消耗分别管理。消息能力先查询／解释／导航，再规划有预览与确认的写入。

当前正式入口使用formward-ten.vercel.app。Vercel同时保留global.formward.top别名，但本机与Cloudflare公共DNS检查均返回NXDOMAIN；不能将该域名计为实际访问通过，本轮未改动DNS。应用回退保留上一READY `dpl_9KYWuxTQUQDTchCYXW8RBtt4oB4c`，保留合法用户数据；完整正式验收、备份与日志见[部署](docs/deployment.md)和[维护验收](docs/maintenance-verification.md)。

## 此前正式版本：消耗改期与主导航（2026-11-07）

已按用户授权发布到[正式总览](https://formward-ten.vercel.app/dashboard)。READY部署`dpl_9KYWuxTQUQDTchCYXW8RBtt4oB4c`，应用源码`6f0a2f64e6d17c1513199561f0d5f7fb3fe6d14b`，构建`date-navigation-6f0a2f6-20261107`；formward-ten.vercel.app与global.formward.top、源码元数据、版本接口和客户端JS一致。来自codex/energy-date-navigation的干净提交，736项上传文件不含私有数据、环境文件与本机工具；未合入或推送main，原主工作区的国内基础设施修改保持隔离。后续纯文档提交不改变正式应用。

消耗改期按原编号、原日期及版本核对，禁止采用目标日另一编号；日汇总与原日运动同批移动，日期相关包含关系重新核对。目标日已有日记录或运动时不合并，失败保留草稿并说明原因；响应中断沿用原请求编号，成功同时确认原日与目标日变化。窄编辑区日期／时区分行，原生日期控件、16px输入和44px触控保持。四模块普通导航按顺序200ms轻横移并淡变，手机16px、电脑12px；骨架替换不重播，图形关联、录入及详情不叠加，顶栏和导航稳定。

504项测试、双端实际操作与21段有效录像通过；44表、30条迁移账本和旧健康事实保持，临时数据清理完成，正式错误日志为0。物理iPhone／WebKit、真触屏横屏指针、系统软键盘／VoiceOver、系统200%文字、现场系统减少动态效果切换及真机帧率未实测，不计为通过；减少动态效果与取消清理由控制器测试覆盖。浏览器标签及临时视口已清理，临时账号已退出。

完整发布、回退和数据核对见[部署](docs/deployment.md)及[验收](docs/maintenance-verification.md)。

## 此前正式版本：暖雾材质与手机交互（2026-11-06）

用户查看实际页面后明确要求直接发布公网、用手机试用。本轮从基于main 840207f的独立分支codex/mobile-workspace发布，应用源码`166f715831d734a9694102158bef3cebec9a8921`，构建`mobile-warm-166f715-20261106`。正式地址https://formward-ten.vercel.app/dashboard已核对READY部署`dpl_91NTmbnYDMzWo8jddqkGfnuEzebS`、项目、正式别名及sourceCommit／gitCommitSha；main未合并或推送，原主工作区国内部署、COS、DNS和未提交内容保持隔离。后续纯发布记录提交不改变正式应用源码。

已接入持久导航、集中设置、真实小助手、底部详情、暖雾材质与B横向数据卡。摄入／晨重共用图形组件，从卡片按真实路由及相同日期范围等比进入专页；返回恢复位置与焦点。手机首页删除统计／覆盖／缺口区域，消耗并入卡片带；三专页顶部可直接记录，保留完整原有业务。电脑同步配色与控件，保留左侧导航、完整图表和统计。局部材质对照仅本地显式开关开放，正式登录后实际核对404。

467项单元／集成、lint、typecheck、本地production build及正式远程构建通过。正式IAB Chromium核对手机320×560、390×560／780、430×780和电脑1100／1440×900；检查深浅外观、三类录入、摄入／晨重进入和返回、真实小助手，虚构账号实际保存70.10kg及2058kcal并回看更新。18项公开／保护／协议检查通过，客户端异常0；最终部署20分钟Runtime error／fatal和请求5xx均0，无排除区间或后续分页。

一个独立虚构账号及35表所属数据已按精确ID清理。前后43表结构、29条迁移账本及既有健康事实、请求、审计保持，仅正常认证限流缓存变化经逐行哈希与时间核对放行。无数据库迁移、业务API、权限或运行依赖变化。私有证据`.codex/mobile-warm-release`；备份和最终核对位于原主工作区data/exports/mobile-warm-20261106-{before,after,verification}.json，0600并被Git／部署忽略。真实iPhone、系统键盘、WebKit和真机帧率未测，交由用户实际手机试用；更多边界见docs/maintenance-verification.md。上一READY `dpl_HFeRzEVLnECg3wbReUGhEZ2gzgAP`保留供应用回退，不回滚用户合法更新。

## 此前正式版本：饮食详情精简与输入对齐（2026-11-05）

正式饮食页https://formward-ten.vercel.app/dashboard/meals指向READY部署`dpl_HFeRzEVLnECg3wbReUGhEZ2gzgAP`，应用源码`0a566c184b72edc072bf35592661fd22397a9cd0`，构建`meal-details-0a566c1-20261105`；项目、正式别名、sourceCommit／gitCommitSha及版本接口已核对。main统一本轮已发布应用与验收记录，纯测试／文档提交不代表另一次应用部署；Vercel项目未连接Git自动部署。原主工作区双区、COS、DNS及未提交内容保持隔离。

饮食与总览共用SavedMealList，只保留当天一个供能环图。展开餐次隐藏摘要，保留一次三项宏量与完整食物清单；食物的营养、来源和依据原位展开，备注／照片按需打开，打开附件后请求原图。每餐环图、百分比、中间重复热量块和来源数量退出；编辑／更多在餐末，添加一餐／已记全在全部餐次之后，总览只保留一个饮食跳转。手机读数按完整内容切换四列／2×2／极窄一列，触屏横屏全宽，固定滚动条空间，日期标题按完整文字块换行。

餐次编辑器表内10px内距优先于通用12px默认值，手填／下拉单位与表头内容边缘实测偏差由2px降至0px，输入16px与44px点击范围保持。布局测量同时包含实际控件文字、补足的小数位及待修改的长输入，使用真实字体与内距；空间不足切换布局，聚焦／失焦后复测，不改写输入、计算、精度或保存规则。助手窗口与主图表保持现有布局。

干净源码通过lint（0错误0警告）、typecheck、465项单元／集成、production build和结构检查。正式Chromium／WebKit各60种新详情、28组原详情及12组边界、6组展开、缩放与真实记全／编辑／删除取消通过；完整编辑器每引擎20组输入场景、15组气泡和12组独立食材库，含包装换算、旧精度及AI审核通过。十段教程每引擎实际播放与跳转通过；AI及补录四片与封面／预览已更新，其余六片和全部旧媒体保留，16个新媒体完整SHA256、8项Range及19项入口／协议检查通过。

六个虚构账号及34表所属数据已按明确ID清理；43表结构、29条迁移账本与既有健康事实核对通过，最终issues为空。私有快照`meal-details-20261105-before.json`、`-after.json`及`-verification.json`位于原主工作区data/exports，0600且Git／部署忽略。正式最终部署日志窗口2026-11-05T09:48:47.000Z—2026-11-05T10:20:01.000Z，Runtime error／fatal与请求5xx均0，无排除区间及后续分页。

真实iPhone、系统软键盘、原生全屏和系统级文字放大未测；浏览器模拟与CSS缩放分别记录。正式实际截图位于`C:/Users/14878/.codex/visualizations/2026/11/05/formward-meal-details-production`，全部自动化样本为虚构数据；已在Chrome实际打开正式饮食日期详情核看展开效果。私有证据`.codex/meal-final-release`，首次失败保留在`.codex/meal-publish/production-initial`，完整技术说明见维护验收。 完整结果见[维护验收](docs/maintenance-verification.md)和[部署说明](docs/deployment.md)。本轮无数据库migration或公开接口变化；应用回退基线为发布前的`dpl_A9LrFGGKCuzrSnqfa43ve2hRcecK`（9307ed6），保留用户合法写入与审计。后续第四批仍按用户目标→真实训练会话→训练计划与排期。

## 此前正式版本：小助手、区间摘要与估计读数稳定（2026-11-05）

用户已明确授权本轮发布并合并推送main。正式总览https://formward-ten.vercel.app/dashboard已上线，READY部署`dpl_A9LrFGGKCuzrSnqfa43ve2hRcecK`，应用源码`9307ed63ca11c67a51b19839ce08971232a84e96`，构建`assistant-9307ed6-20261105`；项目、正式别名及元数据核对通过。main包含本次发布应用及验收记录，后续纯测试／文档提交不代表另一次应用部署。功能从main的6142fb9在`codex/assistant-overview`独立开发，工作区`/home/obl1vion/projects/Formward-worktrees/assistant-overview`；原主工作区双区、COS、DNS及未提交内容保持隔离。

前三批作为一次交付：电脑右下角400px非模态助手、手机85dvh底部面板替换旧工具；教程、AI接入和Excel迁入常用功能。仅昨日饮食未确认／未记全／修改后失效计入待核对；缺饮食、全天消耗不可得、身体无实测为可补充建议。今天／昨天的助手独立于图表选日；账号、设备、当地日期每天最多自动一次，有明确事项才出现，手动也计当天展示。兼容旧收起偏好、多标签同步，编辑、保存、确认、授权及教程优先。

新增`GET /api/assistant-context?timezone=…`仅用网页会话，账号来自会话、响应private/no-store；各业务feature有界读取两日，复用原采用、记全和消耗规则。总览复用已有快照派生最小上下文，其他页按需读；保存成功后失效重查，失败与401有明确反馈。未新增数据库、HTTP v1、MCP或站内聊天，本地只保存展示偏好。

身体与总览把数字、单位、标签、估计／含估计及辅助说明纳入布局；同区间悬停只换内容。身体共用估计说明预留，区间无说明不留空行；稳定id不因标签变更重新挂载。双图后区间摘要从已有日级收支统计，缺口原位展开，每批50日，与悬停独立。AI教程两段及封面、预览、字幕和媒体清单已更新，旧媒体保留。

复现入口为`pnpm test:assistant-browser`（先build，需Playwright），自行创建内存PostgreSQL、虚构账号和临时端口。部署前干净源码再次通过465项单元／集成、lint（0错误0警告）、typecheck、production build和结构检查。正式Chromium／WebKit各31组、46图通过，19项入口／协议及8个更新媒体SHA256通过；本地完整助手／教程回归和独立视觉审阅ship保留。43表、29条迁移账本及既有健康事实保持，正常并行录入和授权续期逐项审计后保留；两个虚构账号及34表所属数据已清理。正式日志error／fatal与5xx均0。备份位于主工作区私有`data/exports/assistant-20261105-*`，发布证据`.codex/assistant-release`；完整状态、截图、未测项及回退基线见[维护验收](docs/maintenance-verification.md)和[部署说明](docs/deployment.md)。本地预览`http://localhost:4210/dashboard`仍为独立虚构数据库。

## 后续能力

用户目标及其版本仍待对齐。真实训练会话、模板与日期排期已完成本次首版；训练进一步细节按实际使用反馈演进，循环排期与消息能力不在本次交付范围。

## 本次开发起点（2026-11-05）

用户已明确要求先统一并推送main。main从a9988ea快进至最新正式发布分支codex/detail-disclosure的8760792，包含此前已上线的餐次、来源、密码、录入、图表及详情展开改动与验收记录；后续仅补充本次基线说明。应用源码仍与正式ff4357a一致，本次不产生新的应用发布。

本次重新通过459项单元／集成、typecheck与production build；统一后的main工作区lint为0错误、0警告。应用目录、公开素材、构建脚本、依赖及Next配置与ff4357a逐项无差异，沿用该版本已有正式视觉验收。

后续功能从统一后的main建立工作分支。原主工作区codex/mainland-server-preparation及其未提交内容保留，双区、COS、DNS和未上线迁移不随本次进入main。该开发起点尚不包含小助手，本次正式交付见本文开头。

## 此前正式版本：详情信息取舍与原位展开（2026-11-05）

正式域名https://formward-ten.vercel.app指向READY部署dpl_HfTwrwJYqBCdnA4YTcA3GMfHVdiV，应用源码ff4357a7fc141d5865f2d2b03a081da5bc719ec0，构建detail-disclosure-ff4357a-20261105；正式别名、项目、sourceCommit／gitCommitSha和版本接口已核对。该版本已发布，后续按用户要求统一到main；main包含截至8760792的全部已上线变更与验收记录，主工作区双区／COS／DNS等未上线内容保持隔离。

饮食餐次收起只显示餐次、热量和最多一行食物摘要；完整名称、营养和依据在同一餐展开后查看。运动收起保留本次总数、运动／期间静息分项和短计入状态，时长、来源与完整包含解释原位展开；编辑随记录展开，删除放本条更多并保留原确认。当天合计到餐次及各餐的结构横线保持，未改计算、原精度、未知／0、包含关系、数据库结构或公开接口。信息取舍和展开层级已纳入设计D12、AGENTS及共同技能约束。

459项单元／集成、lint无错误、typecheck、production build、结构和319处文档链接通过；原第三方Unslop脚本的1项既有lint警告保留。正式Chromium／WebKit各28组常规页面、12组边界，含深浅主题、320／390／430px、矮屏／横屏及1100／1440px；另验长数值、200%页面缩放和各6组展开／更多／删除取消。确认已记全、编辑后失效、原值1190保持、空白新增、键盘和Escape通过；WebKit操作再重复一轮通过。实际核看正式手机／电脑收起及展开截图。真实iPhone、系统软键盘、原生全屏及系统级文字缩放未测。

首轮正式操作回归及独立诊断捕获WebKit请求取消：测试在Server Action附带重验证流结束前刻意整页重开，取消了预取及一次仍收尾的POST。已按请求／导航／错误时间定位，验证脚本改为保存与整页重开前等待networkidle，保留全部异常断言；应用未为此变更。完整两引擎重跑和WebKit重复通过，原始失败、诊断事件与最终结果均保留，不将失败组计入通过。

发布前后私有一致性备份detail-disclosure-20261105-before／after.json及verification.json位于主工作区data/exports、权限0600且Git／部署忽略。43表结构及29条迁移账本保持，原已存健康条目、请求和审计对照通过，issues为空；期间真实录入、记全确认及授权续期已按对应操作、审计与成功请求逐项核实，仅为快照哈希绑定的精确行／字段放行，保留用户合法更新，未对健康表整体豁免。3个本轮虚构账号及34表所属数据已清理，含首轮与诊断账号。正式日志窗口2026-11-04T16:51:53.000Z—2026-11-04T17:10:53.000Z：Runtime error／fatal和请求5xx均0，无排除区间或后续分页。

私有证据.codex/disclosure-release；正式实际截图C:/Users/14878/.codex/visualizations/2026/11/05/formward-disclosure-production/final，含review.html。立即回退基线是上一READY dpl_CAopGdr6YKGyFL7kpustjnSpUK1c（ce3a141）；仅回退应用，保留用户合法写入及审计。正式应用绑定ff4357a，后续验证脚本／文档提交不代表新的应用部署。当前小助手进展见本文开头。

## 此前正式版本：详情层级与图表100ms（2026-11-05）

已按用户指定顺序完成两次发布：先图表3d0d415，再详情ce3a141。正式域名https://formward-ten.vercel.app现指向READY部署dpl_CAopGdr6YKGyFL7kpustjnSpUK1c，应用源码ce3a1410c029e876b9d0727f249cf49ee7e37ee5，构建detail-hierarchy-ce3a141-20261105；正式别名、项目及sourceCommit／gitCommitSha均已逐项核对。main保持a9988ea8996706d548a0ee6e9999455da3ab4d0c，未推送、合并或带入主工作区双区／COS／DNS等改动。

饮食日期详情明确“当天合计”，保留四项同排、下方占比及总量到餐次／各餐之间的结构横线；删除常驻催确认及保存后重复追加说明。餐次12px单层间距、44px展开、状态标记与底部添加／已记全保持。消耗日期只在标题显示，摘要12px、数字上距4px／行高1.2、单位同行，长值整项退让；查看样式不影响填写预览。极窄有效宽度和200%页面缩放可自然纵向阅读。计算、原始精度、未知／0和运动包含关系未改。

458项单元／集成、lint无错误、typecheck、production build、结构和237处文档链接检查通过；原第三方Unslop脚本保留1项既有lint警告。独立PGlite入口可复现。正式Chromium／WebKit各28组常规页面、9组边界，以及展开、320px长值和200%页面缩放检查通过；两引擎真实确认已记全、编辑后失效、名称还原、空白新增退出、键盘／Escape与1190保持通过。实际查看正式手机和电脑深浅主题截图，客户端异常及请求5xx为0。

一项虚构账号及34表所属数据已清理。43表结构、29条迁移账本、原健康事实／请求／审计保持。严格对照最初拦下正常OAuth续期；已结合现有客户端、账号、会话、连接、同范围权限和原部署token端点200日志逐项核实，仅为该次新增刷新令牌／防重放记录和旧令牌revoked／rotated_at放行，正常授权续期保留，未为健康数据增加例外。原始对照和核实证据均保留。

正式日志窗口2026-11-04 16:10:41—16:25:04 UTC，Runtime error／fatal与请求5xx均0，无排除区间和后续分页。私有备份detail-hierarchy-20261104-before／after.json及verification.json位于主工作区data/exports，0600且Git／部署忽略；任务跨11月4–5日，沿用起始日文件标签，实际时间见快照createdAt。证据在本工作区.codex/details-release；正式截图C:/Users/14878/.codex/visualizations/2026/11/05/formward-details-production。

真实iPhone、系统软键盘、系统原生全屏与系统原生文字放大未测；200%页面缩放仅为浏览器模拟。立即回退基线是图表READY dpl_jji9NBprqzDd9J7NUcCje9UBdNto，只回退应用，不回滚用户合法写入或授权续期。正式应用绑定ce3a141，后续纯文档提交不代表新的部署。当前小助手进展见本文开头。

## 已正式发布：图表100ms与统一高亮（2026-11-04）

正式域名https://formward-ten.vercel.app已核对READY部署dpl_jji9NBprqzDd9J7NUcCje9UBdNto，源码3d0d41588133b1b7752eca9b49aefff81863f96b，构建chart-100ms-3d0d415-20261104。四页100ms、共同底纹／辅助线／高亮圈及总览纵向滚动不误选已上线；main仍a9988ea，未带入其他工作区内容。

正式Chromium14组、WebKit10组图表交互及两引擎48张深浅／手机电脑页面通过。两项虚构账号及34表所属数据清理，43表结构、29条账本及原健康事实／请求／审计核对保持。首个逐日夹具创建阶段已中止并清理，改为相同目标的批量夹具；相关私有记录保留，并非忽略测试失败。正式日志窗口2026-11-04 15:11:34—15:28:25 UTC，运行error／fatal与请求5xx均0，无排除区间或后续分页。备份chart-100ms-3d0d415-20261104-before／after.json及verification.json在主工作区私有data/exports；证据在chart-selection-consistency/.codex/chart-release，截图C:/Users/14878/.codex/visualizations/2026/11/04/formward-chart-production。

## 此前正式发布：Unslop B 与图表交互（2026-11-04）

用户本轮明确要求发布，没有授权更新main。正式域名https://formward-ten.vercel.app已核对READY部署dpl_HKAXv65zohYhmp8UWHhSkk2my21W，源码ad7c6391ac298288adbebcec9d4aa5f7f713ef00，构建unslop-ad7c639-20261104；B的应用代码与已验收f77938e一致。main仍a9988ea；主工作区双区／COS／DNS／0028等未上线内容保持隔离。

登录上跳、图表平滑选日／离开恢复与查看目标、日期详情营养环图，以及共同规则和B的食材库／编辑、消耗样式均已上线。正式两引擎80张页面、16组操作、14组图表、8组登录结果与两项真实保存复验通过。15项入口及十段当前媒体检查通过。2个虚构账号与34表所属数据清理，43表与29条迁移账本、旧健康记录／请求／审计保持。日志窗口27分35秒Runtime error/fatal及请求5xx均0，无排除／后续分页。

备份unslop-before／after-2026-11-04-ad7c639.json在主工作区私有data/exports。私有发布脚本与完整原始失败记录在本工作区.codex/unslop-release；末尾验证字段valueKind误写已纠正，独立用recordKind完成真实保存复验，产品源码未为此改动。完整结果见docs/deployment.md和docs/maintenance-verification.md；正式截图在C:/Users/14878/.codex/visualizations/2026/11/04/formward-unslop-production。真实iPhone、系统键盘、系统原生全屏及系统文字放大未测。

后续从本分支当前应用基准继续，发布元数据绑定上述源码，不把后续纯文档提交误认为新的应用部署。上一READY dpl_9uJUw8RmFGxcq5xup3S3Yab1A27X保留用于应用回退。当前小助手进展见本文开头；Unslop已纳入长期工作流。下一轮发布或main更新仍以用户当次授权为准。

## 发布前：用户同意纳入 Unslop，B 为本地基准

A应用48c6cc4，B应用f77938e。两版都包含已认可的去竖线、清楚按钮及最新D12规则；A先落共同规则，B仅额外调整食材库/编辑和消耗样式。饮食详情与身体录入采用同一共同方案，不强行制造差异。应用差异仅两份CSS，20组DOM/控件状态签名相同。

对照http://localhost:4199，实际A/B为4197/4198。新工作区shared-ui-rules-reference、unslop-shared-rules；旧对照4194/4195/4196及主工作区保留。虚构账号comparison@formward.example.test，口令与私有环境见本地对照页及A的.codex/shared-rules/preview.json，勿提交真实密钥。A/B各180张实际截图、合计32组关键流程及24组等效放大/控件边界检查通过；共享应用458项测试与两版构建通过。B第三方技能脚本保留1项lint警告，应用无错误。详细证据、精确限制与素材路径见docs/maintenance-verification.md当前交付章节。

用户已明确同意纳入Unslop。后续在unslop-shared-rules分支以共同规则加B版为本地基准继续；AGENTS.md、README与design-reference.md已统一记录Mobile Design→Impeccable→Unslop工作流。原A与对照页保留，后续不重复要求选择同一基准，也不强行改动无问题的页面。数据快照前后相同，未访问生产；本次仅更新协作/设计/交接记录，没有新增界面改动、发布或main更新。真实iPhone、系统键盘、原生全屏及系统文字放大未测。

对齐比较时提醒顶部“首屏小助手”：覆盖部分总览并适度虚化，提示待补记录、下一步录入和未来健身入口；出现频率、无待补内容、关闭/重开及不打断流程仍待确认，本轮没有实现。

## 前轮执行：功能修正与 Unslop 本地对照（2026-11-04）

先修登录舞台上跳、图表选日与营养供能环图，验证后冻结 A 版；随后在独立工作区使用 heydamir/unslop 的 a6f121e 版本，对总览、饮食当天详情及身体录入制作 B 版。A/B 使用同组虚构数据和状态，B 不自动采用。只交付本地页面、截图和交互录屏；未获本轮公网发布或 main 更新授权。

## A版本地功能已验证

登录上跳、四页完整面板选日和日期详情营养供能环图已完成；458项单元／集成、类型与production build通过，两引擎108张尺寸／主题截图及核心交互通过。A冻结后在独立B工作区进行Unslop对照，不能混作正式发布；详细证据见docs/maintenance-verification.md。真实iPhone、系统键盘与原生全屏未测。

## B版比较工作区

A应用基线769bd5c；B位于Formward-worktrees/chart-unslop-comparison，仅轻量打磨饮食详情及身体时段／来源，主总览保持一致。Unslop使用固定a6f121e，署名与CC BY 4.0保留于独立技能副本及验收记录，不进入运行依赖。B不是正式采用，不能自动覆盖A、发布或更新main。交付比较时仍须主动提醒顶部“首屏小助手”待对齐事项。

## A/B对照本地交付完成

A应用769bd5c、B试用9c01a05；可操作比较http://localhost:4196，实际应用分别4194／4195。两版各108张截图、两引擎关键交互与边界检查通过，基础458项测试通过。总览主屏8组像素一致，饮食值得比较，身体收益较小；B未采用，未发布、未更新main，真实iPhone未测。完整证据见docs/maintenance-verification.md。隔离虚构数据保留供验收，前后健康快照哈希一致。

首屏小助手仍待对齐；交付比较时主动提醒，不因完成记录而视为实现或认可。

## 晨间空腹说明归入按钮：已授权发布（2026-11-04）

用户已验看实际页面并明确要求发布；本轮仅发布该修正，不更新GitHub main。

用户指出手机时段行的独立“空腹称重”像第三个选项。本地将条件合入“晨间（空腹）”按钮，晚间保持“晚间”，删除游离条件文字及其CSS；可访问名称与可见名称一致。更多设置仍在同一行，电脑晨晚并排保持。D11及身体目录说明同步，沿用Mobile Design的任务归属与Impeccable的文案层级规则；没有新增组件、依赖、数据或计算变化。

Chromium／WebKit各检查深浅主题的320／390／430px、触屏横屏844及电脑1440，共20组通过。核对时段行同排、44px点击、键盘切换、更多设置、未保存输入保留及清空后退出；客户端异常和5xx为0。lint、类型、production build和结构检查通过。本地假账号与既有演示数据保留，无健康保存请求；不触及生产、不更新main。真实iPhone与系统键盘未测。实际图位于C:/Users/14878/.codex/visualizations/2026/11/04/formward-period-label，私有证据.codex/morning-label。

检查脚本首轮按71.2原始字符串比较，碰到正常的两位格式71.20后改为数值比较；随后过密重复登录触发本地限流，改为每引擎一次登录并复用会话；WebKit提前换页中断背景请求的失败也保留，改为直接进入目标页并等待网络稳定后完整重验。没有放宽应用限流、过滤页面异常或修改实际录入行为。


## 此前正式版本：录入交互与表单密度（2026-11-04）

用户验看本地修正后明确要求发布。正式域名https://formward-ten.vercel.app已核对READY部署dpl_4GmECkX4DT8Wg7wLVjDC78gRZRA7，应用源码0af9b635b5f74bc742a29c6e13c6133b31083790，构建a679c6b1-713e-43b5-94a7-69e58d3f1223。独立分支codex/entry-interaction-unification；本轮只发布，未推送、合并或更新GitHub main。主工作区双区、COS、DNS、0028及其他未上线修改保持隔离。

身体录入采用晨晚切换、并排体重体脂、同行更多设置与紧邻来源；估算在字段原位显示已保存状态，与填实测同行。来源按晨晚合并的连续3次采用实测识别；草稿按有效值比较，空白或填后删空直接退出，已有值清空仍保护。首页提供真实缺项提醒，不自动补0或2058。食材营养默认四项一排，长数字及文字放大才自然退让；统一16px输入、44px操作与单层间距。无名营养行保留并阻止保存；包装只改名称不丢基准；超额照片整批拒绝且保留已有失败队列。直接添加活动、保存附近失败反馈、历史同日查看、导出错误与重试一并接通。总览排版和既有健康计算保持。

455项单元／集成及lint、类型、production build和结构检查通过；本地两引擎逐态检查后，正式Chromium 15项交互／48张主流程截图、39张密度截图，WebKit 15项／48张及39张密度截图通过。覆盖深浅主题、320／390／430px手机、矮屏、横屏及1100／1366／1440／1920px电脑，含200%文字、触屏、键盘与减少动态效果；实际查看正式手机身体、估算、食材及电脑截图。身体与补录两端共4段教程更新，其他6段保留；十段在本地播放核对，正式更新的身体两端在两引擎完整播放通过，全部媒体字节校验及Range206检查通过。共61项公开／保护入口与媒体检查通过；客户端异常和请求5xx为0，完整正式日志窗口Runtime error／fatal与5xx为0，无排除区间及后续分页。真实iPhone、系统键盘与系统原生全屏未测。

发布前后一致性备份entry-interaction-before／after-2026-11-04.json位于主工作区私有data/exports，权限0600，Git／部署忽略。43表结构、29条迁移账本及既有健康记录、请求、审计保持；5个本轮虚构账号及34表所属数据已清理。无迁移、历史初始化、运行依赖、公开HTTP／MCP或权限变化。私有证据在本发布工作区.codex/interaction-release；正式交付图在C:/Users/14878/.codex/visualizations/2026/11/04/formward-entry-production。本地虚构预览数据仍保留，未接触真实用户资料。

首轮正式检查在教程超时收尾时对已取消的拦截请求再次abort，导致检查脚本失败；客户端异常及5xx均0，失败截图／日志保留。修正测试为移除拦截后由页面／浏览器关闭请求，不吞异常；完整重验通过后才计入本次通过项。此处仅修改测试，无额外产品代码或部署变更。

上一READY部署dpl_7HXQr3oesTodRoLNQN3xGFeAXtVC保留用于应用回退，不回滚用户合法数据及审计。


## 发布前本地过程：表单密度修正（2026-11-04）

用户于2026-11-04明确授权发布本轮本地实现；发布不包含更新GitHub main。以下本地验收结果保留，正式部署与数据核对结果完成后另记。

用户退回了上一版的两列营养和多余留白；上一组截图只代表技术自检，不代表视觉认可。本次修正直接覆盖旧布局规则：食材四项营养默认一排，按实际文字宽度才退两排／一列，输入保留16px、触控保留44px；去掉label下边距和网格／分组margin的层叠。品牌、规格的选填标签保持同排基线；营养基准与每包换算合为一条短事实，来源补充入口同行。

身体普通与估算共用行高：估计状态位于标签行，数值与“填实测”同行，不再把来源向下推；直接录入取消重复返回行和说明，空腹提示放时段栏。来源前仅单层12px间隔，桌面时段标题也去掉旧padding叠加margin。数据、计算、营养精度与保存保护均保持。

新增FORMWARD_FORM_DENSITY_ONLY入口，检查四项营养的真实坐标、长数字退让、配对输入基线、身体来源距离、估算前后位置、200%文字、触屏切换和更多设置。Chromium／WebKit分别覆盖两主题、九种视口，各39张截图通过；另复核最后的桌面标题间距。相关lint、类型、production build、结构检查通过。身体两段教程随界面重录并重核帧同步、两引擎完整播放；其他八段保留。真实iPhone、系统键盘与系统原生全屏仍未测。

私有证据在.codex/interaction-check/density；最后两引擎专项实测桌面时段标题44px、营养四列、客户端异常0。交付图位于C:/Users/14878/.codex/visualizations/2026/11/04/formward-form-density，含手机三屏对照及两引擎电脑实际图，仍待用户视觉验收。预览复用原隔离虚构数据库，未清空验收输入；未发布公网、未推送或更新main，继续等待用户验收。前次截图与录像保留作对照。


## 录入交互统一：本地待用户验收

分支codex/entry-interaction-unification，独立工作区Formward-worktrees/entry-interaction-unification，从正式源码及发布记录f85e489建立。没有连接生产数据库、发布公网或更新main；原主工作区双区／COS／DNS等改动保持。无schema、migration、运行依赖、公开HTTP／MCP或权限变化。以下为本地实现，不能当作正式站已上线。

身体手机先晨晚、并排体重体脂、同行更多设置与来源；顶部保存两侧实际修改，编辑不重复概览。估计原位显示且不转实测，其他草稿保持。有效内容决定退出保护，空白与删回空白可退出，清空已有值仍确认。来源晨晚合并取目标之前3次有效实测，同槽一次，空来源中断、移除不恢复。首页新增独立于图表的昨日消耗／饮食及今日晨晚提醒。

餐项漏名称保留营养与草稿；AI包装只改名保留每包规格；超额照片整批拒绝且不丢已有失败队列。身体、个人资料、食材、来源、消耗与导出对齐输入与保存状态。独立库搜索／添加／编辑／详情入口清楚，详情展示标签基准、包装和四项营养。添加活动直达一条空草稿，失败靠近保存；历史日期有查看／Enter且同日可重开，导出原页校验与重试。已认可的总览读数、七日、导航与品牌保持。

455项单元／集成、lint零警告、类型及production build通过。隔离原生PostgreSQL的Chromium／WebKit各14项主流程、各48张截图通过；另测超额选图保留原失败队列、库详情与输入边界。两引擎各完整播放十段影片并检查键盘步骤重看；身体／补录共四段重录，其余六段经核对保留。所有数据均为虚构账号。实际尺寸、对比度、自检与未测项见[验收记录](docs/maintenance-verification.md)；规则归入[设计规范D11](docs/design-reference.md#d11录入任务草稿与反馈)。

本地验收入口http://localhost:4183，账号review@formward.example.test，密码Entry-review-2026。仅供本机虚构数据验收，独立PostgreSQL与127.0.0.1应用服务；private .codex/interaction-check/local-preview.json记录进程和目录。真实iPhone、系统软键盘、系统原生全屏未测。用户验收仍待完成，不把自检通过当作用户认可。

## 当前发布：营养最多一位小数

正式域名https://formward-ten.vercel.app已核对READY部署dpl_7HXQr3oesTodRoLNQN3xGFeAXtVC，应用源码332115d0d2bc86f2588539d920af1cf4a6082e6a，构建0a48dc57-73d1-49da-a67b-1275d2741d2e。来自独立工作区Formward-worktrees/meal-entry-macros、分支codex/nutrition-decimal-input；仅发布本轮营养精度调整，未推main，主工作区双区／COS／DNS等未上线内容保持隔离。

蛋白质／碳水／脂肪的网页手填、AI手工修改与显示统一最多一位小数，去掉末尾0，第二位小数明确报错并阻止提交。热量仍按原精度计算和合计后四舍五入显示整数；1.2／0／0.1保留5.7kcal、显示6，17.5／4.3／1.1保留97.1kcal、显示97。Excel宏量列0.#，能量0，身体0.00。旧四位数只聚焦、失焦或改备注不舍入写回；公开HTTP／MCP、包装换算及计算落库原精度保持，没有迁移、依赖或权限变化，其他交互审查建议未实施。

443项单元／集成、lint、类型、production build、结构检查及目标Impeccable检测通过。隔离原生PostgreSQL及正式Chromium／WebKit均通过每引擎20组餐次场景、15组详情、12组独立库和3项小数专项；正式各79张截图，实际检查手机深浅主题小数输入及电脑AI结果。覆盖一位允许、第二位拒绝、真实保存、旧四位只改备注保持、未知／0、换算及AI统一确认。新增旧值夹具的已有备注导致首次测试严格标签定位超时，修正测试定位后重跑通过，原失败证据保留，未过滤客户端异常。真实iPhone与系统软键盘未测。

正式7项公开／保护入口通过，sourceCommit与gitCommitSha严格对应上述应用源码、canonical别名及build一致。两引擎正式客户端异常和5xx均0；最终UTC11:15:08—11:35:08完整20分钟Runtime error／fatal及请求5xx为0，无排除区间及后续分页。2个本轮虚构账号与34张所属表数据已清理。前后私有一致性备份严格核对43表、29条迁移账本及全部既有行值，issues为空，无本轮OAuth特例或真实健康记录改写。

证据位于主仓ignored .codex/nutrition-one-decimal-release，生产run为2026-11-03T11-25-21-797Z-41405b14；本地证据位于独立工作区.codex/nutrition-one-decimal-check。nutrition-one-decimal-before／after-2026-11-03.json及production-verification在私有data/exports、0600、Git及部署忽略。上一READY部署dpl_DpXQjf62CNDgHQSXqPtupeexqUF5保留供应用回退；不回滚用户合法数据。

## 此前发布：营养小数与整数热量

P／C／F小数录入与整数热量展示已发布。正式域名https://formward-ten.vercel.app指向READY部署dpl_DpXQjf62CNDgHQSXqPtupeexqUF5，应用源码560e9a93f2597682acf061f5c5bf5f9a88156e04，构建16afb946-18f8-48b4-bcff-9bc58a9dfcef。分支codex/nutrition-decimal-input，独立工作区Formward-worktrees/meal-entry-macros。本轮仅发布，未推GitHub main，主工作区双区／COS／DNS及其他未上线内容保持隔离。

网页餐次、食材规格及AI手工修改的蛋白质、碳水、脂肪可填最多4位小数，编辑显示原精度；查看最多2位并去末尾零。kcal、消耗与热量差仍四舍五入显示整数，计算、合计与落库不提前取整。P1.2345／C0／F0.1保留5.838kcal、显示6；17.5／4.25／1.1保留96.9kcal、显示97。Excel宏量列0.##、能量0、身体0.00，仅改变显示格式。旧值聚焦／失焦及仅改来源／备注不舍入写回；未知与明确0、包装换算、公开HTTP／MCP精度保持。未接入上一轮其他交互审查建议。

443项单元／集成、lint、类型、production build、结构检查和修改目标设计检测通过。隔离原生PostgreSQL及正式Chromium／WebKit均通过各20组餐次场景、15组详情、12组独立库与3项小数专项；正式各79张截图，手机／电脑、深浅主题、320／390／430／横屏／1100／1440、四位输入／五位拒绝、真实保存、旧值保持、食材与AI确认复验。实际查看正式手机及桌面AI截图。最初PGlite协议异常和测试遗漏既有大幅变化确认的失败证据保留；改用独立原生PostgreSQL、等待真实页面就绪并显式完成确认后通过，没有吞异常或改变应用保护。真实iPhone与系统软键盘未测。

正式7项公开／保护入口通过，正式别名、源码与build再次核对；最终正式客户端异常及5xx为0，部署最近20分钟Runtime error／fatal与请求5xx均0，无排除区间或后续分页。2个本轮虚构账号及34表所属数据已清理。43表结构、29条迁移账本、既有健康记录、请求和审计保持。首次严格对照仅发现一次既有OAuth授权续期及同时间认证防重放缓存；旧令牌撤销、新令牌有效，身份／会话／client／授权码／权限／资源逐项相同，旧部署同秒token接口200佐证，正常使用保留。严格初报及最终窄范围核对均留档，最终issues为空。

备份nutrition-decimal-before／after-2026-11-03.json及nutrition-decimal-production-verification-2026-11-03.json在私有data/exports、0600并被Git／部署忽略；证据.codex/nutrition-decimal-release及独立工作区.codex/nutrition-decimal-check。没有迁移、历史初始化、运行依赖、公开字段或权限变化。上一READY部署dpl_5WnHbK1FTZtuSG1GjMYatBhxz84J保留供应用回退，不回滚用户数据或正常授权续期。

## 此前发布：六位密码与历史来源点选

密码至少六位与手机历史来源点选修复已发布。正式域名https://formward-ten.vercel.app指向READY部署dpl_5WnHbK1FTZtuSG1GjMYatBhxz84J，应用源码c11c977ab15f81a7d000d9b4c290d0c509b3cab6，构建8fcb296d-a9eb-4a75-b744-bb2399a5ef34。分支codex/password-minimum-six，工作区仍为Formward-worktrees/meal-entry-macros；本轮仅发布，未推GitHub main，主工作区双区／COS／DNS及其他未上线内容保持隔离。

新密码统一6–128字符，邀请激活、重设、本人改密、owner本地恢复、内部创建、认证配置和页面提示共用password-policy.ts；原有密码保持。SourceInput候选改成真实按钮，触屏不取消按下事件，输入先失焦时不抢先收起；身体、消耗与AI确认共用，选中仍先进入草稿，再按原流程保存。

本地440项单元／集成、lint、类型、production build及结构通过。正式Chromium／WebKit最终各18组来源检查、16张截图通过；来源触屏／失焦／重复／中文／键盘、身体及消耗保存、AI应用后统一保存、建议移除与旧来源保持均复验。普通虚构账号在正式网页验证五位不提交、六位改密后登录、旧会话和AI令牌失效；邀请／重设和owner维护六位流程仅在隔离环境验证，没有仿造生产管理员。首轮WebKit出现Load failed，追踪复跑发现AI收据2秒回总览与脚本提前跳页竞争；测试现等待真实返回再继续。两轮失败留档不计通过，最终WebKit复跑无页面异常、无过滤异常。真实iPhone与系统键盘未测。

7项公开／保护入口通过，正式别名与源码绑定再次核对；最终通过组客户端异常及5xx为0，部署最近20分钟Runtime error／fatal和请求5xx均0，无排除区间及后续分页。4个本轮虚构账号及所属数据已清理；发布前后43表结构、29条迁移账本和既有行值严格对照通过，issues为空。备份database-before／after-source-password-2026-11-02.json及source-password-production-verification-2026-11-02.json均位于私有data/exports、0600并被Git／部署忽略。证据.codex/password-minimum-six/release，最终截图为production/chromium及production-final/webkit；前两轮WebKit记录保留。没有数据库迁移、历史初始化、运行依赖或公开权限变化。上一READY部署dpl_9NN2wRePFTmKhbXnQ7Zit6xJcDfq保留供应用回退，不回滚健康数据。

## 此前发布：食材库名称与电脑重复按钮修正

手机独立食材库换行与电脑重复按钮已修正并发布。正式域名https://formward-ten.vercel.app指向READY部署dpl_9NN2wRePFTmKhbXnQ7Zit6xJcDfq，应用源码2157ed8c415f0680c37fdeccd656000d4a1d3087，分支codex/meal-library-width-fix（工作区仍为Formward-worktrees/meal-entry-macros）。这是刚上线餐次功能的后续纠错，main未更新；主工作区双区／COS／DNS及其他未上线改动保持隔离。

原因是独立食材库切换为手机网格列表后，仍被旧电脑名称32%列宽压缩，390px触屏复现名称仅75.72px。现仅在宽容器表格采用32%，手机名称占满实际分配的四列区域（约227–237px，随视口和滚动条变化），不缩字、不靠禁止换行遮住长名。电脑双栏时取消“自己填写／从食材库添加”和“返回本餐”，直接使用左右两栏；窄屏单栏保留必要切换。餐次窗口内食材选择及独立食材库分别检查；热量计算、保存、数据库结构和公开协议没有改动。

439项单元／集成、lint、类型检查、production build、结构及链接通过。隔离和正式Chromium／WebKit分别各20组餐次场景、15组详情、12组独立库深浅主题与六种屏宽检查通过，各76张实际截图；新增名称框实际宽度应等于其网格分配宽度的断言。正式手机390、浅色320、电脑1440和修复前后截图已正常比例查看；两个库入口、按钮显示、包装换算、旧值精度、4／4／9和AI确认回归均通过。客户端异常与请求5xx为0，部署最近20分钟查询窗口Runtime error／fatal及请求5xx为0，无排除区间和后续分页。7项公开／保护入口通过，构建标识21875fc8-97d9-45f3-b206-a8aac62b0cf2。真实iPhone及系统软键盘未测。

43表结构和迁移账本保持；2个本轮虚构账号及所属数据清理。首次严格对照发现正式账号期间一次正常网页消耗保存（含来源使用时间）和一次管理员解锁，已用原／新快照、操作、前后审计、操作者、确认者、版本和时间逐项对应；这些合法更新原样保留，其余原行无未解释变化。严格原报告留档，最终逐行核对issues为空，不把正常使用回滚。备份database-before／after-meal-library-width-2026-11-02.json、严格及最终meal-library-width-production-verification报告均在私有data/exports、权限0600并被Git／部署忽略。第一次备份进程未完成，保持生产只读，重试成功后才发布。私有证据.codex/meal-picker-width-fix；没有新迁移、依赖、权限、公开字段或历史初始化。


## 此前发布：餐次双入口、四项同排与自动热量

餐次填写双入口、手机四项营养同排及4／4／9辅助已发布。正式域名https://formward-ten.vercel.app指向READY部署dpl_4Y3ysQAqRiXBGhRFcJcRsUX7BY4j，应用源码70093d0bda2a839b8255c9e1b99aba8b9ff2f04e，来自codex/meal-entry-macros。用户看过实际页面后明确要求直接发布；本轮没有更新GitHub main。以此前正式6b6ed95为基线，仅本轮共用餐次填写修改，未夹带主工作区双区／COS／DNS或其他未上线内容。

修改影响“饮食→录入／添加一餐／编辑”和“AI确认→修改”，手机与电脑都生效：两种添加方式用明确按钮、库内有添加／返回本餐、路径切换保留草稿；新空项按需打开。手机另修日期／餐次重叠，名称整行、单位／数量一排、普通四项营养一排。自由项三项齐全按4／4／9算本次热量，17／4／1为93；手填立即采用，下次实际改宏量重算。库值、旧精度、数量换算及公开请求保持；不重算历史记录。其他三页布局保持上一已上线版本。

439项单元／集成、lint、类型、production build、结构与链接通过。正式Chromium／WebKit各20组视口／主题／触屏场景、15组详情定位及64张实际截图通过；手填／库换算、真实保存、AI应用后统一保存、0／未知／小数提示、旧值精度与两主题均复验。实际查看正式手机390、库选择、浅色320和电脑1440截图。客户端异常、请求5xx及部署20分钟查询窗口Runtime error／fatal均0，无排除区间和后续分页。7项正式公开／保护入口通过，版本接口no-store、构建标识4692e222-89fa-43da-b39b-aa7b83fde378。真实iPhone、系统键盘与整个页面200%字号放大仍未测。

发布前后43表结构、迁移账本及既有行值由0600私有一致性备份核对通过，issues为空；2个本轮虚构账号、事实、预览、令牌、会话和所属审计均清理。没有迁移、新依赖、公开字段或权限变化。证据在.codex/meal-entry-macros/release，备份与核对在data/exports/*meal-entry*2026-11-01.json。旧临时本地预览及对应PostgreSQL已停止，今后从正式站查看。额外既有别名global.formward.top仍在平台关联，但当前环境DNS为ENOTFOUND，未计为通过；本轮没有动DNS，正式验收地址为formward-ten.vercel.app。


## 此前发布：手机两排总览与七日空带

独立分支codex/overview-mobile-readings从a9988ea建立，保留已上线版本和主工作区其他改动。按用户确认图实现手机两排三项：摄入／消耗／收支；次晨变化附前后晨重／近7天收支／近7天体重变化。电脑保留六项与原有排法，仅取消七日详情并直接显示依据、清除下方提示占位。日期行承载必要短提示，其他三页默认不变。无数据库、计算或公开协议变化；用户随后明确要求停止追加修改并先发布上一轮实际页面版本；刚才追加的进一步压缩调整已撤回。正式域名https://formward-ten.vercel.app已核对READY部署dpl_5wG2mhigVVdqfkYfu55Rkc9wvbAC，应用源码7a21fd30ef738cfe37151c99f61440d38bfdbe41。本轮只发布，不推main。本地435项单元／集成、lint／类型／production build、结构及链接核对通过；Chromium／WebKit各22组／28图，另各1张粗指针横屏图，异常和5xx为0。普通选日几何差≤1px，窄横屏和重复分隔线已修正后重跑。正式Chromium／WebKit各14组／10图通过，4项公开及保护入口通过，异常／5xx为0；1个虚构账号及所属数据清理，43表结构、账本和既有行值核对通过。物理iPhone、系统键盘和原生字号放大未测；详细结果见本轮维护验收记录。

## 此前发布：总览、饮食填写与公共记录区统一

正式域名 https://formward-ten.vercel.app 已指向 READY 部署 dpl_2CUg9wgqE4EfJjkJbzg9MWarSnVQ，应用源码为25ed59cf9dfbd9cedf83b7c013fae03a6d4b5d7d。以main的fdf2dba建立隔离分支codex/ui-consistency-release，用户仅本轮明确授权测试及实际浏览器自检通过后直接发布并同步GitHub main；主工作区双区、COS、DNS和未上线迁移保持隔离。

- 电脑六项日读数同排、数值基线统一，近7天改为紧凑横向摘要；手机保留分组与七日折叠。标题、单位和图例共用规则，按区间最长数字预留列宽，选日不抖动。
- 饮食输入持续显示边框和底色，恢复两主题刻度；顶部固定目标日期、合计与金色保存。添加照片有可见按钮，键盘仅通过该按钮进入文件选择，不落入隐藏控件；换算项保持只读。
- 饮食、消耗、身体共用最近记录、描边操作及历史展开，行内按钮贴齐记录上沿；减少动态效果时按钮无过渡。食材库位于最近记录标题右侧。
- 网页新增餐次、日消耗及AI手工修改共用正值检查：全空／全0不能保存，已知部分与合法0保留；只检查当前采用模式。本人旧值／版本核对后，单改备注或来源不舍入旧数值。公开HTTP／MCP、未手改AI预览及其他业务规则保持。
- 饮食、补录、AI手改两端共6段影片更新，其他4段保留；旧散列媒体兼容未刷新页面。

435项单元／集成、lint、类型、生产构建和结构检查通过。本地两引擎各18组／102图、餐次原生PostgreSQL专项、真实双构建8项更新提醒通过；正式两引擎各33组／45图，最终记录区与照片键盘专项另各9组／48图通过。104项公开入口、媒体校验与Range检查通过，正式20分钟日志无error／fatal或5xx、无排除区间。实际截图逐张检查；物理iPhone、系统键盘与系统原生全屏未测。

发布前后43表结构、29条迁移账本和既有健康事实保持，无迁移、新依赖、公开接口、权限或历史初始化。5个本轮虚构账号及所属数据已清理。期间真实账号正常新增饮食与身体记录及授权刷新，已逐项对应本人确认、前后快照、来源与令牌轮换审计并原样保留；没有因行数变化回滚真实数据。私有备份、对照和截图见.codex/ui-consistency-release/release及data/exports，详细结果见[验收记录](docs/maintenance-verification.md)。

## 此前发布：总览、教程与双色主题

总览七日统计、手机折叠、教程修正、双色主题和版本提醒已发布。正式域名https://formward-ten.vercel.app，READY部署dpl_3vbWKmAhFfULQDjRALD68qWv96vW，应用源码6f2c0454700947ee481c15137dde7700b33d521c。用户已验收实际页面并明确授权发布及更新GitHub main；此前已上线的品牌、AI确认和首次使用代码一并同步，不包含主工作区未上线的双区、COS、DNS或0028。无新迁移，原结构与全部既有健康记录、请求及审计保持。

正式Chromium／WebKit各28组检查、39张截图通过，客户端异常与请求5xx均0；64项公开入口、媒体SHA256及十段MP4 Range206通过。手机近7天默认收起、展开及真实七日合计／覆盖数、四页两套主题、身体预览播放、手机完整录屏、个人资料、新旧账号和首次使用流程均复验。5个本轮虚构账号及其健康记录、操作、审计、资料和会话已清理（首轮2个、修正测试后3个）；43表的发布前后私有备份核对通过，迁移账本不变。部署验收日志查询无Runtime error／fatal和5xx，无排除区间及后续分页。

- 总览增加选中日晨重、次晨晨重与变化，以及前6日至选中日的七天收支。体重比较开始晨至结束次晨；部分收支显示已计天数，缺失不当0。按最新要求，手机近7天默认折叠，电脑展开。
- 应用内浅色／深色、Logo自动黑白，偏好只记本设备。登录人物首页保持深色，照片和影片不反色。图表含柱内P／C／F的对比单独适配。
- 删去截图四句重复说明和实际占位。生日旁保留真实年龄，演练页头仅保留一次“演练·不保存”。
- 五段手机教程重录为390×640＋56px字幕，所有49次点击在安全可视区内且实际命中验证。电脑身体教程重录，短预览使用真实填写片段；其余四段电脑影片复用已核实原片。十段完整解码，身体预览检查到真实像素变化。播放器标题旁提供全屏，首次播放把标题及影片置入视野。
- 每次构建固定版本号，GET /api/app-version不缓存、不查健康数据。前台90秒及恢复检查；发现更新只提示，弹窗／全屏时延后，刷新前保留草稿确认。首次启用前的旧页面需要先手动刷新一次。
- 无数据库迁移、无新增运行依赖、无历史健康记录写入，HTTP健康协议和MCP权限保持。

私有原片、操作脚本、精确时间、实际点击坐标、截图和报告在 `/home/obl1vion/projects/Formward/.codex/overview-theme-tutorial`。公开媒体仅虚构账号数据。428项全套单元／集成通过；饮食颜色适配后76项相关测试另验通过；lint／类型／生产构建通过。Chromium、WebKit的四页及教程／首次使用实际检查见验收记录；真实iPhone、系统键盘与原生系统全屏未测。更新提醒另用两份真实构建与临时原生PostgreSQL验证取消、刷新、新版本、同地址及登录保持，不用PGlite的跨进程模拟代替。


## 首次使用、个人资料与教程：已发布公网

正式域名https://formward-ten.vercel.app已核对READY部署dpl_FANbZV1926TEotnBfbL2ae17Ah89，应用源码95f10004f8d29a422b8a6259620dc4678e68b0cf，独立分支codex/onboarding-release。用户明确授权完成自检后直接发布；main未合并，双区、COS、DNS及0028没有带入。

工具栏提供查看教程，账号菜单提供个人资料；仅owner有测试初次登录。新账号填写／跳过资料→说明→开始使用，云端继续进度；已有账号不强制重走。管理员演练使用空白临时输入，不调用真实保存，不修改资料、引导状态或健康事实。真实owner会话未代登录，权限与零写入在隔离owner验证，正式普通用户拒绝已验证。

教程默认饮食，悬停／聚焦不换主题，点击只选择，再点预览标题旁“观看完整教程”。电脑五段1280×800重新实录，字幕另80px，大预览最大正文1440px、左目录208px；不裁上下，不固定320px。手机原位影片全宽等比例，操作随内容滚动；教程不显示会挡住全屏按钮的工具把手。保留文字、步骤跳转、减少动态效果与失败重试，修复暂停跨尺寸后空白。

个人资料在0029_personal_profiles新增表，身高、生日可空，年龄计算，版本与引导状态按本人账号保存；不复制体重，不恢复公式，不生成消耗。42张应用表及迁移账本共43表。既有账号没有被回填；生产新表在验收清理后为空。

验证：424项单元／集成、lint零警告、类型和production build通过；本地Chromium／WebKit各40项、33张截图，目录与观看按钮专项各7项、24张；正式各20项、14张截图，客户端异常和5xx均0。十段全片H.264解码及40张关键帧通过；正式64项入口／媒体SHA256／Range206检查通过。正式别名与gitCommitSha交叉核对，部署20分钟日志查询无Runtime error／fatal、无请求5xx、无排除区间。真实iPhone、系统键盘、系统日期选择器和原生全屏未测；200%仅视口模拟，不冒充真实菜单缩放。

私有备份data/exports/database-{before,after-migration,before-final,after-production}-onboarding-2026-11-01.json和onboarding-{migration,production}-verification-2026-11-01.json均0600，Git／部署忽略。迁移前后旧结构和值保持；正式期间既有账号新增一笔手动确认消耗及来源使用／删除操作，已核对本人操作者、确认批次、前后快照和时间，原样保留、不回滚。旧健康事实、原请求和审计保持；共10个虚构测试账号、资料与会话清理并核对无残留。

证据在主工作区.codex/onboarding-release，媒体原片／脚本／保存结果在tutorial-production，本地local与visual、正式production均分两引擎。0028_regional_image_storage未上线；双区将来合并必须重新安排迁移依赖和顺序，不能在已执行0029的账本中插入旧时间0028并假定会执行，也不能改已共享的旧迁移。

## AI消耗确认：已发布公网

用户于2026-10-31验收实际手机与电脑页面后明确要求发布。正式域名 https://formward-ten.vercel.app 已核对 READY 部署 dpl_7D4YT9WWAex4TCJpACpetuktb7ej，应用源码 a2c24f14fe0e0cd205d4adc37682c0dbb09aa730，位于独立发布分支 codex/energy-review-release。以已上线品牌版本9bd0da8为基线，仅提取本轮AI确认修改，品牌与既有账号安全保持，未带入双区、COS、0028、环境或DNS变更；main未合并。

同一日期的全天消耗与运动分组，手机纵排、电脑左右对照；来源备注默认收起，真实变化才显示前后对照，分组取消经应用确认。自动核对已有运动只引用ID／版本，保留801运动＋145期间静息分项，不把946全作额外运动。旧自动核对预览须刷新并重选，未批量改写已保存记录或原始请求。

正式基线414项完整单元／集成、lint零警告、类型、production build和目录检查通过；隔离与正式站Chromium／WebKit各19张实际截图、16组检查，最终客户端异常和5xx均0。已实际查看正式手机及电脑页面。正式20项公开／受保护入口与5份品牌图标字节校验通过，部署20分钟Runtime error／fatal与请求5xx均0，无排除区间；CLI精简inspect结果用元数据筛选列表的URL与gitCommitSha交叉核对源码绑定。真实iOS及系统软键盘未测。

发布前后私有备份data/exports/database-before-energy-review-2026-10-31.json、database-after-production-energy-review-2026-10-31.json及energy-review-production-verification.json均0600、Git／部署忽略。42表结构、迁移账本及原有行值保持，新增原表行及旧字段变化均空；两个虚构普通账号、记录、预览、凭据和所属审计已清理。没有migration、历史初始化、公开工具或权限变更。证据在主工作区.codex/energy-review-release/，正式浏览器截图与报告位于production/{chromium,webkit}/；正式源代码与独立发布记录同分支保存。

## 已保留发布：正文与工具把手居中修正

正式域名https://formward-ten.vercel.app已核对READY部署dpl_2C8bsftEneVCMEVdPidswep4kxxQ，应用源码bcbca33，main已推送GitHub。以账号管理版本1cd5c4d为基础，纠正既有导航布局的居中定位：正文左右112px对称预留、页头对称回扩；右侧三点把手按自身中心对准视口中线，手机次级页入口清除电脑位移。

1440×900修复前实测正文向右24px、把手中心向下77px；修复后隔离和正式站Chromium／WebKit均为0偏移。两引擎正式各38张实际截图，覆盖1100／1440／1920px及不同高度、320／390／430px手机、滚动、原页窗口调整、150%CSS放大、工具展开／Escape、减少动态效果，以及AI／导出页手机右下角入口。实际查看修复前后及正式截图；真实iOS和系统软键盘未测。409项完整单元／集成、lint、类型检查、生产构建、结构及269项根文档／docs本地链接通过；两引擎共用饮食填写、旧精度、包装换算和AI确认回归通过。正式19项入口通过，客户端异常、请求5xx及该部署20分钟Runtime error／fatal均0，无排除区间。

本轮没有migration、历史初始化、账号角色／权限、健康计算或公开协议变化；保留0027及全部账号安全检查。生产前后data/exports/database-before-centering-2026-10-30.json、database-after-production-centering-2026-10-30.json及centering-production-verification.json均0600、Git／部署忽略；42表结构、账本、原账号／密码、健康事实、请求与审计保持，未新增原表行值变化，虚构普通账号、会话和所属审计已清理。证据.codex/centering-before/、.codex/centering-visual/、.codex/centering-meal-regression/及.codex/centering-release/。

## 已保留发布：账号管理第一版

用户已验收实际页面并明确授权发布公网、上传main。正式域名https://formward-ten.vercel.app已指向READY部署dpl_GZNxCaMsEgWT3mwa4ZyhhW3SaF46，应用源码c9baf09；0027已迁移，并按用户指定邮箱预览、核对ID后初始化唯一owner，原密码保持。main包含实现及本轮发布记录并推送GitHub。账号仍仅邀请制、手动交付链接、后台密码再次确认；邮件、公开注册和MFA留后续。以后修改继续按设计D8与当次授权处理。

已实现 `/admin` 三页签、本人账号设置、fragment 激活／重设、72小时邀请与15分钟重设、十分钟会话绑定验密、统一停用／全部撤销／改密、审计与受控owner初始化／恢复。Admin直接接口关闭，网页写入在既有账号行锁内复核会话版本，AI/OAuth复核活动状态和原授权，恢复不复活旧授权或审核。0027只增账号字段与两表，既有健康数据、密码和邮箱验证不回填。owner继续使用原账号和密码，在账号菜单进入管理后再次验密。

409项完整单元／集成、lint零警告、typecheck、production build、Drizzle check、真实PostgreSQL多连接并发、原登录／媒体／OAuth浏览器回归通过；隔离账号Chromium／WebKit各41张实际截图与十组检查通过。正式两引擎各17张截图与五组检查、19项公开／认证／私有路径检查通过，客户端异常和请求5xx均0；该部署20分钟日志查询窗口Runtime error／fatal和请求5xx均0，无排除区间。生产只用虚构普通账号验收激活／改密／重设、撤销及四页，不使用或仿造真实owner密码／会话；后台解锁、停用恢复与并发完整流程在隔离环境通过。静态图片与视频等待竞争、空账号身体页首次渲染日期已修复；真实iOS和软键盘未测。

私有备份data/exports/database-{before,after-migration,after-owner,after-production}-accounts-2026-10-29.json及accounts-*-verification-2026-10-29.json均0600、Git与部署忽略。迁移前40表、迁移后42表（含迁移账本），旧字段定义、原账号、密码、健康事实和授权保持，账本仅新增0027；指定账号仅增加owner角色及初始化审计，正常限流元数据单独处理。虚构账号、链接、审计和所属数据均已清理。证据 `.codex/accounts-release/`、`.codex/accounts-visual/`、`.codex/account-*.log`；说明及逐项验收见docs/auth-setup.md、docs/maintenance-verification.md。

回滚不得退回忽略banned／access_version的旧认证代码或复活已撤销凭据；保留新增结构和安全检查，必要时先关闭管理写入口再修复，不重跑个人历史初始化。

## 已有发布：电脑左侧导航与手机贴底导航

正式域名https://formward-ten.vercel.app已核对READY部署dpl_J1iW1MiZuL2MbxPjkdEPQHDdJX2E，应用源码b81dac3。电脑采用左侧72px图标文字导航，手机采用贴底四项导航、最右侧单独放工具；电脑工具由屏幕右侧三点把手打开，账号改为右上角人像。main已推送GitHub；本次用户明确授权免去再次验收等待，完成必要测试和实际网页自检后直接发布。

392项完整单元／集成、lint零警告、typecheck、production build、结构／267项文档链接／diff检查通过。隔离与正式站Chromium、WebKit均覆盖320／390／430px手机及1100／1440px电脑，正式各67张截图；检查四页真实跳转及高亮、滚动固定、侧栏不移动正文、菜单与填写窗口互斥、键盘焦点／Escape、触屏横屏、活动合计保护、AI草稿和悬停稳定。四页日期与主要读数共同基线一致。两引擎共用饮食填写、旧精度、换算与AI确认本地回归通过。正式16项入口通过，客户端异常与请求5xx均0；部署20分钟Runtime error／fatal及请求5xx均0，无排除区间。真实iOS及系统软键盘未测。

发布前后data/exports/database-before-navigation-2026-10-29.json、database-after-production-navigation-2026-10-29.json及navigation-production-verification.json均0600，Git／部署忽略。40表结构、迁移账本、原健康事实、请求及审计保持，虚构账号及全部所属数据已清理；正常限流元数据单独处理。没有migration、历史初始化、权限、公开协议、环境变量或健康计算变化；OpenAPI1.13.0、MCP1.11.0保持。正式证据.codex/navigation-release/，本地证据.codex/navigation-visual/及.codex/navigation-meal-regression/。

上一正式部署dpl_8LHcATdFBb84treQSb8iuEJ9kKY7保留供回退；不回退健康规则或数据库。此次跳过再次用户验收仅按当次明确指令，后续继续依设计D8和当次授权处理。

## 本轮：消耗交互与工具侧栏（已发布，main已更新）

用户查看实际本地截图后，于2026-10-29明确要求“发布，并且更新到main分支”。正式域名https://formward-ten.vercel.app已核对READY部署dpl_8LHcATdFBb84treQSb8iuEJ9kKY7，应用源码5347929；main已包含本轮及此前已上线提交，并已推送GitHub。发布验收记录独立提交，不改变部署中的应用代码。以后修改继续按D8先交付实际页面、获用户确认后发布。

消耗“含估计／估计”提示已从总览、消耗和摘要移除，身体推算标识保留。必要饮食提示按当前区间预留紧凑高度，选日不挤动读数、区间及图形；无提示区间不占行。活动合计自动时只注明明细数量，手填后才显示来源；“填写方式”菜单和清空失焦共用切换确认，展示实际前后值。取消保留数值、来源、备注和包含关系；AI应用修改后仍须统一确认保存。

页头工具打开320px覆盖式右侧栏，手机不超过屏幕减16px；AI接入、Excel真实可用，打卡记录、最近总结和站内AI录入暂未开放。账号菜单只留账号和退出，AI确认页不加工具入口。关闭工具恢复焦点、滚动及固定日期；填写窗口打开时阻止再开工具。

392项单元／集成、最终提示专项5项、lint、typecheck、production build、结构和267项文档链接检查通过。正式域名Chromium／WebKit各完成五种宽度、四页、手填／累计／确认、包含关系、清空后点其他控件、未知／0、失败保留输入、AI草稿和选日稳定性，共66张实际截图／引擎。16项公开与保护入口通过，客户端异常及请求5xx均0；该部署20分钟日志窗口Runtime error／fatal和请求5xx均0。真实iOS与系统软键盘未测。

发布前后私有备份data/exports/database-before-energy-tools-2026-10-29.json、database-after-production-energy-tools-2026-10-29.json及energy-tools-production-verification.json均0600，Git／部署忽略。40表结构、迁移账本、原健康事实、请求及审计保持；未执行migration或历史初始化，未改公开协议、权限或环境变量。虚构账号及所属数据已清理；正常限流元数据单独处理。正式证据.codex/energy-tools-release/，逐项验收见docs/maintenance-verification.md。

未来打卡按空腹晨重＋饮食已记全＋消耗最终总数规划，用户明确确认整天完成后才反馈；补录归原日期，改动需重新确认，重复确认不重复累计。消耗可手填，未知不自动填0或2058。本轮不实现打卡计算、存储或聊天。

## 上次发布：数据优先布局、运动说明与整数录入

用户在本地实际页面截图交付后，于2026-10-28明确要求“发布公网，然后上传GitHub”。已按本次授权完成备份、手动发布、正式站复验、虚构数据清理与分支上传。正式域名https://formward-ten.vercel.app指向READY部署dpl_BJPfF6RaHjeRUMbmDJd6bwbwzQva，应用代码4e60a2f；分支codex/latest-records-energy-sources已推送，未合入main。发布结果和交接另行提交，不改变部署中的应用代码。

四页顺序统一为日期/查看、主要读数、区间、标题与实际选项、图例及图形；主数字突出、区间轻选中、数字与单位同行。电脑展开身体最近值和统计，手机收起次要统计。运动本次851=741运动＋110期间静息；已含在活动1357时不再增加，静息2058时当天3415；额外增加时4156，自动累计时2799。填写、详情和AI确认共用说明，消耗窗口分隔与操作间距已修正。网页营养/消耗新手填整数，身体两位；旧值、份量/包装换算、公开协议精度保持，无migration或权限变化。

387项单元／集成、lint零警告、类型检查、production build、目录/链接/diff检查及本地浏览器回归通过。正式域名Chromium/WebKit均完成四页七组视口、整数/非法小数/旧四位只改备注、自动/手填0/清空、单运动完整日预览、包含关系、滚动顶部/中段/底部、AI确认、小型确认取消/Escape、自定义、键盘、触屏、150%放大与减少动效。16项公开/保护入口通过；正式浏览器请求5xx和客户端异常均0，部署20分钟日志窗口Runtime error/fatal及请求5xx均0。实际查看正式手机饮食、电脑身体、消耗中段和AI截图；真实iOS与系统软键盘未测。

发布前后私有备份data/exports/database-before-data-first-2026-10-28.json、database-after-production-data-first-2026-10-28.json及data-first-production-verification.json均0600、Git/部署忽略。40表结构、迁移账本、原健康事实、请求及审计保持，无原行删除、新增健康事实或虚构数据遗留；未迁移、未重跑历史初始化。测试服务与临时数据已清理。正式证据.codex/data-first-release/，本地证据.codex/data-first-visual/、.codex/data-first-entry-final/、.codex/data-first-long/、.codex/data-first-touch/与.codex/data-first-updates-final/；逐项记录见docs/maintenance-verification.md。

设计D8继续适用于以后修改：参考图与自动测试通过不能代替用户对实际网页的确认；本轮已通过上述明确发布指令满足门槛。

更新日期：2026-10-29。仓库 `/home/obl1vion/projects/Formward`，当前分支 `main`，已推送GitHub。先读根README、AGENTS、本文及目标目录最近README；修改Next.js前读取已安装包的本地指南。

## 身体、运动与记录更新

身体同一天晨间／晚间各采用最后保存的一条实测，网页编辑与AI确认覆盖原记录，遗漏字段保留。旧候选留档，后续覆盖或删除归档被取代记录；不会因为删掉最新值而显示旧值。身体表单已有数值旁可单独删除，二次确认写明日期、时段和指标，另一指标与另一时段保留；最后一个指标删除后退出有效记录，不自动估算。身体未来日期由网页及共用业务校验拒绝；按录入时区判断，无上下文时采用Asia/Shanghai校验，不改写未知来源时区。晨间继续只收空腹。

运动支持只记总数／分开填写：calorieMode=total或旧请求采用caloriesKcal原数；components保存exerciseActiveKcal纯运动和exerciseRestingKcal期间静息，只将纯运动计入当天，二者均已知才显示本次总数。未知不补0，未完成不计入。只有采用中的活动合计或全天总消耗存在时询问是否已包含，并标出对应数值。旧运动不回算。0026只新增活动三列和约束，无健康数值回填。

四页每90秒及重新可见时核对本人记录变化，后台暂停；发现变化提示日期和内容，填写保留，用户选择采用最新才更新。保存前再核对，手工明确继续可覆盖，AI须刷新后确认。私有/api/record-changes仅网页登录可用，检查新增、修改、删除及日状态；不新增公开工具或权限。

饮食修改后提示重新确认已记全，AI修改按钮称“应用修改”；常见餐次全站中文，新保存中文、原请求及旧记录原文留档。营养占比保持，自由食物保留本次总量输入。饮食／消耗支持手机横向拖选，纵向正常滚动，自定义应用前保留原图、取消不变。封面图片失败或超过4秒显示普通登录。数量级变化仅作温和核对，不改数值。

本机379项单元／集成、lint、typecheck及production build通过。隔离网页验证身体覆盖／单指标删除、两种运动及AI分项编辑、90秒更新和返回页面检查、保存前再次核对、取消保留输入、自定义取消、慢图登录；Chromium实发触屏横拖与纵向滚动通过。四页七组视口、键盘、减少动态效果和历史回归通过，餐次视觉新样式与AI确认回归通过。生产备份、0026迁移、正式发布和双浏览器验收已完成；证据归档.codex/body-energy-*，不重跑个人历史初始化。

## 此前餐次视觉分支（已合并）

餐次视觉代码32be0cd已从独立工作树发布，分支codex/meal-editor-visual，正式READY部署dpl_8KfD6EBLswBPkV4SmU5fYzE3MB84。当前工作区的其他业务／0026草稿没有随本轮发布，也未被撤销。视觉设计标准已同步到当前docs/design-reference.md。本轮已合并32be0cd并重新验证共用餐次编辑器，后续发布保留这批视觉修正。完整本轮交接和最终验收在/home/obl1vion/projects/Formward-worktrees/meal-editor-visual/handoff.md。正式双浏览器18组视口、30个详情场景及15项入口复验通过，测试账号已清理，40表原健康事实／请求／审计与结构核对完全保持。


## 已保留的餐次视觉修正

在独立工作树meal-editor-visual、分支codex/meal-editor-visual从5e43c37实施，原工作区业务与0026草稿保持。修正按钮旁详情、完整单位、按实际宽度分配列、16px主字段和统一文字边缘；包装说明移详情。营养与历史规则保持，未增加协议或migration。368项单元／集成、lint、typecheck、production build、最终Chromium常规审核＋自动编辑器门槛、WebKit专项通过。两引擎各9组视口与125%放大、完整字形、列轴、逐项手机截图及按钮旁气泡均检查，客户端异常0，不过滤错误。规则在现有design-reference.md，旧验收范围已更正；正式发布与复验进行中。

## 此前维护：一餐总量输入与对齐

食物、单位、数量拆成独立列，桌面八列、主输入同高顶端对齐；手机名称、并排单位数量及两列营养。标签与边框内留白统一，说明移到表格下。自由项默认consumed_total，填本次总营养，数量不相乘；食材库、包装及归档快照继续自动换算。旧per_portion用完整服务端总量回显，未修改项提交原数据，修改后按总量保存，打开和取消不写正式记录。编辑器私有元数据不提交；公共接口旧每份请求仍兼容，无migration。

本机lint、typecheck、production build、42文件共368项单元／集成、Chromium／WebKit五种宽度专项和AI混合审核通过。WSL中断整批运行后逐文件独立执行完整测试集，证据在.codex/meal-total-test-report.json。实际查看截图并核对输入对齐，正式发布与双浏览器复验均已通过，虚构账号已清理。15项公开／保护入口通过，验收5xx和客户端异常为0。40表原有结构、账本、健康事实、请求与审计保持；仅正常授权使用和令牌轮换产生差异。证据使用.codex/meal-total-visual/及.codex/meal-total-release/，当前正式版本见下文。

## 当前维护：页面内历史与固定“已记全”文案

身体、饮食、消耗的“查看全部”位于最近行下方，点击在页面内展开历史，每批50日且排除最近日期；具体日期查看或编辑才打开Inspector，关闭恢复页面滚动、触发焦点及已加载批次。身体删除Inspector内历史分支，三页复用相同日期行与历史索引。按日期查找保留，空行不写入数据库。

“已记全”始终使用同一文字，未确认／未记全不勾选，完成后打勾、文字变淡且仍可取消；保存中不替换文字，失败保留实际状态。这里只改勾选控件，最近日期筛选与盈余业务保持。身体晨间／晚间组内不拆字，桌面数值按内容宽度排列；饮食和消耗清除鼠标点击SVG列的默认白框，保留键盘绘图区焦点。

无公开协议、权限、数据库或健康规则变化，无migration。361项单元／集成、lint、typecheck、production build、AI混合审核和日完整性专项通过。Chromium／WebKit最终样式、四页首屏、三页50日加载及手机历史复验通过，正式域名已READY，15项公开／保护入口及虚构账号双浏览器复验通过，测试数据全部清理；40表结构、迁移账本及原有健康事实核对保持，期间新增录入和对应汇总／授权更新保留。证据归档.codex/inline-history-visual/及.codex/inline-history-release/。

## 此前四页一致交互与手机核心数据

四页使用components/use-chart-date-selection.ts共用悬停预览、点击固定、图外／Escape解除和键盘选日，chart-ranges.tsx共用区间按钮；无前后日控件。daily-records.tsx统一日期行，record-history.tsx提供完整历史与返回位置，inspector.tsx提供共用侧栏外壳及输入／焦点保护。身体保留专用晨晚、候选和编辑内容。

主列表始终保留今天，前6天仅保留各模块待处理日期，完成或更早日期进入查看全部。饮食无摄入连线、无主列表餐次全文；是否记全为次要固定文字“已记全”勾选控件，未确认／未记全不勾选，完成后变淡且可取消。手机当前四项营养同排，图表优先，食材库入口随后。身体手机当前两项＋完整体重图优先，近7日四项统计和图表选项收起；体脂图可下滑，桌面六项摘要保持。消耗日期和查看入口在读数上方，活动详情在Inspector。总览合并右侧次晨标题与读数，缺测断线，无拥挤短横。

网页人工确认永久删除正式餐次／食材／日消耗／运动，保留审计、备份及既有软删除数据。删除食材保留旧餐营养、份数、包装快照与照片，不作废已记完；删除餐次同事务作废当天确认。消耗批量运动删除同事务，内部选项仅人工网页使用，公开协议不增加能力，AI整条删除仍禁止。

0025_active_food_identity.sql仅将食材规格唯一索引限制到有效条目，使旧软删除数据不阻挡同规格新建；不新增列、不改旧migration或历史事实。已先纳入版本控制，再备份、执行生产迁移并核对实际索引。数据库至0025，仍为39张应用表加Drizzle账本。

361项单元／集成、lint、typecheck、production build、结构及文档检查通过。本机与正式域名Chromium／WebKit均完成四页×7组视口验收，含320×560矮屏、模拟安全区、触屏、键盘、固定／解除日期、历史返回与记全切换；未完成运动在Inspector保留而不计入热量。15项公开／保护入口通过，验收请求5xx与客户端异常为0。正式虚构账号及全部所属测试数据已清理。证据在.codex/unified-ui-visual/和.codex/unified-ui-release/；设计标准仍为docs/design-reference.md，实施及验收前必读，不新增规则文件。真实iOS浏览器与系统软键盘未作实机验收。

## 当前正式版本

正式域名 https://formward-ten.vercel.app 已核对 READY 部署 dpl_3ze77nJeUbXfiuxvgnzsRGxW4JhB，应用代码 c591fc6，数据库仍0026（39张应用表加账本）。功能分支codex/latest-records-energy-sources已推送，尚未合入main；交接与测试证据另行提交，不改变部署中的应用代码。

四页共用框架、选中日晨间读数、活动自动累计/手填区分、统一应用内确认及两位显示已发布；没有migration、公开字段、工具或权限变化。旧精度、饮食自由项总量、旧每份与食材换算保持。旧消耗预览须刷新按新规则重新核对。

383项单元/集成、lint零警告、typecheck、production build、311项本地链接及15锚点、目录和diff检查通过。Chromium/WebKit隔离及正式站均完成四页7组视口共同位置≤2px、34px安全区、填报/保存、未知/0、AI新运动仅累计一次、原四位只改备注、统一确认取消/Escape、自定义/固定选日、触屏、150%放大与减少动效。逐键输入2000.12、第三位拒绝和失焦稳定通过；原饮食与跨页更新回归通过。真实iOS及系统软键盘未测。

正式站报告和截图在私有.codex/unified-frame-release/，production-chromium.json与production-webkit.json均通过。WebKit首轮捕获3条RSC访问检查错误，诊断和失败日志保留；连续整页跳转前后等待networkidle后，保持全部错误断言重跑通过，不将首轮记为通过。公开/保护入口16项通过，最终客户端异常与5xx为0；部署20分钟窗口Runtime error/fatal及请求5xx为0。虚构账号及全部所属数据已清理。

发布前后备份data/exports/database-before-unified-frame-2026-10-28.json、database-after-unified-frame-production-2026-10-28.json与unified-frame-production-verification.json均0600、Git/部署忽略。40表结构、账本、原健康事实、请求与审计完全保持，没有新增或遗留虚构健康数据；没有执行个人历史初始化。实际并排相册在.codex/unified-frame-release/gallery/，已导出90张截图供用户逐项验收。

## 此前三阶段完善交付

此前三阶段部署dpl_5yW5kVWVmjozc837AaRpXeMUtgLU，运行代码83a773c，数据库0024；当前总览维护版本见上一节。功能分支已推送，尚未合入main。第一批维护为f92f08f／0023，后续录入与界面完善已单独发布。

- 日状态为已记完／未记全／未确认；只有已记完且两侧有值才计算盈余，估算和营养部分未知不额外阻止相减。餐次变更让相关日重新待确认。授权账号截至2026-10-23的28个有效历史餐日已一次性初始化，空日与其他账号不处理，不成为未来默认。
- AI禁止整条删除／恢复或批量删除身体、餐次、食材、消耗、运动；餐内增减经审核，不能清空整餐。网页手工操作保留，取消草稿不会删除事实；HTTP、MCP、业务执行及旧待确认申请共用保护。
- 网页人工餐次按实际保存顺序生效，每次保留前后审计；AI预览继续检查版本、快照、授权与有效期。缺图可直接保存文字，无五项照片勾选或标记核对按钮；普通餐次只需底部一次确认保存。修改列清增减与修改后合计。
- 桌面总览悬停预览、移出恢复，点击固定、另一列切换，点击图外或Escape释放；跨区间保留范围内固定日。详情身体／消耗并排、当日营养合计、默认折叠前三餐，更多餐次再展开，图片展开后加载。
- 摄入默认今天及以前最近有记录日，网址与主动选日优先；今天及前6天待处理日期可补录，更早记录按50日期分页。新自由项默认1份，常驻暖色输入框、单位在份数前、每份营养由共用规则乘份数；旧总量口径不重乘，主动切换才采用每份规则。包装只用可靠规格；指定食材已补包装映射，历史克数与营养保持。
- 消耗总数／活动合计与运动明细共存，逐项明确已包含或额外增加，不按大小推断；总数／采用模式变化重新核对，来源备注不重问。旧运动沿用原结果，未知不是0。录入值与最终值分开返回。
- 静息公式／资料入口、正常AI动作和计算撤下；消耗页面与查询不再读取身体记录，旧资料与审计保留。日常默认已退役，2058只属于旧的一次性历史初始化。
- 本人Excel为8张表，保留数字、未知、0、来源、每份口径、包装和运动包含关系，不含退役公式资料或凭据。公开协议OpenAPI1.12.0／MCP1.10.0、13工具，OAuth权限种类保持；客户端刷新工具列表获取新字段。

第一批337项、本批354项单元／集成通过；lint、typecheck、production build、全部受影响浏览器回归及283项本地文档链接及15项章节锚点、目录／diff检查通过。本批已实际查看320／390／430／1100／1440px、320×560矮屏、触屏横屏与减少动态效果；手机审核首屏有日期、合计、前两项食物和保存，1440×900两餐默认详情不滚动。

正式站用虚构账号复验同样五种宽度、固定日期、折叠、份数／包装、消耗包含关系、一次审核及MCP；15项公开／保护入口通过。客户端异常和请求5xx为0，验收时段最近10分钟Runtime error／fatal为0；虚构账号、OAuth客户端及所属数据全部清理。40表逐项对照通过，原健康事实、请求与审计保持，指定包装维护只增加一个操作与一个食材事件。

私有备份位于data/exports、0600：database-before-stage3-2026-10-25.json、database-after-stage3-migration-2026-10-25.json、database-after-stage3-package-2026-10-25.json、database-after-stage3-production-2026-10-25.json；核对为stage3-migration-verification.json、stage3-package-verification.json、stage3-production-verification.json。第一批stage1备份与报告仍保留。当前截图／报告.codex/stage3-release/，本机密集波动样本.codex/maintenance-visual/，日志.codex/stage3-*；均不得放public或提交。详细证据见[验收记录](docs/maintenance-verification.md)。真实iOS／微信键盘仍由用户最终复核。

## 既有功能与保留实现

既有统一OAuth补授权与纯连接检查；首页最新记录、消耗来源记忆保持。用户选择消耗来源单独记忆、手机图下纵向三行摘要。

- 首页身体、摄入、消耗各自读取最近记录日期；摄入显示该日餐数／kcal，消耗标日期，跨零点保持。最新部分数据不退回更早完整日，未知与0区分，图表每日收支规则保持。
- 消耗来源在静息／活动合计／总数／运动间共用，与身体来源隔离；正式保存成功才记忆，点击展开全部、搜索／键盘／触屏选择，软移除保留历史与草稿，明确新使用才恢复。网页与统一／旧审核入口共用输入。
- query_energy已在用户补授权后实测成功；用户报告仅消耗提交未授权。authorize_formward新增纯连接检查，一次申请身体、饮食／食材、消耗的读取和提交预览；不读健康内容、不建预览。已有提交权限的连接缺新类别时补授权合并六项，日常只读缺权限只合并三类读取。三类权限在设置页同格式显示，提供复制统一授权指令；旧令牌／连接不自动扩权，必须用户OAuth同意。客户端需刷新工具列表才能发现新增工具。

- 手机48px页头、账号更多菜单、四个主页面底部导航；审核只保留统一保存栏。
- 饮食／消耗从今天及前6天待处理日期直接补录，更早或完成日期在查看全部；保存明确日期，跨零点保留草稿，空行不入库。
- 消耗默认最近有效日，只显示单份读数与趋势；公式／资料入口撤下。长区间提供稀疏日期标签。
- 总览默认最近完整收支日，必要时扩大最短区间。手机先显示盈余／缺口与计算式，次晨读数在下层图旁，详情保留两日晨重；局部线图刻度与数据范围独立，kg保留零线。
- 确认页优先单餐日期、中文餐次、服务端kcal及宏量合计和食物，图片依据折叠；普通餐次只需底部一次确认保存，缺图可先保存文字。
- 0022新增energy_sources并从有效既有来源初始化建议元数据，原表／健康事实／原始请求／审计保持。当前正式数据库0025、39张应用表加账本；0024增加兼容列，0025仅调整有效食材规格索引。公开权限种类和认证保持；OpenAPI1.12.0／MCP1.10.0、13工具。2058仍仅为既有一次性初始化。

## 验证与发布归档

当前结果、版本和证据见本文开头及[验收记录](docs/maintenance-verification.md)。后续维护不重新执行历史初始化，不删除或改写共享migration，发布继续使用备份、迁移核对、正式别名READY与虚构账号清理流程。

以下为此前发布的私有备份归档，不代表当前结构或数据为空：

先前手机发布备份为`data/exports/database-before-mobile-2026-10-23.json`与`database-after-mobile-2026-10-23.json`，核对报告`mobile-release-storage-verification-2026-10-23.json`：37张表结构一致，既有健康事实、来源、原请求、审核与审计保持，只排除正常限流及指定认证使用／续期元数据。文件0600，Git与部署忽略，无migration。

上轮私有备份仍保留`database-before-overview-release-2026-10-22.json`、`database-after-overview-release-2026-10-22.json`及`overview-release-storage-verification-2026-10-22.json`。

本轮私有备份为data/exports/database-before-latest-records-2026-10-24.json、database-after-latest-records-migration-2026-10-24.json和database-after-latest-records-production-2026-10-24.json；核对报告为latest-records-migration-verification-2026-10-24.json和latest-records-production-verification-2026-10-24.json。仅新增energy_sources及一条迁移账本；既有表结构和值保持，只排除正常限流、会话续期和授权使用时间。文件0600、Git与部署忽略。

统一授权发布无migration。私有备份为data/exports/database-before-unified-access-2026-10-24.json和database-after-unified-access-production-2026-10-24.json，核对为unified-access-production-verification-2026-10-24.json，38表结构及既有数据／scope保持，仅排除正常限流和授权使用／会话续期。正式站使用临时账号复现“只差energy:write”，一次网页同意后六项权限完整；零健康／预览写入、旧令牌隔离与撤销均通过，账号及OAuth客户端已清理。报告／截图在.codex/unified-access-release/；320／390／1440px已查看。

## 已有历史审核

只读备份核对：2026-09-09至2026-10-21的既有历史补齐审核状态为confirmed，已由用户确认，不再是待确认预览。本轮未重新初始化、代确认、补写或清理健康事实。历史原始请求和审核结果继续保留于私有`data/exports/energy-history-explicit-20261022-input.*`。

2058只属于一次性历史初始化，不能加入客户端或长期默认规则。2026-10-22误显示来自已退役规则；不能仅凭日期删除当天合法事实。

## 关键文件与维护方式

- components/source-input.tsx共用来源交互；activities/sources.ts管理独立消耗建议，正式确认与来源更新同一事务。
- activities/model.ts与records.ts：模式、校验、计算、归属、版本、请求身份、预览及审计；presentation.ts在服务端整理读数；history.ts只构造明确范围的补缺动作。
- activities/energy-editor.tsx及energy-view.tsx：网页／审核输入与显示。审核中运动仍为独立项，修改只更新预览。
- dashboard/model.ts及presentation.ts：聚合与晨重配对；overview-trend.tsx负责读数／详情，relationship-plot.tsx绘制双层图，chart-geometry.ts负责局部线图刻度与填色几何；components/chart-scale.ts保留柱图与kg轴刻度。
- src/db/schema.ts及drizzle/0022_daily_marauders.sql：新增消耗来源建议及历史名称元数据；0021日记录模式列和CHECK保持，已共享migration不修改，个人数值不回填。
- scripts/preview-energy-history.mts：读取私有配置，核对已有同账号write令牌，生成预览与原快照；--stage仅提交正式审核，不保存健康事实。有正式误加值时要求指定记录ID、版本和预期值，不仅凭日期删除。

- src/features/meals/model.ts、meal-editor.tsx、records.ts：每份输入、旧总量兼容、包装换算与最终存储；day-status.ts负责当天完成状态及餐次变化失效。
- src/features/activities/model.ts、records.ts、energy-editor.tsx及records/operations.ts：包含关系绑定、整批预览、独立运动审核及事务；新增字段来自drizzle/0024_tan_starjammers.sql。
- src/features/exports/workbook.ts：8张原生Excel表，保留未知／零与原始输入口径；src/features/auth/ai-write-policy.ts统一限制AI整条删除／恢复。

## 数据、备份与发布约束

所有健康读取与写入校验账号，未知与零区分；网页永久删除和既有软删除边界见本文当前维护，版本与审计保留。用户资料不进入公共代码、测试、截图或public。保留已有零基础学习指南及其他有效内容。

此前消耗模式发布的私有一致性备份与报告均在被忽略的`data/exports/`，权限0600：

- `database-before-energy-modes-2026-10-22.json`、`database-after-energy-modes-migration-2026-10-22.json`、`energy-modes-migration-verification-2026-10-22.json`。
- `database-after-energy-modes-production-2026-10-22.json`、`energy-modes-production-verification-final-2026-10-22.json`。
- `database-after-energy-modes-history-preview-2026-10-22.json`、`energy-modes-history-preview-verification-2026-10-22.json`、`energy-modes-preview-check-2026-10-22.json`。

未加final后缀的生产核对报告保留原诊断：只有正常会话续期时间变化，令牌与身份字段一致。最终报告明确允许认证元数据向前更新，其他字段仍逐项核对，未通过修改健康数据消除差异。

结构变更先提交migration，再做私有一致性备份、执行、逐表核对；共享migration不修改。生产维护使用现有本机配置，不覆盖.env.local，不从Vercel下载敏感变量，不打印凭据。Private Blob保持Production-only／OIDC，不新增静态密钥。

Git推送不自动发布，按现有Vercel CLI流程部署并确认正式别名READY。浏览器验收用独立虚构账号并在finally按外键顺序清理；measurement_events早于measurements，energy_events早于energy_operations。不能影响已有账号、健康事实或待审核批次。

早期私有备份仍在被忽略的data/exports、0600：database-before-energy-defaults-2026-10-22.json、database-after-energy-defaults-migration-2026-10-22.json、database-after-energy-defaults-production-2026-10-22.json；对应energy-defaults-migration-verification与energy-defaults-production-verification报告保留。不要依据旧报告认定当前新表为空，实际用户已保存过数据。

本机工具：Node24.21.0；pnpm与Vercel CLI保留在/home/obl1vion/.local/formward-tools/node_modules/.bin，避免/tmp在环境重启后丢失。当前PLAYWRIGHT_MODULE为该工具目录node_modules/playwright/index.mjs，PLAYWRIGHT_BROWSERS_PATH为该目录browsers；LD_LIBRARY_PATH使用system/root/usr/lib/x86_64-linux-gnu，FONTCONFIG_FILE使用system/fonts.conf。通用方法见tests/README.md。构建不能与使用同一.next的浏览器服务并行。

## 视觉参考与文档

讨论稿在被忽略的.codex/visualizations/energy-layout-reference.html及energy-entry-reference.html，含虚构数据，不是网站实现。当前会话从项目内绝对路径读取；Windows磁盘外部可写目录曾被内联读取校验拒绝，不要重新搬回旧路径。

详细说明：[学习指南](docs/code-study.md)、[消耗](docs/energy.md)、[界面](docs/interface.md)、[数据库](docs/database.md)、[AI接口](docs/ai-api.md)、[当前状态](docs/status.md)、[部署](docs/deployment.md)。
