## 当前发布：品牌 Logo

## AI消耗确认：用户已验收，准备发布

用户于2026-10-31看过实际手机与电脑截图后明确要求发布。本轮从已上线品牌版本9bd0da8隔离提取消耗确认修改，不带入双区、COS、0028或其他工作区内容。按日期展示全天总数与运动，保留原分项及精度、单项包含核对、取消二次确认和单一正式保存；旧自动核对预览需刷新并重选。开发工作区421项测试、两引擎各19张截图通过；正式基线重新检查后再发布，无数据库迁移或历史重写。

用户于2026-10-31查看实际页面后明确要求发布公网。正式域名 https://formward-ten.vercel.app 已核对 READY 部署 `dpl_FWmg8Xf75oRAnasTNePGVAmf9Ye7`，应用源码 `273dbb5`，来自独立分支 `codex/brand-logo-release`。以此前正式基线 `42c7e8a` 仅接入 F＋手臂标志、透明导出、全站品牌组件及 favicon／Apple 图标；未带入双区、地区选择、COS 或新 migration。main 未修改，域名 DNS 与私有双区预览未切换。

发布基线 lint、typecheck、409项单元／集成、production build、目录及diff检查通过；隔离 Chromium／WebKit 各48张品牌截图、30组页头检查通过。正式两引擎各30张实际截图、18组页头检查通过，客户端异常及请求5xx为0；20项公开／受保护入口与5份图标文件逐字节SHA256校验通过。正式别名再次核对仍为新部署 READY；该部署20分钟查询窗口 Runtime error／fatal 与请求5xx均0，无排除区间。实际查看正式桌面首页和WebKit手机总览；真实iOS和主屏图标实机显示未测。

发布前后私有备份 `data/exports/database-before-brand-logo-2026-10-31.json`、`database-after-production-brand-logo-2026-10-31.json` 及 `brand-logo-production-verification.json` 均为0600，Git／部署忽略。42表结构及全部原有行值一致，无新增正式业务数据，临时普通账号、登录和所属审计已清理。证据位于 `.codex/brand-release/`，生产截图和报告在 `production/{chromium,webkit}/`；应用源码与发布记录保留在独立发布分支。

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
