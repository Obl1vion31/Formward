# 当前实现与验证

## 当前正式版本：Garmin双站点与本人密钥

日常网页为[国服](https://43.142.148.58)，原GPT／MCP、OAuth与海外图片后台继续由Vercel承担，正式数据统一写入上海。国服应用688081179e63f10f0e5e2e12400cd392c4894572，发布garmin-regions-current-20261110，BUILD_ID -7gprMm9zSgOPO2Tv7euh；已合入并推送main，保留workspace-flow-final的界面与0036。正式库55表、36条migration，本轮没有新增表或migration。

Garmin已启用personal：有效登录账号从“账号菜单 → 外部接入 → 设备与数据来源”选择中国站／国际站，填写本人密钥并同步。旧v1连接仍按国际站读取且密文不变；明确换站创建独立连接并保留历史。仅调整FORMWARD_DATA_SOURCE_ACCESS，原Garmin与OAuth安全摘要及其他私有配置保持，Neon继续停写。

578项测试、lint、typecheck、干净构建，以及最终standalone双引擎各8组／19图通过，慢查询最大布局偏差0px；线上双端已核看。原GPT连接及Garmin国际站真实只读读取成功；中国站网络可达，缺少真实中国站密钥，完整认证仅用隔离响应验证。真实手机与系统键盘未测。发布、备份、原数据核对、观察窗口、截图及兼容恢复边界见[部署](deployment.md)和[验收](regional-acceptance.md)。


## 此前版本：全站静态内容与局部加载反馈（2026-11-08）

已按本会话此前明确的修改后直接发布授权更新[正式总览](https://formward-ten.vercel.app/dashboard)。READY部署dpl_Ds7qyEAu1jfhdWZyVqantWprDqkb，源码61eda5541ab7acd26a3b7e378b49a44aaac779de，构建static-loading-61eda554-20261108，来自codex/static-loading；正式别名、项目、sourceCommit／gitCommitSha及版本接口均一致，未合入或推送main。后续纯文档提交不改变正式应用。

总览、饮食、训练、消耗与身体的固定标题、操作入口、最近记录、历史入口及语义色从首帧显示，仅未知日期和数据占位。训练保留开始训练操作槽；资料、安全及连接采用200ms局部反馈，缓存命中直接接管。取消、迟到响应、真实重试、草稿和账号焦点恢复保持；根AGENTS及设计文档覆盖全站。

595项单元／集成、lint零错误零警告、独立typecheck、production build（静态生成38/38）及Vercel远程构建通过。本地Chromium／WebKit各80组布局和19组完整操作检查通过，固定锚点最大偏差1 CSS px；六组已知日期及完整记录区补查通过，实际截图和录屏已核看。正式站14项公开／保护入口通过，本轮不创建正式测试账号，登录状态与故障写入测试均限定本机隔离虚构数据库，不将本机验收冒充正式登录页面或真机验收。

发布前后0600私有备份均54表、33条migration；字段、账本、既有历史和旧审计保持；部署前的一次Garmin前台同步更新1条来源日汇总与步数，7日采用及8条新增审计的before／after逐项匹配。最终数据核对为concurrent-data-verification.json，原始严格差异保留。所有合法更新均保留，其他允许的元数据变化8项。无新增migration、公开接口、依赖或产品设置。Runtime error／fatal及请求5xx在实际观测窗口UTC 2026-11-08T10:04:36.000Z—2026-11-08T10:11:06.000Z均0，无排除区间或分页遗漏；不宣称新应用已持续运行20分钟。上一READY dpl_5LHExKEqQRyn73VJwEgm3ZbXyoop已核对保留供应用回退，不回退或删除合法用户更新。

私有证据为.codex/static-loading-release、.codex/static-loading-reviewed/chromium、.codex/static-loading-webkit-accepted/webkit和.codex/static-loading-fullpage；备份data/exports/static-loading-20261108-{before,published}.json不进入Git或部署。可展示截图、完整实录及连续导航片段位于C:/Users/14878/.codex/visualizations/2026/11/08/formward-static-loading，均为虚构验收数据。真实iPhone／Android、系统软键盘、屏幕阅读器、系统文字放大及真机帧率未测。

## 此前正式版本：训练页精简、触屏排期与完成记录删除（2026-11-08）

[训练页](https://formward-ten.vercel.app/dashboard/training)已上线，源码a0d580b26adaa5c420a2af90cfa3169f25617a49，构建training-compact-a0d580b2-20261108；保留原已发布功能，无main合并。训练／消耗并入原标题行，顶部只呈现具体名称和日期状态；模板默认收起、置于开始区下方，支持原位展开、手柄拖拽与点选排期，下面直接月历。

日历完成记录的更多菜单可明确确认永久删除；最后一条关联完成删除后计划恢复待练，多条完成时保持完成。复用现有网页feature与完整事务审计，MCP查询反映当前状态且不提供删除，无新增表或migration。

595项测试、lint、typecheck与生产构建通过，本地双引擎各21组／65图、正式19组／29图及MCP均通过。线上8组固定槽位最大偏差0px；54表／33条migration及健康／来源事实逐表一致，仅正常限流元数据变化，虚构账号及客户端已清理。真机未测，WebKit连续原生touch有测试接口限制；选型调研见[训练](training.md)，详细证据见[部署](deployment.md)与[验收](maintenance-verification.md)。

## 此前正式版本：训练动作库、GPT排期与稳定加载（2026-11-08）

[训练页](https://formward-ten.vercel.app/dashboard/training)已上线，源码a2ac651b4d7b5bcda137031946658d555a343e8a，版本training-library-a2ac651b-20261108；包含最新饮食简化发布，无main合并。无计划单一开始，有计划分按计划／自由，训练下面直接月历。150项动作库与模板共用，支持次数重量、时长、距离，计划目标不作为已完成记录。

MCP已扩展为17工具，支持动作、本人模板／计划／训练查询及模板、多日排期预览；training读写需重新同意，所有正式AI保存仍走统一网页确认。训练与消耗共用真实加载槽位、固定六周月历及完整右侧退出；长期规则已写入AGENTS与设计文档。

588项完整测试、lint、typecheck与构建通过，本地双引擎及线上操作、加载与MCP验证通过。54表／33条migration保持，验收账号及客户端已清理，健康与来源事实未变；后台同步元数据按审计核验。详见[部署](deployment.md)与[验收](maintenance-verification.md)，真机及系统输入辅助检查未计通过。


## 此前正式版本：饮食录入简化（2026-11-08）

已按授权发布到[正式饮食页](https://formward-ten.vercel.app/dashboard/meals)。READY部署dpl_7joUqvbuPZfoQdoqPYSjRAiH5vMT，应用源码ade4f71e5e2722a4b98a6a27ee6579a111cfe941，构建meal-entry-ade4f71-20261108，来自codex/meal-entry-simplify；正式别名、项目、sourceCommit／gitCommitSha、版本接口及公开allowDuplicate兼容说明已核对。基于最新正式训练应用ff08c99及交接60d302d，保留训练导航、会话和0033四表；没有合入或推送main。后续纯文档提交不改变正式应用。

饮食与食材取消历史数值倍数比较及额外确认；同日严格重复餐仅一条中性提示和查看入口，无须勾选即可保存。餐次允许全0或全部未知营养，未知不补0，全未知不冒充已知部分；空餐、非法输入、归属、版本、请求防重和草稿保护保持。旧待确认预览仅清除可识别系统提示及重复餐拦截，原请求／草稿／过期及真实错误保持；AI仍通过网页登录最终确认。消耗、运动及身体原有提醒保持。

全量73文件575项测试、最终13项专项复查、lint零错误零警告、独立typecheck、38页production build与Vercel远程构建通过。795项上传文件不含私有配置、健康材料或验收数据。13组实际操作、10组深浅尺寸检查及最终5组复查通过，覆盖320／390／430和1100／1440；未知／零保存、重复与大幅变化、失败留稿、连续点击、键盘草稿、食材编辑与旧审核已实际操作。提示实际对比深色7.43:1、浅色最低5.00:1，查看入口44px。初轮summary定位差异的原始结果及复核均保留，详见[维护验收](maintenance-verification.md)。

26项公网／授权／协议检查及公开字段兼容核对通过。Runtime error／fatal与请求5xx均0，无排除区间或后续分页；这是上线后的实际观测，不表示新应用已运行满20分钟。发布前后0600私有备份均54表、33条migration，schema、健康事实及来源事实保持；逐行核对issues0，16项允许变化仅为正常元数据，来源同步事件0。保留6条Garmin及1条非重复手工运动，没有新增migration、生产变量或正式测试账号。

证据为.codex/meal-entry-release，备份data/exports/meal-entry-20261108-{before,published}.json，均不进入Git／部署。实际截图和采样录像位于C:/Users/14878/.codex/visualizations/2026/11/08/formward-meal-entry，全部为本机独立PGlite虚构账号；测试进程已关闭。真实手机／触摸、WebKit、系统软键盘及系统文字放大未测，不计通过。上一READY dpl_rKAT7xqZmc1unBoqxqPBM3AH5tkA保留供应用回退，不回退用户数据。


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

已发布到[正式总览](https://formward-ten.vercel.app/dashboard)，READY部署 `dpl_8J4m5x2QYWUsGD1fPcTjzNpHvFNm`，应用161057a，构建 `desktop-linked-161057a-20261107`。`codex/desktop-linked-interactions` 基于干净56e7984，本轮未合并或推送main。电脑首页三张七日卡片前置，共享手机的日期链接及2:1图形交接；关联专页图区最大640px、可见返回总览，恢复来源卡片／滚动／焦点及总览区间／估计显示选项。普通桌面图、六项读数、七日统计和区间摘要保持；手机继续横滑。

Inspector标题取消独立玻璃弧线，保留侧栏及手机底部面板、44px关闭和草稿保护。营养图测量随实际组件重新挂载，手机／电脑切换不再空图；关联骨架与真实目标匹配高度、字体、刻度及数据平面，一次300ms交接，取消同时清理待执行帧。API、数据库、计算和依赖不变。

本地虚构预览 http://localhost:4240/dashboard；固定基线 http://localhost:4242/dashboard。505项单元／集成、lint（0错误0警告）、typecheck、production build与结构检查通过；本地完整Chromium／WebKit保留72张截图和双端录像。干净源复验、远程构建、18项入口／协议及版本绑定通过；正式两引擎各三种往返及18次尺寸切换等通过，共46张截图，页面异常与5xx各0。44表、30条迁移及既有健康事实保持，虚构账号与36张所属表已清理，正常限流和显示偏好版本更新经精确核对保留；最终20分钟Runtime error／fatal及5xx为0。证据与未测项见[维护验收](maintenance-verification.md)及[部署](deployment.md)。global.formward.top虽保留Vercel别名，当前DNS为NXDOMAIN，未计实际访问通过。

## 此前正式版本：消耗改期与主导航（2026-11-07）

已按用户授权发布到[正式总览](https://formward-ten.vercel.app/dashboard)。READY部署`dpl_9KYWuxTQUQDTchCYXW8RBtt4oB4c`，应用源码`6f0a2f64e6d17c1513199561f0d5f7fb3fe6d14b`，构建`date-navigation-6f0a2f6-20261107`；formward-ten.vercel.app与global.formward.top、源码元数据、版本接口和客户端JS一致。来自codex/energy-date-navigation的干净提交，736项上传文件不含私有数据、环境文件与本机工具；未合入或推送main，原主工作区的国内基础设施修改保持隔离。后续纯文档提交不改变正式应用。

消耗改期按原编号、原日期及版本核对，禁止采用目标日另一编号；日汇总与原日运动同批移动，日期相关包含关系重新核对。目标日已有日记录或运动时不合并，失败保留草稿并说明原因；响应中断沿用原请求编号，成功同时确认原日与目标日变化。窄编辑区日期／时区分行，原生日期控件、16px输入和44px触控保持。四模块普通导航按顺序200ms轻横移并淡变，手机16px、电脑12px；骨架替换不重播，图形关联、录入及详情不叠加，顶栏和导航稳定。

504项测试、双端实际操作与21段有效录像通过；44表、30条迁移账本和旧健康事实保持，临时数据清理完成，正式错误日志为0。物理iPhone／WebKit、真触屏横屏指针、系统软键盘／VoiceOver、系统200%文字、现场系统减少动态效果切换及真机帧率未实测，不计为通过；减少动态效果与取消清理由控制器测试覆盖。浏览器标签及临时视口已清理，临时账号已退出。

完整发布、回退和数据核对见[部署](deployment.md)及[验收](maintenance-verification.md)。

## 此前正式版本：暖雾材质与手机交互（2026-11-06）

正式地址https://formward-ten.vercel.app/dashboard已发布应用`166f715831d734a9694102158bef3cebec9a8921`，构建`mobile-warm-166f715-20261106`，READY部署`dpl_91NTmbnYDMzWo8jddqkGfnuEzebS`。发布来自独立分支codex/mobile-workspace，尚未合入或推送main；原主工作区的国内基础设施改动保持隔离。

手机已采用暖雾深浅主题、同色记录动作、摄入／晨重／消耗横向真实数据卡、可见的能量／次晨关系图和摄入／晨重共享图形转场；三专页顶部直接打开完整业务录入，集中设置、小助手与底部详情保留。电脑同步配色与控件，保留成熟导航和图表。实际业务对照见[手机交互与迁移](mobile-interaction-research.md)。

467项单元／集成、lint、typecheck、本地和正式production build通过。正式IAB Chromium核对手机320／390／430px、矮屏、深浅外观及1100／1440px电脑；身体与消耗实际保存回看、饮食完整面板、助手和趋势返回通过，18项公开／保护／协议检查通过。一个虚构账号及35表所属数据已清理，前后43表及既有健康事实核对通过；最终Runtime error／fatal和5xx为0。真实iPhone、系统键盘、WebKit、系统文字放大和真机帧率未测；完整证据、其余边界与回退见[维护验收](maintenance-verification.md)和[部署](deployment.md)。

## 此前正式版本：饮食详情与输入对齐（2026-11-05）

正式饮食页https://formward-ten.vercel.app/dashboard/meals指向READY部署`dpl_HFeRzEVLnECg3wbReUGhEZ2gzgAP`，应用源码`0a566c184b72edc072bf35592661fd22397a9cd0`，构建`meal-details-0a566c1-20261105`；项目、正式别名、sourceCommit／gitCommitSha及版本接口已核对。main统一本轮已发布应用与验收记录，纯测试／文档提交不代表另一次应用部署；Vercel项目未连接Git自动部署。原主工作区双区、COS、DNS及未提交内容保持隔离。

饮食与总览共用SavedMealList，只保留当天一个供能环图。展开餐次隐藏摘要，保留一次三项宏量与完整食物清单；食物的营养、来源和依据原位展开，备注／照片按需打开，打开附件后请求原图。每餐环图、百分比、中间重复热量块和来源数量退出；编辑／更多在餐末，添加一餐／已记全在全部餐次之后，总览只保留一个饮食跳转。手机读数按完整内容切换四列／2×2／极窄一列，触屏横屏全宽，固定滚动条空间，日期标题按完整文字块换行。 餐次编辑器表内10px内距优先于通用12px默认值，手填／下拉单位与表头内容边缘实测偏差由2px降至0px，输入16px与44px点击范围保持。布局测量同时包含实际控件文字、补足的小数位及待修改的长输入，使用真实字体与内距；空间不足切换布局，聚焦／失焦后复测，不改写输入、计算、精度或保存规则。助手窗口与主图表保持现有布局。

干净源码通过lint（0错误0警告）、typecheck、465项单元／集成、production build和结构检查。正式Chromium／WebKit各60种新详情、28组原详情及12组边界、6组展开、缩放与真实记全／编辑／删除取消通过；完整编辑器每引擎20组输入场景、15组气泡和12组独立食材库，含包装换算、旧精度及AI审核通过。十段教程每引擎实际播放与跳转通过；AI及补录四片与封面／预览已更新，其余六片和全部旧媒体保留，16个新媒体完整SHA256、8项Range及19项入口／协议检查通过。

六个虚构账号及34表所属数据已按明确ID清理；43表结构、29条迁移账本与既有健康事实核对通过，最终issues为空。私有快照`meal-details-20261105-before.json`、`-after.json`及`-verification.json`位于原主工作区data/exports，0600且Git／部署忽略。正式最终部署日志窗口2026-11-05T09:48:47.000Z—2026-11-05T10:20:01.000Z，Runtime error／fatal与请求5xx均0，无排除区间及后续分页。

实际截图、原始失败、未测项及回退见[维护验收](maintenance-verification.md)与[部署说明](deployment.md)，接手顺序见[交接](../handoff.md)。

## 此前正式版本：小助手与总览（2026-11-05）

按用户本轮明确授权发布并统一main。正式总览https://formward-ten.vercel.app/dashboard指向READY部署`dpl_A9LrFGGKCuzrSnqfa43ve2hRcecK`，应用源码`9307ed63ca11c67a51b19839ce08971232a84e96`，构建`assistant-9307ed6-20261105`；项目、正式别名、sourceCommit／gitCommitSha及版本接口核对通过。代码从main的6142fb9独立开发，main包含本次已发布应用及发布验收记录；原主工作区的双区、COS、DNS和未上线修改保持隔离。后续纯测试／文档提交不改变该应用部署；项目未连接Git自动部署。

电脑右下角非模态助手、手机底部面板替换工具，提供每日最多一次且有事项才出现的两日核对、补录和真实操作入口；总览新增区间摘要及每批50日的缺口展开。身体和总览的估计标识、读数说明共同参与稳定布局，真实鼠标切换实测／估计时各配置位置变化≤1px；更新两段AI教程，保留旧媒体。只读`/api/assistant-context`仅用网页会话，无数据库migration、公开HTTP v1、MCP或AI授权范围变更。

部署前从9307ed6导出干净源码重新通过465项单元／集成、lint（0错误0警告）、typecheck、production build和目录结构检查；`.impeccable/`已加入部署忽略，实际上传清单不含私有资料。正式Chromium／WebKit各31组、46张截图全部通过，客户端异常与非预期5xx均0；19项入口／协议检查及8个更新媒体文件完整SHA256校验通过。实际核看正式电脑、手机截图，完整视口与未测项见[维护验收](maintenance-verification.md)。

发布前后私有备份`assistant-20261105-before.json`、`assistant-20261105-after.json`及`assistant-20261105-verification.json`位于主工作区`data/exports`，0600且Git／部署忽略。43表结构、29条迁移账本及既有健康事实保持；期间已有账号正常新增一笔经网页确认的AI餐次、4食物项、1照片及一次OAuth续期，已按操作、审计和成功HTTP请求核实，仅放行由两份快照哈希绑定的精确新增行及旧令牌两项轮换字段，issues为空。两个虚构账号及34表所属数据已清理，正常用户写入保留。

日志窗口2026-11-05T04:48:26.000Z—2026-11-05T05:17:07.000Z，Runtime error／fatal及请求5xx均0，无排除区间、无后续分页。私有证据在本工作区`.codex/assistant-release`，最终正式报告为`production/chromium-final/report.json`与`production/webkit-final/report.json`；正式截图位于`C:/Users/14878/.codex/visualizations/2026/11/05/formward-assistant-production`。立即应用回退基线为上一READY部署`dpl_HfTwrwJYqBCdnA4YTcA3GMfHVdiV`（ff4357a）；保留用户合法写入及审计。

## 本次开发起点（2026-11-05）

用户已明确要求先统一并推送main。main从a9988ea快进至最新正式发布分支codex/detail-disclosure的8760792，包含此前已上线的餐次、来源、密码、录入、图表及详情展开改动与验收记录；后续仅补充本次基线说明。应用源码仍与正式ff4357a一致，本次不产生新的应用发布。

本次重新通过459项单元／集成、typecheck与production build；统一后的main工作区lint为0错误、0警告。应用目录、公开素材、构建脚本、依赖及Next配置与ff4357a逐项无差异，沿用该版本已有正式视觉验收。

后续功能从统一后的main建立工作分支。原主工作区codex/mainland-server-preparation及其未提交内容保留，双区、COS、DNS和未上线迁移不随本次进入main。小助手开发进展见本文开头；统一基线的应用仍对应既有正式版本。

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

## 此前正式版本：Unslop B 与图表交互

正式域名https://formward-ten.vercel.app，READY部署dpl_HKAXv65zohYhmp8UWHhSkk2my21W，源码ad7c639，构建unslop-ad7c639-20261104。用户本轮只授权发布，main未更新；双区、COS、DNS及未上线迁移未夹带。

登录舞台稳定、图表220ms选日过渡与离开恢复、日期详情供能环图、饮食底部操作、身体标题日期／字段后保存、食材库和消耗B样式均已上线。正式两引擎80张页面、16组操作、14组图表、8组登录结果与两项真实保存复验通过；2个虚构账号清理，43表、29条账本和原记录保持。版本、备份、脚本首轮失败与纠正、日志和未测项统一见[部署](deployment.md)及[验收](maintenance-verification.md)。



## 发布前归档：晨间空腹说明归入按钮（2026-11-04）

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


## 发布前归档：录入交互统一本地验收

分支codex/entry-interaction-unification，独立工作区Formward-worktrees/entry-interaction-unification，从正式源码及发布记录f85e489建立。没有连接生产数据库、发布公网或更新main；原主工作区双区／COS／DNS等改动保持。无schema、migration、运行依赖、公开HTTP／MCP或权限变化。以下为本地实现，不能当作正式站已上线。

身体手机先晨晚、并排体重体脂、同行更多设置与来源；顶部保存两侧实际修改，编辑不重复概览。估计原位显示且不转实测，其他草稿保持。有效内容决定退出保护，空白与删回空白可退出，清空已有值仍确认。来源晨晚合并取目标之前3次有效实测，同槽一次，空来源中断、移除不恢复。首页新增独立于图表的昨日消耗／饮食及今日晨晚提醒。

餐项漏名称保留营养与草稿；AI包装只改名保留每包规格；超额照片整批拒绝且不丢已有失败队列。身体、个人资料、食材、来源、消耗与导出对齐输入与保存状态。独立库搜索／添加／编辑／详情入口清楚，详情展示标签基准、包装和四项营养。添加活动直达一条空草稿，失败靠近保存；历史日期有查看／Enter且同日可重开，导出原页校验与重试。已认可的总览读数、七日、导航与品牌保持。

455项单元／集成、lint零警告、类型及production build通过。隔离原生PostgreSQL的Chromium／WebKit各14项主流程、各48张截图通过；另测超额选图保留原失败队列、库详情与输入边界。两引擎各完整播放十段影片并检查键盘步骤重看；身体／补录共四段重录，其余六段经核对保留。所有数据均为虚构账号。实际尺寸、对比度、自检与未测项见[验收记录](maintenance-verification.md)；规则归入[设计规范D11](design-reference.md#d11录入任务草稿与反馈)。

本地验收入口http://localhost:4183，账号review@formward.example.test，密码Entry-review-2026。仅供本机虚构数据验收，独立PostgreSQL与127.0.0.1应用服务；private .codex/interaction-check/local-preview.json记录进程和目录。真实iPhone、系统软键盘、系统原生全屏未测。用户验收仍待完成，不把自检通过当作用户认可。

## 此前正式版本：营养最多一位小数

正式域名https://formward-ten.vercel.app已核对READY部署dpl_7HXQr3oesTodRoLNQN3xGFeAXtVC，应用源码332115d0d2bc86f2588539d920af1cf4a6082e6a，构建0a48dc57-73d1-49da-a67b-1275d2741d2e。来自独立工作区Formward-worktrees/meal-entry-macros、分支codex/nutrition-decimal-input；仅发布本轮营养精度调整，未推main，主工作区双区／COS／DNS等未上线内容保持隔离。

蛋白质／碳水／脂肪的网页手填、AI手工修改与显示统一最多一位小数，去掉末尾0，第二位小数明确报错并阻止提交。热量仍按原精度计算和合计后四舍五入显示整数；1.2／0／0.1保留5.7kcal、显示6，17.5／4.3／1.1保留97.1kcal、显示97。Excel宏量列0.#，能量0，身体0.00。旧四位数只聚焦、失焦或改备注不舍入写回；公开HTTP／MCP、包装换算及计算落库原精度保持，没有迁移、依赖或权限变化，其他交互审查建议未实施。

443项测试及本地／正式两引擎复验通过；2个虚构账号清理，43表与29条迁移账本严格核对无差异，原记录保持。完整截图、日志及数据证据见handoff.md与maintenance-verification.md。

## 此前正式版本：营养小数与整数热量

P／C／F小数录入与整数热量展示已发布。正式域名https://formward-ten.vercel.app指向READY部署dpl_DpXQjf62CNDgHQSXqPtupeexqUF5，应用源码560e9a93f2597682acf061f5c5bf5f9a88156e04，构建16afb946-18f8-48b4-bcff-9bc58a9dfcef。分支codex/nutrition-decimal-input，独立工作区Formward-worktrees/meal-entry-macros。本轮仅发布，未推GitHub main，主工作区双区／COS／DNS及其他未上线内容保持隔离。

网页餐次、食材规格及AI手工修改的蛋白质、碳水、脂肪可填最多4位小数，编辑显示原精度；查看最多2位并去末尾零。kcal、消耗与热量差仍四舍五入显示整数，计算、合计与落库不提前取整。P1.2345／C0／F0.1保留5.838kcal、显示6；17.5／4.25／1.1保留96.9kcal、显示97。Excel宏量列0.##、能量0、身体0.00，仅改变显示格式。旧值聚焦／失焦及仅改来源／备注不舍入写回；未知与明确0、包装换算、公开HTTP／MCP精度保持。未接入上一轮其他交互审查建议。

443项单元／集成、lint、类型、production build、结构检查和修改目标设计检测通过。隔离原生PostgreSQL及正式Chromium／WebKit均通过各20组餐次场景、15组详情、12组独立库与3项小数专项；正式各79张截图，手机／电脑、深浅主题、320／390／430／横屏／1100／1440、四位输入／五位拒绝、真实保存、旧值保持、食材与AI确认复验。实际查看正式手机及桌面AI截图。最初PGlite协议异常和测试遗漏既有大幅变化确认的失败证据保留；改用独立原生PostgreSQL、等待真实页面就绪并显式完成确认后通过，没有吞异常或改变应用保护。真实iPhone与系统软键盘未测。

正式7项公开／保护入口通过，正式别名、源码与build再次核对；最终正式客户端异常及5xx为0，部署最近20分钟Runtime error／fatal与请求5xx均0，无排除区间或后续分页。2个本轮虚构账号及34表所属数据已清理。43表结构、29条迁移账本、既有健康记录、请求和审计保持。首次严格对照仅发现一次既有OAuth授权续期及同时间认证防重放缓存；旧令牌撤销、新令牌有效，身份／会话／client／授权码／权限／资源逐项相同，旧部署同秒token接口200佐证，正常使用保留。严格初报及最终窄范围核对均留档，最终issues为空。

备份nutrition-decimal-before／after-2026-11-03.json及nutrition-decimal-production-verification-2026-11-03.json在私有data/exports、0600并被Git／部署忽略；证据.codex/nutrition-decimal-release及独立工作区.codex/nutrition-decimal-check。没有迁移、历史初始化、运行依赖、公开字段或权限变化。上一READY部署dpl_5WnHbK1FTZtuSG1GjMYatBhxz84J保留供应用回退，不回滚用户数据或正常授权续期。

## 此前正式版本

手机独立食材库换行与电脑重复按钮已修正并发布。正式域名https://formward-ten.vercel.app指向READY部署dpl_9NN2wRePFTmKhbXnQ7Zit6xJcDfq，应用源码2157ed8c415f0680c37fdeccd656000d4a1d3087，分支codex/meal-library-width-fix（工作区仍为Formward-worktrees/meal-entry-macros）。这是刚上线餐次功能的后续纠错，main未更新；主工作区双区／COS／DNS及其他未上线改动保持隔离。

原因是独立食材库切换为手机网格列表后，仍被旧电脑名称32%列宽压缩，390px触屏复现名称仅75.72px。现仅在宽容器表格采用32%，手机名称占满实际分配的四列区域（约227–237px，随视口和滚动条变化），不缩字、不靠禁止换行遮住长名。电脑双栏时取消“自己填写／从食材库添加”和“返回本餐”，直接使用左右两栏；窄屏单栏保留必要切换。餐次窗口内食材选择及独立食材库分别检查；热量计算、保存、数据库结构和公开协议没有改动。

439项单元／集成、lint、类型检查、production build、结构及链接通过。隔离和正式Chromium／WebKit分别各20组餐次场景、15组详情、12组独立库深浅主题与六种屏宽检查通过，各76张实际截图；新增名称框实际宽度应等于其网格分配宽度的断言。正式手机390、浅色320、电脑1440和修复前后截图已正常比例查看；两个库入口、按钮显示、包装换算、旧值精度、4／4／9和AI确认回归均通过。客户端异常与请求5xx为0，部署最近20分钟查询窗口Runtime error／fatal及请求5xx为0，无排除区间和后续分页。7项公开／保护入口通过，构建标识21875fc8-97d9-45f3-b206-a8aac62b0cf2。真实iPhone及系统软键盘未测。

43表结构和迁移账本保持；2个本轮虚构账号及所属数据清理。首次严格对照发现正式账号期间一次正常网页消耗保存（含来源使用时间）和一次管理员解锁，已用原／新快照、操作、前后审计、操作者、确认者、版本和时间逐项对应；这些合法更新原样保留，其余原行无未解释变化。严格原报告留档，最终逐行核对issues为空，不把正常使用回滚。备份database-before／after-meal-library-width-2026-11-02.json、严格及最终meal-library-width-production-verification报告均在私有data/exports、权限0600并被Git／部署忽略。第一次备份进程未完成，保持生产只读，重试成功后才发布。私有证据.codex/meal-picker-width-fix；没有新迁移、依赖、权限、公开字段或历史初始化。


## AI消耗确认：已发布公网

用户于2026-10-31验收实际手机与电脑页面后明确要求发布。正式域名 https://formward-ten.vercel.app 已核对 READY 部署 dpl_7D4YT9WWAex4TCJpACpetuktb7ej，应用源码 a2c24f14fe0e0cd205d4adc37682c0dbb09aa730，位于独立发布分支 codex/energy-review-release。以已上线品牌版本9bd0da8为基线，仅提取本轮AI确认修改，品牌与既有账号安全保持，未带入双区、COS、0028、环境或DNS变更；main未合并。

同一日期的全天消耗与运动分组，手机纵排、电脑左右对照；来源备注默认收起，真实变化才显示前后对照，分组取消经应用确认。自动核对已有运动只引用ID／版本，保留801运动＋145期间静息分项，不把946全作额外运动。旧自动核对预览须刷新并重选，未批量改写已保存记录或原始请求。

正式基线414项完整单元／集成、lint零警告、类型、production build和目录检查通过；隔离与正式站Chromium／WebKit各19张实际截图、16组检查，最终客户端异常和5xx均0。已实际查看正式手机及电脑页面。正式20项公开／受保护入口与5份品牌图标字节校验通过，部署20分钟Runtime error／fatal与请求5xx均0，无排除区间；CLI精简inspect结果用元数据筛选列表的URL与gitCommitSha交叉核对源码绑定。真实iOS及系统软键盘未测。

发布前后私有备份data/exports/database-before-energy-review-2026-10-31.json、database-after-production-energy-review-2026-10-31.json及energy-review-production-verification.json均0600、Git／部署忽略。42表结构、迁移账本及原有行值保持，新增原表行及旧字段变化均空；两个虚构普通账号、记录、预览、凭据和所属审计已清理。没有migration、历史初始化、公开工具或权限变更。证据在主工作区.codex/energy-review-release/，正式浏览器截图与报告位于production/{chromium,webkit}/；正式源代码与独立发布记录同分支保存。

## 品牌 Logo：已发布公网

用户于2026-10-31查看实际页面后明确要求发布公网。正式域名 https://formward-ten.vercel.app 已核对 READY 部署 `dpl_FWmg8Xf75oRAnasTNePGVAmf9Ye7`，应用源码 `273dbb5`，来自独立分支 `codex/brand-logo-release`。以此前正式基线 `42c7e8a` 仅接入 F＋手臂标志、透明导出、全站品牌组件及 favicon／Apple 图标；未带入双区、地区选择、COS 或新 migration。main 未修改，域名 DNS 与私有双区预览未切换。

发布基线 lint、typecheck、409项单元／集成、production build、目录及diff检查通过；隔离 Chromium／WebKit 各48张品牌截图、30组页头检查通过。正式两引擎各30张实际截图、18组页头检查通过，客户端异常及请求5xx为0；20项公开／受保护入口与5份图标文件逐字节SHA256校验通过。正式别名再次核对仍为新部署 READY；该部署20分钟查询窗口 Runtime error／fatal 与请求5xx均0，无排除区间。实际查看正式桌面首页和WebKit手机总览；真实iOS和主屏图标实机显示未测。

## 居中定位：已修正并发布

正式域名https://formward-ten.vercel.app已核对READY部署dpl_2C8bsftEneVCMEVdPidswep4kxxQ，应用源码bcbca33，main已推送GitHub。以账号管理版本1cd5c4d为基础，纠正既有导航布局的居中定位：正文左右112px对称预留、页头对称回扩；右侧三点把手按自身中心对准视口中线，手机次级页入口清除电脑位移。

1440×900修复前实测正文向右24px、把手中心向下77px；修复后隔离和正式站Chromium／WebKit均为0偏移。两引擎正式各38张实际截图，覆盖1100／1440／1920px及不同高度、320／390／430px手机、滚动、原页窗口调整、150%CSS放大、工具展开／Escape、减少动态效果，以及AI／导出页手机右下角入口。实际查看修复前后及正式截图；真实iOS和系统软键盘未测。409项完整单元／集成、lint、类型检查、生产构建、结构及269项根文档／docs本地链接通过；两引擎共用饮食填写、旧精度、包装换算和AI确认回归通过。正式19项入口通过，客户端异常、请求5xx及该部署20分钟Runtime error／fatal均0，无排除区间。

本轮没有migration、历史初始化、账号角色／权限、健康计算或公开协议变化；保留0027及全部账号安全检查。生产前后data/exports/database-before-centering-2026-10-30.json、database-after-production-centering-2026-10-30.json及centering-production-verification.json均0600、Git／部署忽略；42表结构、账本、原账号／密码、健康事实、请求与审计保持，未新增原表行值变化，虚构普通账号、会话和所属审计已清理。证据.codex/centering-before/、.codex/centering-visual/、.codex/centering-meal-regression/及.codex/centering-release/。

## 账号管理：已发布，main已更新

分支 `codex/account-management-v1` 提供 `/admin`、`/dashboard/account`、`/account/claim`。owner 的账号／邀请／审计后台需当前会话再次验密，十分钟过期；手动邀请72小时、普通账号重设15分钟，随机链接只存摘要，预览不消费、成功保存原子消费。没有邮件、公开注册、代登录、角色编辑或删除用户。改密／停用／全部撤销联动网页登录、AI Token、OAuth 和未用恢复链接，恢复不复活旧授权；旧版本在途会话／写入被拒绝。

新增0027 migration，共41张应用表；不改旧密码、健康事实或既有验证状态，不自动指定 owner。首次引导与 owner 恢复工具见 [账号说明](auth-setup.md)。409项完整单元／集成、lint、typecheck、production build、真实PostgreSQL并发与原登录／OAuth浏览器回归通过；隔离Chromium／WebKit各41张实际截图、正式各17张截图及19项入口通过，客户端异常和请求5xx均0。新账号空身体页与图片／视频等待竞争已修复，真实iOS和软键盘未测。详细证据见[验收记录](maintenance-verification.md)。

用户已验收页面并授权发布、更新main。账号管理原发布代码c9baf09及其验收记录已保留，当前正式版本以上方居中修正为准；0027已迁移，并为用户指定的已有账号初始化唯一owner。main包含实现和发布记录，已推送GitHub。发布前后四份私有备份及逐项核对证明旧字段定义、账号密码、健康事实与原授权保持，仅指定角色和初始化审计新增；虚构测试数据已清理，正式证据在.codex/accounts-release/。该部署20分钟日志查询窗口无Runtime error／fatal或请求5xx、无排除区间；后台完整解锁与停用恢复流程在隔离环境验证，生产验收不使用真实owner密码或仿造其会话。

## 导航调整：已发布，main已更新

正式域名https://formward-ten.vercel.app已核对READY部署dpl_J1iW1MiZuL2MbxPjkdEPQHDdJX2E，应用源码b81dac3。电脑采用左侧72px图标文字导航，手机采用贴底四项导航、最右侧单独放工具；电脑工具由屏幕右侧三点把手打开，账号改为右上角人像。main已推送GitHub；本次用户明确授权免去再次验收等待，完成必要测试和实际网页自检后直接发布。

392项完整单元／集成、lint零警告、typecheck、production build、结构／267项文档链接／diff检查通过。隔离与正式站Chromium、WebKit均覆盖320／390／430px手机及1100／1440px电脑，正式各67张截图；检查四页真实跳转及高亮、滚动固定、侧栏不移动正文、菜单与填写窗口互斥、键盘焦点／Escape、触屏横屏、活动合计保护、AI草稿和悬停稳定。四页日期与主要读数共同基线一致。两引擎共用饮食填写、旧精度、换算与AI确认本地回归通过。正式16项入口通过，客户端异常与请求5xx均0；部署20分钟Runtime error／fatal及请求5xx均0，无排除区间。真实iOS及系统软键盘未测。

发布前后data/exports/database-before-navigation-2026-10-29.json、database-after-production-navigation-2026-10-29.json及navigation-production-verification.json均0600，Git／部署忽略。40表结构、迁移账本、原健康事实、请求及审计保持，虚构账号及全部所属数据已清理；正常限流元数据单独处理。没有migration、历史初始化、权限、公开协议、环境变量或健康计算变化；OpenAPI1.13.0、MCP1.11.0保持。正式证据.codex/navigation-release/，本地证据.codex/navigation-visual/及.codex/navigation-meal-regression/。

## 已有消耗交互与工具能力

消耗估计标签已隐藏，必要饮食提示在同一区间保持稳定。活动合计自动说明与手填来源分开；菜单切换和清空失焦先确认，取消保留草稿。工具覆盖式打开，接入AI授权与Excel；打卡、总结和站内聊天暂未开放。账号菜单提供账号设置、退出，owner另有账号管理。工具关闭保留固定选日，AI应用修改仍须统一确认保存。当前入口位置及发布版本以上方账号管理为准。

## 已发布基础：身体、运动与记录更新

身体同槽覆盖和单项删除、运动分项／计入规则、90秒跨页更新和保存前核对已接入；常见餐次中文、AI应用修改、温和数值核对、手机横拖、自定义应用／取消及慢图登录保持现有布局。0026只新增activities三列和约束，旧运动不回算。本机379项单元／集成、必要网页和正式站双浏览器验证通过；0026已迁移并正式发布，原有健康数据和审计核对保持。详见交接及验收记录。


Formward采用Next.js16.3.7、React、TypeScript、Node.js24.21.0和pnpm9.15.9。app负责页面／动作／HTTP入口，features共用业务，PostgreSQL／Drizzle保存事实及审计，Better Auth认证。新手阅读[学习指南](code-study.md)。

## 当前功能

总览保留双层日期关联图：上层蓝色摄入线、红色消耗线，柔杏金盈余与雾蓝灰缺口填色；下层暖白次晨变化，共用日期、选中线与命中区，缺测断开。默认选最近同时有摄入和消耗数值的一天，再回退至最近有记录日；手机7D、桌面30D，不足时扩大至容纳目标日的最短既有区间。能量线图按全区间留5%且至少100 kcal余量，整齐刻度与范围分开生成，kg轴独立包含零，选日不改变坐标。手机先用紧凑行展示摄入、消耗和盈余／缺口，首屏完整显示双图及共用日期刻度；右侧合并显示次晨标题与读数，移除拥挤缺测短横但保持断线，两日晨重在详情；桌面保留两组读数和紧凑入口。7D／30D／90D／全部／自定义、估计开关、键盘／触屏及详情保持，当天确认为已记完且摄入、消耗都有数值时计算盈余；营养部分未知或估算不额外阻止相减。未记全／未确认日保留摄入展示，不产生盈余。

状况摘要分别采用今天及以前最近的记录日期：摄入汇总该日全部有效餐次，显示日期、餐数及kcal；消耗采用最近有效日记录或已完成运动所在日期，显示日期和读数。部分、未知和明确0保持区别；各类日期可以不同。手机在趋势图下显示身体／摄入／消耗三行紧凑摘要，桌面保留三张卡片；跨零点不会清空已有摘要。

消耗录入为分开记录／只记总数；总数或活动合计可与运动明细共存，运动必须明确已包含或额外增加，不按大小猜测。活动累计直接求和，未知保持未知。分项来源独立，运动继承当天日期并可随日记录事务保存。公式计算、资料入口及正常AI公式动作撤下；日常默认值已停用，旧表与审计保留。网页移除来源记录编号、活动估算勾选及实现说明。详见[消耗规则](energy.md)。

网页、HTTP、MCP使用同一业务计算与确认事务，展示读数在服务端整理，浏览器只输入、选择及绘图。未知与0区分，没有记录的日期不自动生成消耗。一次性历史初始化使用私有明确范围的审核批次，不能变成长期偏好。

统一审核支持身体、摄入、食材和消耗混合提交；普通单餐仅修改／取消和一次确认保存，照片未齐不阻止文字保存，餐次修改展示具体增减。AI禁止删除或恢复整条记录，网页手动保留。逐项修改只改草稿，底部确认后同一事务保存，失败整体回滚。旧消耗预览须刷新后按新规则确认，退役默认与公式项只能取消。原始请求、来源、操作者、版本及可恢复审计保留。

摄入页摘要默认最近有记录日；四页共用图表选日、区间按钮、紧凑记录行、历史窗口与Inspector。主列表保留今天及前6天待处理日期，完成或更早日期从列表下方“查看全部”在页面内展开；每批50日且不重复最近日期，具体日期查看或编辑才打开Inspector。空日期仅界面推导。摄入无连线，“已记全”使用固定文字的勾选控件，完成后打勾、文字变淡，餐次在Inspector展开。新自由项填写本次总营养，数量不再相乘；旧每份项回显已计算总量，未修改项保留原数据。可靠包装默认按包录入，历史克数不改。桌面总览悬停预览、点击固定、图外／Escape解除，默认详情折叠餐次和图片，身体与消耗并排。

身体页手机优先当前体重、体脂率和完整体重图，近7日统计与图表选项收起，体脂图可下滑；桌面六项摘要与原有晨晚、候选、估计、来源和准确时间规则保持。摄入页保留食材／餐次、单位换算、PFC展示与私有原图。网页手工确认后永久删除餐次、食材、日消耗或运动，保留审计、备份与既有软删除数据；删除食材保留历史餐次快照，AI整条删除继续禁止。照片最多8张、每张20MiB，原字节存Private Blob，数据库只存元数据与关联。

总览、身体、摄入和消耗图形复用原生动效，首次可见450ms、区间切换200ms；数字、坐标和命中区保持稳定，遵循减少动态效果，首页与弹窗行为保持。

## 协议与数据库

完整接入和补授权统一通过authorize_formward一次申请身体、饮食／食材、消耗的查询与提交预览，用户在OAuth网页明确同意。连接检查只返回授权状态，不读取健康内容或创建预览；日常只读连接保持只读，旧令牌不自动扩权。

仓库协议OpenAPI1.13.0／MCP1.11.0，共13工具。消耗查询沿用GET /api/v1/energy和query_energy；统一提交扩展entryMode、activityMode与分项来源，旧无模式请求兼容。OAuth仍按身体／饮食／消耗原权限隔离，不自动扩权；AI正式保存必须用户网页登录确认。

仓库与正式schema至0025，共39张应用表加Drizzle账本。0023保存每日完成状态与审计，0024增加份数、包装和运动包含关系的兼容列，0025将食材规格唯一索引限定至有效条目；旧列、记录及审计不改。energy_sources从既有未删除消耗／运动的名称初始化账号建议，正式保存与来源更新同一事务；原36表字段和值保持。energy_days沿用0021显式模式、分项来源及resting_estimated；energy_defaults仅保留退役存储与审计。完整字段见[数据库字典](database.md)。

## 此前业务验证

354项单元／集成、lint、typecheck、production build、283项文档本地链接及15项章节锚点、结构与diff检查通过。饮食、消耗、统一审核、日完整性、图表、登录／OAuth、加载、本人Excel及身体完整回归通过；覆盖320／390／430／1100／1440px、矮屏、触屏横屏、跨零点、减少动态效果，实际截图已查看。

此前三阶段部署dpl_5yW5kVWVmjozc837AaRpXeMUtgLU，运行代码83a773c，数据库0024。正式站虚构账号复验固定／解除日期、详情折叠及延后原图、每份与包装、两种运动录入顺序、一次审核及缺图保存；MCP1.10.0、13工具、删除限制和消耗查询通过，15项公开入口与登录保护通过。客户端异常／请求5xx为0，验收时段最近10分钟Runtime error／fatal为0。临时账号、OAuth客户端和全部所属数据已清理。

迁移前后及发布后40表逐项核对，旧健康事实、原始请求与审计保持；0024只增加六个兼容列。唯一授权食材包装维护有独立预览、版本、幂等及审计，旧餐克数与营养保持。第一批仅授权账号28个截至2026-10-23的历史餐日初始化为已记完，不套用其他账号或未来日期。备份与核对见[交接](../handoff.md)，完整验收见[验收记录](maintenance-verification.md)。正式截图和机器报告在私有.codex/stage3-release/，本机密集波动样本在.codex/maintenance-visual/。

## 维护边界

这轮后以维护和体验优化为主，不新增训练计划、预算或佳明自动同步。身体准确时间／归属网页纠正、持久代表选择、网页删除恢复和通用导入尚未接入。真实手机／微信观感仍由用户最终核对。用户健康数据、私有请求、备份和凭据不进入公共代码、测试、截图或public。


## 当前界面验收与发布

正式域名 https://formward-ten.vercel.app 已核对 READY 部署 dpl_HeNMUADh26b3D68zZPgx2kdgeNfm，运行代码 b654847，数据库0026；功能分支codex/latest-records-energy-sources已推送，尚未合入main。已合并32be0cd，保留此前餐次字号、列宽、单位及详情定位修正。OpenAPI1.13.0、MCP1.11.0，13个工具与既有权限种类保持。

379项单元／集成、lint、typecheck、production build、312项本地链接和15项章节锚点、60个团队目录README及diff检查通过。隔离Chromium／WebKit验证运动分项、AI修改不正式保存、单项删除、跨窗口保留输入与明确覆盖、自定义取消、慢图登录；四页矮屏、横屏、键盘、减少动态效果及历史回归通过。正式站两浏览器各五种宽度重走实际保存和更新提醒，Chromium发出真实浏览器触屏事件验证横拖选日及纵向滚动。16项入口保护通过；最终验收客户端异常与请求5xx为0，部署最近10分钟Runtime error／fatal和请求5xx均0。WebKit首轮捕获一次跨页请求错误，诊断保留；补充跳转前后等待请求完成后，无过滤重跑通过，不将首轮记为通过。真实iOS及系统软键盘未作实机测试。

正式报告与虚构截图在私有.codex/body-energy-release/，Chromium／WebKit分别为production-chromium.json与production-webkit.json；READY见.codex/body-energy-inspect-final.log。测试账号及所属记录、待确认操作、令牌与会话已全部清理。发布前、迁移后和发布后三份私有备份为data/exports/database-before-body-energy-2026-10-28.json、database-after-body-energy-migration-2026-10-28.json和database-after-body-energy-production-2026-10-28.json，均0600、Git与部署忽略。

body-energy-migration-verification.json与body-energy-production-verification.json核对40表原有列、健康事实、请求和审计保持，0026只加三列及一条账本，旧运动新列保持NULL。期间已有账号正常新增的图片、待确认提交及授权轮换均保留，未代确认、删除或回滚；body-energy-concurrent-verification.json单独核对新增归属与测试数据清理。回退必须保留运动分项计算及新列，不切回无法理解components的旧后端。

## 训练入口

训练会话、自动保存、暂停继续、结束回看、模板与月历已接入，消耗保留独立视图。已按本轮授权发布，READY dpl_rKAT7xqZmc1unBoqxqPBM3AH5tkA，应用源码ff08c99；验收与部署状态见handoff.md及maintenance-verification.md。0033仅新增训练四表，现有设备同步与消耗规则保持。
