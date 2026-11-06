# 公网 HTTPS 部署

## 当前正式版本：手机连续交接与双端导航（2026-11-06）

按用户明确授权，整套完成后直接发布到[正式总览](https://formward-ten.vercel.app/dashboard)，手机和电脑共用地址。READY部署`dpl_BpjgYXhaLGu6GueuAPTEL4FGMWEn`，应用源码`239f97cdaf03f0add02eea10935b4453eab7e2f4`，构建`continuity-239f97c-20261106`；正式别名、sourceCommit／gitCommitSha、版本接口及已发布客户端JS一致。干净codex/mobile-continuity应用提交导出，717项上传清单不含私有数据、环境文件和本机工具；未合入或推送main，原主工作区国内部署／COS／DNS改动保持隔离。后续发布记录提交不改变正式应用。

手机首页改为一张宽卡加下一卡露出，保留真实小图及一次双次微动引导；饮食为热量／供能环图主卡及三宏量卡，消耗为真实静息／活动比例，未知和零分开。三专页右上额外记录动作移除，首页、日期行和助手仍进入完整表单。四页共用布局骨架与扫光，源图先到骨架再交给实际图表，快速返回恢复卡片位置和焦点；8秒未就绪有局部恢复入口。身体随账号体脂开关切换四项摘要、图、历史和录入，按同一所选日统计；隐藏历史值不丢失。菜单、设置／资料／安全与助手复用可中断面板和原表单，保留草稿／保存保护；电脑左侧四模块统一84px浮动暖雾导航与纵向胶囊，正文留白及原图表保持。

472项单元／集成、lint、typecheck、本地及正式production build通过；18项公开／保护／协议检查通过。隔离环境已注入1.8秒／9.5秒慢响应及偏好保存503，检查共享图形交接、8秒恢复、快速反向、位置／焦点恢复、失败回滚、版本冲突及账号隔离。正式Chromium核对320／390／430px手机、矮屏、深浅主题，以及1100／1440／1920px电脑；虚构餐次165 kcal真实保存后摄入为1355，身体70.19保存后旧体脂20.81保留，静息2058和活动0保存后总数2058，新标签读取云端偏好。助手、设置及资料表单实际加载，手机和电脑客户端error均0。

先备份并核对29个已发布migration的完整SHA256，仅新增0030_account_preferences；迁移后44表、30条迁移账本，旧43表结构及既有健康事实核对通过。独立虚构账号及36张所属表数据已按精确ID清理，发布后完整性报告issues为空，保留合法用户更新；正常认证限流／会话时间变化有私有精确哈希留档。最终部署20分钟Runtime error／fatal及请求5xx均0，无排除区间、无后续分页。备份、核对位于原主工作区data/exports/continuity-20261106-*，0600且Git／部署忽略；发布证据在本工作区.codex/continuity-release。上一READY `dpl_91NTmbnYDMzWo8jddqkGfnuEzebS`保留供应用回退，不删除新表或回退用户合法写入。

设计规则统一在docs/design-reference.md；截图、实际操作低频录屏及检查边界见docs/maintenance-verification.md。真实iPhone／WebKit、系统软键盘／VoiceOver、系统200%文字与减少动态效果现场切换、真触屏帧率未测；不把浏览器视口和低频录屏当作实机证明。本轮无公开HTTP v1／MCP、AI权限、运行依赖或生产环境变量调整。

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
