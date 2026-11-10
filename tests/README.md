# Tests

## 豆包接入

`pnpm test` 包含 `src/features/doubao/oauth.test.ts`，在隔离 PGlite 中实际执行 OAuth、PKCE、授权码兑换、刷新轮换、绑定冲突、撤销、双协议 MCP、预览幂等与原 GPT 连接兼容；平台身份响应仅在测试中替换。另在 `integrations/doubao` 运行 `pnpm check`、`pnpm test`、两份 YAML 校验及 `pnpm exec dbx build local`。

production build 后执行 `node --import tsx tests/doubao-fixture.mts`，在回环3419启动真实 Next 页面，3420提供新建虚构身份的入口。fixture 只使用临时数据库与 `example.test` 账号，不读取正式环境或健康事实；退出使用 SIGTERM／SIGINT。浏览器交互与截图记录见 [豆包接入](../docs/doubao-onboarding.md)。本机测试不能代替真实豆包 App 的身份交换和 WebView 回传。

## Garmin 个人密钥连接

production build 后运行 `node --import tsx tests/data-sources.browser.mts`。入口自行创建仅回环可访问的隔离 PGlite、两个虚构账号与服务端 Garmin 响应，不读取正式密钥或访问真实 Garmin。`FORMWARD_SOURCES_ENGINE=webkit` 切换引擎，`PLAYWRIGHT_BROWSERS_PATH` 指定浏览器缓存，`FORMWARD_SOURCES_ARTIFACTS` 指定私有证据目录；`FORMWARD_SOURCES_PREVIEW=1` 保留本机演示，SIGTERM／SIGINT关闭。

检查首次“输入个人密钥”与已有“更换个人密钥”、提交后立即读取、刷新持久化、输入掩码／成功清空、网络失败留稿、重复提交保护、版本冲突及两个账号的数据隔离；两主题覆盖320／390／430、横屏、1100／1440。内部任务另验鉴权、拒绝客户端指定账号及多人调度；原生真机未测不计通过。单元／集成测试覆盖开放模式、加密绑定、跨账号拒绝及失败隔离。

## 助手、菜单与图形往返

production build后运行pnpm test:assistant-browser与pnpm test:desktop-linked-browser，分别用FORMWARD_ASSISTANT_BROWSER／FORMWARD_DESKTOP_BROWSER选择chromium或webkit。均为独立虚构账号：助手验证不自动打开、待办角标、两层菜单、系统开关、底部工具、半全屏、失败重试、跨设备忽略、快速反向和焦点；关联图验证三卡往返、数据平面、选日、范围、晨晚与体脂、草稿保存及跨账号清理。旧估计功能不作为有效测试入口。

加载故障恢复可设置FORMWARD_LOADING_NATIVE=1与FORMWARD_POSTGRES_BIN指向本机PostgreSQL 18的bin目录；测试在临时目录初始化全新集群，仅监听127.0.0.1，不读取真实环境文件，退出停止本人集群。默认PGlite适合普通矩阵，协议层异常须记录原始失败并使用原生库复核，不能删除错误或算作通过。

## 单一国服网页与海外后台

同源production release后，FORMWARD_TEST_RELEASE指向该产物，运行node --import tsx tests/single-web.browser.mts；FORMWARD_SINGLE_WEB_ENGINE选择chromium／webkit。复用隔离真实PostgreSQL与本机TLS fixture，使用虚构账号验证原OAuth连接、国服确认链接、登录后返回目标、真实确认、跨账号404、旧网页跳转及已有草稿保留。FORMWARD_SINGLE_WEB=1运行tests/shared-primary.http.mts，验证原Cookie／JWT／refresh在严格信任测试CA的真实HTTP链路中保持。所有截图、日志与录像留在被忽略的.codex/single-web，不读取正式凭据或写入真实账号。

## 全站固定内容与加载反馈

production build后运行pnpm test:loading-browser。workspace-loading.browser.mts自行创建本机隔离PGlite、虚构饮食／测量／消耗及训练账号，不读取环境文件或接受外部数据库。FORMWARD_LOADING_ENGINE=webkit切换引擎，PLAYWRIGHT_BROWSERS_PATH指定本机浏览器缓存，FORMWARD_LOADING_ARTIFACTS指定私有证据位置。

workspace-loading-check.browser.mjs逐页检查总览、饮食、训练、消耗、身体的固定标题、查看／历史入口、图例及颜色；必须先存在且可见，再比较前后固定槽位≤1px。两主题覆盖320／390／430、矮屏、横屏及1100／1440／1920；保留首帧、完整采样及接管后至少500ms，真实列表行数变化单独记录。资料及安全面板检查200ms局部反馈、失败、关闭和迟到响应，页面导航保留草稿及焦点保护。减少动态效果不冒充完整动效验收。

FORMWARD_LOADING_PREVIEW=1保留本机虚构预览供人工核看，SIGTERM／SIGINT会关闭本人测试应用和数据库。FORMWARD_LOADING_DIAGNOSE=1只用于小范围定位并保留失败报告，不能作为最终通过证据；实际浏览器／真机未测项仍单独注明。

## 饮食列表直接记全

production build 后设置 FORMWARD_MEAL_DAY_INLINE=1，运行 pnpm test:desktop-linked-browser。沿用同一隔离应用与虚构账号，meal-day-inline-check.browser.mjs 通过真实 Server Action 验证最近及展开历史的勾选／取消、原位保留与刷新分类、键盘、只读详情、编辑入口、空日、未知及明确0。延迟、请求中断和已提交但响应丢失分别检验当前控件的反馈、重复点击保护、幂等重试、审计次数和版本冲突；逐帧记录图表选日、7D／自定义区间、滚动、焦点及布局锚点。

FORMWARD_DESKTOP_BROWSER 选择 chromium／webkit，FORMWARD_DESKTOP_ARTIFACTS 指定私有证据目录。两主题覆盖320×560、390×640、430×780、844×390、1100×850和1440×1000；手机另查实际触屏上下文的慢速保存与错误重试。原生回环 PostgreSQL 适合运输中断专项，FORMWARD_BROWSER_DATABASE_URL 只接受127.0.0.1、formward_browser_前缀的全新测试库，已有用户库会被拒绝，不读取.env.local。每次原生验收准备新库；默认仍可使用隔离PGlite。WebKit的整页刷新预取取消只在对应GET RSC请求确实被主动文档切换取消时单独归档，操作中的其他异常继续失败。

证据包含保存全过程的frames.json、results.json及双端状态截图；正常保存最大偏差须≤1 CSS px。真实iOS／Android设备未测，不以模拟触屏结果代替真机。

## 双端卡片关联与 Inspector

production build 后运行 pnpm test:desktop-linked-browser。入口默认建立本机隔离 PGlite，或使用显式指定的全新回环 PostgreSQL 测试库；执行现有 migration 并创建虚构账号，不读取环境文件或接受生产数据库。FORMWARD_DESKTOP_BROWSER=webkit 切换引擎，FORMWARD_DESKTOP_ARTIFACTS 指定私有证据目录；Chromium保留实际页面录屏，两引擎均记录真实帧和布局。

desktop-linked-check.browser.mjs检查首页三卡前置／自适应排列、三类七日链接、2:1真实目标及骨架、单次双向移动、浏览器前进后退、原滚动／焦点／区间／估计选项恢复、新标签、快速反向、慢网中断及迟到响应。骨架和目标使用相同轴字体、长刻度及数据平面，位置尺寸逐项相差不超过1px。复查手机／电脑反复切换的图表测量、鼠标／键盘估计读数≤1px稳定性、模拟触屏上下文选日、横屏与文字放大。Inspector覆盖普通／自定义标题、设置、身体／消耗／餐次编辑，实际验证失败留稿、继续编辑、放弃与成功保存后营养原值保持；另验真实记全、消耗改期取消／确认后的编号与事实，以及助手先收起再进入正确日期的编辑。

FORMWARD_DESKTOP_PREVIEW=1 启动持久虚构预览，默认4240、慢响应4241；FORMWARD_DESKTOP_PORT可改端口。可用FORMWARD_DESKTOP_BASELINE_ROOT指定由固定提交导出的独立已构建副本，预览使用4242，并以同一虚构数据库生成前后截图；不得依赖其他活跃任务会重新构建的.next。private preview.json保存本机进程和演示连接，不能复制到public或提交Git。真实iPhone、系统键盘与系统级文字放大不由这些模拟检查代替。

两引擎的完整动效检查顺序运行，避免录屏、布局采样和并行构建争用资源；不降低单图层、实际中间帧、一次300ms或≤1px断言。等待器持续跟踪POST／RSC，只有主文档已替换时才退役旧GET及已退出的sign-out运输事件，并写入报告；业务POST仍必须完成，页面异常与5xx全部保留。FORMWARD_DESKTOP_FOCUS=flows仅用于三组关联诊断，不能代替完整验收。

FORMWARD_FORM_DENSITY_ONLY=1 pnpm test:records-browser运行form-density.browser.mjs：两主题九种尺寸验证营养四项实际同排、长数字退让且字号不变、品牌与规格输入基线、身体来源间距、估算前后来源位置与同行操作；另外检查200%文字、触屏时段和更多设置。此项不以无溢出代替密度验收。

## 录入任务与公共表单

production build后设置FORMWARD_ENTRY_INTERACTIONS=1运行pnpm test:records-browser。entry-interactions.browser.mjs检查空白／删回空白退出、原位估算仍为估计且保留来源、双时段保存、内部返回与导航保护、无名营养／超额照片、AI包装只改名、直接添加活动、顶部失败重试、历史同日重开、导出错误与真实文件、教程8秒脚本超时。FORMWARD_EDITOR_BROWSER可选chromium／webkit，FORMWARD_MEAL_ENTRY_ARTIFACTS指定私有截图位置。

使用独立虚构账号和FORMWARD_BROWSER_DATABASE_URL提供的127.0.0.1/formward_browser_*隔离原生PostgreSQL，入口拒绝其他数据库。两主题覆盖320／390／430px、390×560／844×390及1100／1366／1440／1920px，另查200%文字。来源习惯、提醒条件和有效草稿纯函数由对应test.ts覆盖；不能以截图数量替代人工视觉检查。真实iPhone、系统软键盘、系统原生全屏未测。

## 正文与工具居中

production build后设置FORMWARD_CENTERING_ONLY=1运行pnpm test:energy-browser。layout-centering.browser.mjs检查四页正文中心相对页面可用中线、工具按钮中心相对视口中线，误差均不超过1px；覆盖1100／1440／1920px桌面及不同高度、320／390／430px手机、滚动、窗口切换、工具展开／Escape与减少动态效果。AI／导出页的手机工具保持右下角，不受电脑位移影响。FORMWARD_CENTERING_ARTIFACTS指定私有截图位置，FORMWARD_OVERVIEW_BROWSER=webkit复用另一引擎；FORMWARD_CENTERING_CAPTURE_ONLY仅用于留存修复前对照，不计为通过。

## 工具侧栏与活动累计保护

production build后，FORMWARD_ENERGY_TOOLS_ONLY=1 pnpm test:energy-browser使用隔离PGlite与虚构账号，检查五种宽度四页的电脑左侧导航、手机贴底图标文字导航与独立工具入口、真实跳转与高亮、滚动固定和触屏横屏；侧栏开关不移动正文、菜单互斥、键盘焦点与真实导航；活动合计的菜单和清空失焦共用确认，覆盖取消、Escape、恢复手填、0、未知、旧未计入、待删除、保存失败及AI只修改草稿。FORMWARD_ENERGY_TOOLS_ARTIFACTS指定截图目录，FORMWARD_OVERVIEW_BROWSER=webkit复用另一引擎；测量总览与消耗悬停各状态时的读数、区间、图表位置，清洁区间不保留提示空行。

## 四页布局与消耗填写验收

production build后设置FORMWARD_FRAME_ONLY=1运行pnpm test:energy-browser。unified-frame.browser.mjs用同一虚构账号、同日7D并排验证七种视口日期／主要读数共同区域≤2px、读数不裁切、自动累计/手填/明确0/清空、备注保留四位旧数、单运动完整预览、应用内确认与AI整数及身体两位数。FORMWARD_FRAME_ARTIFACTS指定私有输出目录，FORMWARD_OVERVIEW_BROWSER=webkit可复用；真实iOS和软键盘单独记未测。FORMWARD_FRAME_KEYBOARD_ONLY=1另验逐键输入整数、小数明确报错、旧值失焦不回写；连续整页跳转前后等待networkidle，保留全部pageerror检查。

## 目的

本目录保存跨功能、数据库和浏览器端到端测试。单个 feature 的单元测试优先与源文件放在一起。

## 账号管理验收

新密码边界覆盖5字符拒绝、6／11／128字符通过、129及非字符串拒绝；邀请激活、重设、本人改密、owner本地恢复分别实写六位密码并登录，非法长度不消费链接或撤销原会话。账号浏览器流程输入五位检查原生表单拒绝，再用六位完成激活、重设、修改及重新登录。production build后可用FORMWARD_PASSWORD_ONLY=1 pnpm test:account-browser只执行账号与密码相关流程；两引擎与截图路径仍用FORMWARD_ACCOUNT_BROWSER／FORMWARD_ACCOUNT_ARTIFACTS。

`pnpm test` 包含 account-management.test.ts，覆盖普通用户与过期／跨会话拒绝、邀请摘要／重复／并发／过期／撤销、激活审计失败回滚、改密与停用联动、旧版本会话、原生接口旁路和 owner 维护。OAuth 集成覆盖后台停用与真实刷新竞争、旧 JWT／刷新／审核失效及恢复后重新连接。身体迁移测试在核对旧结构后升级到当前认证结构再调用当前业务函数。

`pnpm test:account-browser` 自行建立隔离 PGlite 和独立 production 服务，验证真实 Server Action 越权、后台解锁、邀请／激活／重设、个人改密、过期保留筛选与草稿、停用恢复和审计。五种宽度、矮屏与横屏截图包含长邮箱、弹窗、设置底部、原四页及菜单；`FORMWARD_ACCOUNT_BROWSER=webkit` 切换引擎，`FORMWARD_ACCOUNT_ARTIFACTS` 指定私有证据目录。需要先构建，不能与修改同一 `.next` 的构建同时运行。

浏览器和真实 PostgreSQL 并发工具放在仓库外，无新增运行依赖：

```bash
npm install --prefix /tmp/formward-account-tooling --no-audit --no-fund playwright embedded-postgres@18.4.0-beta.17
PLAYWRIGHT_BROWSERS_PATH=/tmp/formward-account-tooling/browsers node /tmp/formward-account-tooling/node_modules/playwright/cli.js install chromium webkit
PLAYWRIGHT_BROWSERS_PATH=/tmp/formward-account-tooling/browsers pnpm test:account-browser
pnpm test:account-concurrency
```

可通过 PLAYWRIGHT_MODULE 与 FORMWARD_EMBEDDED_POSTGRES_MODULE 指定已安装模块的绝对入口。`accounts.concurrent.mts` 只在临时目录建立回环 PostgreSQL，用多连接和真实行锁验证邀请单次消费、旧密码已验证但会话延迟插入、在途保存与撤销顺序。它不读取 .env.local，也不接受生产连接。单连接 PGlite 不替代该并发验收。真实 iOS／系统软键盘仍须记为未测。

## 来源历史触屏回填

production build后设置FORMWARD_SOURCE_INPUT_ONLY=1运行pnpm test:records-browser，FORMWARD_SOURCE_INPUT_ARTIFACTS指定私有截图目录，FORMWARD_EDITOR_BROWSER=webkit切换引擎。source-input.browser.mjs在AI统一确认后等待收据真实返回总览，再进入下一页面，避免脚本与2秒定时导航竞争；不以过滤页面异常代替完整流程。该脚本在隔离账号验证身体、消耗和AI确认中的真实候选点选、重复选择、原生失焦先于点击、Tab／Escape／外部关闭、中文输入法确认与实际保存后数据库来源；同时验证建议移除失败保留输入、成功移除不改旧记录。手机使用isMobile与hasTouch上下文，覆盖320／390／430及横屏，并改变可视高度；Chromium使用原生触摸拖动列表，WebKit另检查程序滚动后点选，后者不冒充真实手势。物理iPhone和系统键盘须另记未测。

## 当前验证入口

- `pnpm test` 使用 Node.js 24 内置测试运行器，执行动画与轨道、认证、身体测量测试。测量另覆盖晨间基准四种情况、稳健中位差、28 天窗口／至少 3 日／最多 7 个晨间样本／7 天延续、样本不足、正常模式排除估计与未来实测、历史稳定、真实替代估计、按指标独立补缺、准确时间确认、重建与数据库指标存在约束、来源与写入入口独立、占位时间不生成 UTC、补全预览／幂等及整批回滚；初始化另覆盖全范围真实配对、两侧插值、受限边界外推、真实来源快照与逐项报告、一次性与并发幂等、冻结空缺、补录仅替代对应指标、普通重建／恢复保护、来源隔离与审计失败回滚；也覆盖当地 06:00／18:00 边界、跨月跨年、时区与夏令时、白天空腹确认、晚间非空腹规则、缺项、多次测量、维护预览绑定、幂等修正／软删除／恢复、事务回滚、重复与并发重试、重新排序导入及跨账号访问。时间线覆盖 500ms 正倒放、中途反向、方向阈值、惯性、两端各 40ms 的视频 / 静态混合、60 帧索引、异步寻帧合并及清理、reduced motion；475 / 500 / 525ms 以模拟 60Hz、120Hz 时钟验证线性游标。
- `figure-motion.test.mjs` 验证原有鼠标位移、倾转、跟随、回中、暂停恢复和焦点锁定。模拟时钟不代表实机高刷新率验收。
- `home-experience.browser.mjs` 对 production 首页检查提示、视差、焦点锁定、键盘、手机触控、能力降级、四种视口的静态端点校准与裁切、视频透明合成与首中末帧暗光晕去除／人物实体保留、实际解码的正倒放帧及中途反向、首尾和最终交叠、reduced motion、三张静态图及视频的冷启动、图片失败提示与视频失败后的静态登录。输入为虚构账号，默认访问 `http://127.0.0.1:3000`，可用 `FORMWARD_BASE_URL` 指定。
- 旧版 `pnpm test:measurements-browser`／measurements.browser.mjs保留五列表格等历史断言，未作为本轮通过门槛；当前录入交互使用上方FORMWARD_ENTRY_INTERACTIONS入口并记录实际两引擎结果。旧脚本原检查范围：使用虚构数据库、独立端口与 Chromium 验证正文居中、六项摘要同时可见、当前值等宽同字号、双图共用筛选与独立纵轴、估计虚线／菱形、按指标实测优先、真实配对差值、来源和时间精度、候选选择及完整历史返回。五列表格逐行检查列边界、统一行高、操作位置；各日期常驻查看与状态操作，没有独立今日入口、跳过按钮、晨间条件选择器或自动弹窗。覆盖今天与最近10日待补录／待选择日期、漏记昨日、连续空日、闰年与跨月、无测量账号、部分保存／仅体脂、实测与估计共存、每批 50 日期历史加载与补录、旧非空腹／未知晨间只读、草稿禁用估算、保存与会话失效保留草稿。Inspector 逐帧验证 320ms 滑入、240ms 退出、遮罩渐变、退出前保持滚动锁定、完成后恢复焦点及原内边距；页头、摘要、双图及表格不横移。保留键盘循环、Escape／遮罩／按钮／录入返回关闭、Strict Mode 重放、减少动态效果及触控。覆盖 1440×1000、1100×1000、390×844、320×740、844×390，双图常驻允许自然变长；收集客户端异常并检查无横向溢出，截图仅保存虚构数据。
- `pnpm test:measurements-http` 在 production build 后使用独立内存数据库、虚构测量与内部账号验证实际 `/dashboard/measurements`：未登录重定向、已登录的摘要／空腹主趋势／最近记录及归属和来源展示数据、跨午夜归属、多次候选、跨账号参数无效及无记录空状态。此入口不需要浏览器，不读取真实 `.env.local` 数据库；不将 HTTP 渲染验收当作浏览器交互或视觉验收。

手机／触屏横屏进入登录不创建 video 或 Canvas；首屏轻触直接到尾帧，背景和滑动不返回，顶部返回保留输入，默认 7D 与手动 30D／跨视口保持均有回归。

校准读取 `docs/frame-calibration.md` 的 JSON 标记，检查实际 CSS 变换后的原始首尾。视频验收直接记录已绘制的帧号，确认正倒放沿正确方向显示多个实际帧；不只检查 DOM 进度，也不将浏览器丢帧误称为完整 60fps。透明合成读取 Canvas Alpha，要求四角全透明且人物仍可见。首尾停留检查原图、原有鼠标幅度与焦点锁定，第 12 → 13 张继续独立验收。

四种视口在字体就绪后检查 Discipline / NUTRITION、Drive / BUILD YOURSELF、Effortless / AI LOGGING 的排版及登录终点：本地 Newsreader 已加载、主词与 Logo 分属两套字体、三个主词单行同级、IBM Plex Mono 副标签、文字朝向读者、节点与引线连接。检查文字顶部距节点水平线 12px、引线距文字边缘 12px、左右镜像对齐；停留画面避开人物、SCROLL 和表单，无裁切。真实转身采样检查轨道角度始终等于人物进度乘 150°，连续经过多个节点位置；登录与认证停留终点，成功后随最终人物动画淡出。手机维持底部三列，键盘入口位于词组上方；reduced motion 交叠两套静态构图，不进行空间旋转，辅助技术只读取一份文案。另检查登录终点跨视口重排和动态 reduced motion，加载及失败时隐藏背景。登录字段覆盖默认透明底线、局部 hover 增强、键盘 Tab 焦点框、尺寸稳定、倒放后保留输入，以及触屏点击标签显现和 reduced motion 即时变化。轨迹使用 SVG、CSS 与现有 rAF，不增加外部字体请求或动画依赖。

截图像素检查在桌面、reduced motion、最大视差及视频尾端覆盖视频 / 静态与 12 → 13 的交叠；手机另检查静态正常合成、纯石墨背景与实际登录完成时序。两端完整截图按 25%、50%、75% 加权，比较实际人物区域，平均 RGB 误差上限为 2/255；临时恢复 `normal` 作为变暗反例。视频尾端单独检查，避免将首帧解码画面误作最后一帧。截图使用浏览器 Canvas 解码，无新增项目依赖。

Playwright 可临时安装到 `/tmp`，不修改项目依赖。先完成 production build，再运行自带独立数据库和测试服务的入口：

```bash
npm install --prefix /tmp/formward-browser-check --no-audit --no-fund playwright
PLAYWRIGHT_BROWSERS_PATH=/tmp/formward-browser-check/browsers node /tmp/formward-browser-check/node_modules/playwright/cli.js install chromium
pnpm build
FORMWARD_VISUAL_CHECK=1 PLAYWRIGHT_MODULE=/tmp/formward-browser-check/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/formward-browser-check/browsers pnpm test:browser
```

运行环境需提供 Chromium 所需的系统库。`FORMWARD_BROWSER_ARTIFACTS` 可指定已存在的截图目录，包含桌面、手机的登录态及人物合成对照截图；截图包含虚构测试输入，不放入 `public/`。视觉布局另需人工复核桌面、手机、窄屏和横屏的肩背展示、人物裁切、表单边缘与文字可读性。


身体记录浏览器检查复用上述临时 Playwright。先构建，然后运行：

```bash
PLAYWRIGHT_MODULE=/tmp/formward-browser-check/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/formward-browser-check/browsers pnpm test:measurements-browser
```

开发模式额外检查 Strict Mode 的 effect 重放，包括“查看全部”首次打开及连续重开后保持可见、记录 Inspector 与历史导航关闭。该入口在临时源码副本、独立端口与虚构数据库运行，不读取真实 `.env.local`，不占用或重启已有 3000 服务；退出时清理测试服务与临时副本，无须先构建：

```bash
FORMWARD_MEASUREMENTS_DEV=1 PLAYWRIGHT_MODULE=/tmp/formward-browser-check/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/formward-browser-check/browsers pnpm test:measurements-browser
```

默认截图在 `/tmp/formward-measurements-visual/`，可用 `FORMWARD_MEASUREMENTS_ARTIFACTS` 指定私有目录。本轮系统缺少 libnspr4、libnss3 和中文字体，临时下载 Ubuntu 的 `libnspr4`、`libnss3`、`fonts-noto-cjk` 包并解压到 `/tmp/formward-browser-check/system/root`；运行时另设 `LD_LIBRARY_PATH=/tmp/formward-browser-check/system/root/usr/lib/x86_64-linux-gnu`、`FONTCONFIG_FILE=/tmp/formward-browser-check/system/fonts.conf`。字体配置引用系统字体及解压后的 Noto CJK，并将缓存置于临时目录。这些工具不属于应用运行依赖。

晚间开关的布局回归在桌面、手机和横屏连续开关，使用 `MutationObserver` 及后续渲染帧检查 SVG 实例、坐标宽度、左边界和晨间点横坐标，覆盖切换中间状态。另检查窗口缩放后宽度随容器更新；不锁定晚间数据改变后可合理变化的纵轴范围。

身体记录浏览器启动保留原生滚动条，移除 Chromium headless 默认的 `--hide-scrollbars` 参数。Inspector 布局回归在 1440×700、1100×700 视口确认存在占位滚动条，连续从实测点、估计点、日期及完整历史打开／关闭详情，逐帧检查页头、摘要、图表、表格的横向位置与宽度、SVG 实例及点坐标；另覆盖已有非零页面内边距的恢复。手机与横屏检查图表不横移、不因滚动锁定增加留白。

`estimate-explanation.test.ts` 验证用户说明从已保存依据读取、不修改快照、配对日数与参考列表行数独立、负差值和舍入、插值日期比例、趋势备用与边界推算、体脂百分点、旧版与缺失依据兼容；完整算式继续供内部报告使用。

需要只验收新增录入流程时可设置 `FORMWARD_MEASUREMENTS_ENTRY_ONLY=1`；完整回归应保持该变量未设置。

`calendar.test.ts` 覆盖最早账号／记录／已保存日期边界、无测量账号、闰年跨月、最近 10 日和完整历史每批 50 日。`editing.test.ts` 覆盖四项的 15 种非空组合、仅体脂统计与后续补体重、晨间非空腹／未知／遗漏条件拒绝及事务回滚、旧条件只读和晚间独立编辑、先估晚间后补晨间保持估计、先保存晨间再估晚间的锚点、单项估算／合并／实测替代、冻结保护、既有日期／提醒兼容、当地跨日、重复／并发请求、请求内容绑定、伪造归属、版本冲突、审计失败回滚、样本不足保持空白及待选候选。`measurements.browser.mjs` 使用独立虚构账号和与服务器一致的当地日期，验证查看与录入／补录／编辑、四格输入及相邻估算按钮、草稿禁用估算、部分保存、无自动弹窗、晨间固定空腹／旧条件只读、保存按钮 4px 下划线与触控尺寸、50 日历史加载与空行仅体脂补录、历史编辑保留记录信息、晨晚独立整数 GMT 时区选择／新记录默认系统时区／仅改 API 记录时区／清空／采用系统时区／原 IANA 回显与仅时区草稿刷新保护、390／320px 闰年空行对齐及无溢出、会话失效保留草稿和估计替代后返回实测 Inspector。老回看场景固定浏览器日期，日历录入场景与服务器当地日期一致。

## 认证与浏览器隔离

`home-media.test.mjs` 验证 readyState=2 的当前帧可用、metadata 等待、4 秒超时、静音唤醒／首帧后暂停、自动播放拒绝与触摸重试、超时后重新初始化，以及错误／取消清理。`home-loading.browser.mjs` 随认证入口运行，覆盖当前帧但无 canplaythrough、必须调用 play 才解码、手势播放限制且超时后恢复、请求挂起、下载失败、WebGL 不可用与桌面静态概念词。手机另覆盖正常／减少动态效果／触屏横屏的纯静态点击入口，不下载视频。使用桌面原生视频检查中间帧与暂停，均可进入登录、提交并在失败后继续编辑。认证请求被拦截，不向真实账号发送测试密码。可设置 FORMWARD_HOME_BROWSER=webkit 使用临时安装的 WebKit 执行该加载回归；模拟浏览器不代替真实 iPhone／微信验收。

`src/features/auth/auth.test.ts` 使用独立的内存 PostgreSQL，执行同一 Drizzle migration，覆盖正确登录、错误密码、未知账号、无效输入、关闭注册、重复及并发创建、跨账号身份、过期与撤销、重复退出、CSRF 来源、HTTPS cookie 和限流。数据库限流另验证多个认证实例共享计数、重建实例保持计数、不同来源独立、窗口过期恢复，以及跨实例并发仅五次进入登录校验。

`src/features/auth/site-url.test.ts` 验证公网确认链接和 OpenAPI 使用配置的 HTTPS 根地址、忽略伪造 Host 与代理内部地址、本机回环地址兼容和错误配置拒绝；同时验证 FORMWARD_TIMEZONE 云端默认偏移、客户端请求头优先及无效时区拒绝。公网发布前的构建与生产认证／身体记录／AI／加载浏览器回归在临时源码副本运行，保持已有 3000 服务和真实数据库隔离，发布步骤见 [部署说明](../docs/deployment.md)。

`auth.browser.mts` 自行建立内存 PostgreSQL socket 服务、虚构账号和独立端口的 Next.js production 服务，覆盖受保护主页、失败重试、认证期间防重复、实际动画结束早于导航、刷新会话、跨账号退出与手机 reduced motion。测试不读取或写入 `.env.local` 的真实数据库。默认运行认证、媒体降级、手机静态点击／顶部返回／输入保持与 OAuth 浏览器检查；`FORMWARD_VISUAL_CHECK=1` 再执行 `home-experience.browser.mjs` 的完整手势、校准与像素回归。不要对真实 Neon 数据库运行需要虚构账号的视觉脚本。

浏览器环境缺少系统库时，需要补齐 Chromium 依赖；截图中的中文需要 CJK 字体。可在临时目录下载并解压系统库，通过 LD_LIBRARY_PATH 提供给浏览器，不必修改项目运行依赖。

## 首版重点

- 账号之间不能访问彼此数据。
- AI Token 可以撤销，重复请求不会创建重复记录。
- 汇总只统计有效饮食和已完成运动。
- 实测原始缺项为空；估计按指标独立标记，不参与实测摘要。正常写入不自动估算，补录仅替代对应实测指标；初始化冻结范围同样仅替代对应实测指标，连同日其他估计也保持，更晚实测不反向改写历史。
- Excel 导入拦截异常体脂、计划运动和重复来源行。
- 导入事务失败时不留下部分数据。

## 维护约定

`page-loading.browser.mjs` 随身体浏览器入口使用独立账号运行，拦截并延迟实际 Server Action、页面和认证请求，覆盖 200ms 延迟、重复提交、保存／估算／审核／令牌／登录／导航、失败保留输入、编辑弹窗上方的原生模态层、共享滚动锁、320px 和减少动态效果。慢请求通过真实网络失败验证输入保留与模态层恢复；来源留空本身允许保存。快速失败检查不会闪现遮罩。`FORMWARD_LOADING_ONLY=1` 只运行 HTTP 与加载验收；开发模式继续使用临时源码和独立端口，不占用 3000，生产模式在构建后运行。截图可用 FORMWARD_MEASUREMENTS_ARTIFACTS 指定私有临时目录。

开发验收先编译所需入口，并在多页面草稿检查前重新建立当前编译版本的连接。Next.js 16.3.7 的开发 WebSocket 在重新同步时若编译 hash 不同会主动整页重载，不能把冷编译触发的重载当作业务状态更新。生产验收不预热或重新载入审核页，完整验证从站内 Link 进入、修改与保存的流程。

功能对应的源码与检查命令概览见 [架构与代码索引](../docs/code-study.md)。浏览器环境准备和完整验收范围以本文为准，源码中的注释供需要查看测试实现时参考。

测试使用虚构或脱敏数据。只有出现真实测试内容时才创建更细的测试目录。

来源与 schema 验收覆盖 33→31→30 列、设备／应用合并、授权账号未知来源补齐及审计、旧去重键保留、旧／新 TSV 重导、软删除不复活和仅体脂导入。来源测试覆盖必填、晨晚独立、空值与建议排序、自由输入／历史建议、仅改来源、草稿不写库、失败回滚、重复并发与跨账号；浏览器还覆盖空日期查看、首屏常驻概览、来源键盘与触控选择、桌面同排和手机上下双按钮。当前截图目录为 `/tmp/formward-record-date-development/` 与 `/tmp/formward-record-date-production/`。

日期迁移另验证准确跨午夜记录保持原日期、旧列删除、来源时间可恢复实际日期及异常时停止；旧维护指纹用迁移前实现生成的固定虚构样本验收。来源输入验证新建／未知来源为空、点击只打开建议、主动选择后保存、仅来源编辑、查看／刷新一致及并发冲突保留草稿。开发模式在临时副本加入测试专用刷新入口，验证新服务端快照更新干净表单、保留数值及仅来源草稿且不升级其版本；该入口不进入应用源码或生产构建。

AI 验收：`ai-operations.test.ts` 覆盖令牌鉴权／撤销／过期／权限／账号隔离、15 种四项组合、仅体脂／补缺／重复／冲突、历史与来源修改、请求内容绑定、确认快照／令牌复核、取消／过期／并发、估算依据／不足／冻结及审计回滚。批量另验证跨日稳定行 ID、旧双时段逐项核对后统一保存、无效行可纠正、原始请求不可变、人工草稿审计、审核版本 CAS、终态保护、重复目标、统一确认幂等、取消剩余保留已保存、第二行失败整批回滚、混合估算不读取同批草稿，以及历史时区显式修改／准确钟点和 UTC／未知不补钟点、GMT 半小时／一刻钟和夏令时标签。

`ai-access.browser.mjs` 随身体浏览器测试运行，验证令牌一次展示、本地 HTTP 助手、兼容旧预览、整批确认、跨日多行、修改后更新预览、逐项核对草稿、取消无效行、逐项修改与底部整体保存、每次读取系统时区的 HTTP 助手（GMT+7／GMT+5:45）、省略时区自动带入、跨时区重试保留首次预览、GMT 时区选择和显式采用设备时区、多页面版本冲突保留输入、刷新／重试、跨账号与撤销。覆盖 1440／390／320px 查看和编辑无横向溢出，收集客户端异常。只运行 AI 时设置 `FORMWARD_AI_ONLY=1`；开发模式 `FORMWARD_MEASUREMENTS_DEV=1` 使用临时源码副本，生产模式在构建后运行；均为虚构账号／数据库，不写真实健康数据。截图目录可分别设为 /tmp/formward-ai-development 与 /tmp/formward-ai-production。

MCP／OAuth 验收：`src/features/auth/oauth.test.ts` 使用实际 HTTP Provider 和 SDK 的当前／2025 协议，覆盖 discovery、CIMD／DCR 声明、签名授权、明确拒绝、无效回调／native 可变回环端口、S256 PKCE、签名／issuer／audience／期限、轮换刷新／重放、稳定连接、只读、重复请求、跨账号与撤销。未授权不返回工具／健康记录，网页登录 cookie／原 HTTP 令牌不能代替 MCP OAuth。

`tests/oauth.browser.mjs` 随 `pnpm test:browser` 运行，使用虚构客户端及现有独立 fixture，手机登录 → 同意 → SDK MCP 提交 → 网页确认 → 状态查询 → 设置页撤销 → 401。回调网址在浏览器拦截，不实际发送到外部虚构主机；截图仅包含虚构账号。真实 ChatGPT／iPhone／微信验收仍由用户完成。

首页完整像素回归使用软件 ANGLE（--use-angle=swiftshader）。当前临时 Chromium 的默认视频纹理上传在无 GPU 环境会给黑底边缘添加绿色像素，已用原始 video／Canvas 与软件后端对照定位；测试仍严格校验 Alpha、人物实体与交叠误差，不修改产品合成或素材。

来源管理回归覆盖身体录入与 AI 审核的共同输入：来源标签与输入框、已有文字／不匹配草稿时点击展开全部历史、清空与文字筛选、新实测及来源清空直接保存为 null、旧 AI 留空请求重新填写来源、320px 删除按钮完整可见、鼠标／触屏／方向键选择及“×”移除、失败保留建议与草稿、来源补填或直接留空保存，无额外复选框或历史入口。sources.test.ts 覆盖幂等软删除、账号隔离、旧记录编辑不恢复、明确再次使用恢复与留空审计；AI／OAuth 测试验证 needsUserInput、来源确认字段、请求内容绑定与网页确认。migration.test.ts 验证 0012 新列为空且原建议与健康快照保持。

隔离 HTTP 与认证浏览器 fixture 的连接串固定 max=1：PGlite 的多连接 multiplexer 无法可靠保持并发未命名 statement，可能产生 bind 参数数量错误。单连接仅约束模拟数据库，保留真实页面预取、导航和并发审核请求；生产 Neon 默认连接池仍为 3。

饮食单元／PGlite集成在src/features/meals/meals.test.ts，覆盖单位换算、食物加杂、整餐互斥、未知与零、初始化重试、版本与快照、授权撤销、跨账号、删除恢复。oauth.test.ts用真实MCP验证饮食独立权限。pnpm test:meals-browser使用独立PGlite和端口、虚构账号与餐次，覆盖HTTP、审核、食材复用、表格编辑／拖拽、整餐分类、删除恢复／永久删除、历史快照编辑、缺日期和320px；截图在/tmp/formward-meals-visual。先执行production build，浏览器工具按本文件已有环境配置提供。

images.test.ts用虚构图片和可替换存储／清理函数验证类型／尺寸、下载域名与重定向、重复、归属／组合外键、照片待核对、修改删除恢复、授权撤销、食材快照、未知食量及上传后事务失败清理；不调用真实Blob。dashboard/model.test.ts覆盖当天有效摄入、空值与未接入消耗。浏览器饮食入口同时验证两轴总览联动、P／C／F 三色 kcal 柱、历史抽屉、包装照片及320px；身体入口逐帧核对首屏尺寸。生产Blob验收使用独立虚构账号和测试图片，检查受保护上传、字节一致、重复／无效／跨账号和匿名读取后清理测试图片及账号；不向已有健康账号写测试记录。实际GPT连接已验证大图上传、重复和字节一致；用户原照片及真实手机仍需最终核对。

image-upload.test.ts验证20 MiB直传凭据的正常、篡改、过期、跨账号、字节核对、幂等和清理；images.test.ts验证真实零值、20 MiB边界、下载重试及多图部分成功。meals.test.ts验证缺图必须人工明确选择、对应审计及终态不能再次确认。饮食浏览器保留原生滚动条，核对页头在切换食材库时不横移，热量柱固定宽度、可选连线、缺日空白、保存后刷新状态、表格及320px。

原图地址回归覆盖实际ChatGPT Azure账号的直连、OpenAI域名重定向、保留临时签名参数及导入登记；覆盖nznorth／westus实际地区、其他地区变体和跨地区重定向，拒绝其他账号命名族、超长账号、相似后缀、额外子域、非HTTPS、用户信息、异常端口及跳转出允许域名。使用虚构文件和签名，不保存真实下载地址。

饮食清晰度验收覆盖 1440／390／320px 的 7D、30D、90D 固定宽度、日期刻度策略、直接读数与方向键、历史食物默认展开、食材详情和营养值不溢出。说明修正集成覆盖指定原文／版本校验、营养及份量和照片保持、原始请求／旧餐项保留、AI 审计、幂等、跨账号、身份冲突及审计失败整批回滚。

总览与录入回归复用 `pnpm test:meals-browser`：1440／1100／390／320px 的7／30／90D两轴统一图、当天摄入／晨重／晚重／差值、只读详情及带日期跳转；左侧搜索／拖拽、右侧逐行表格、常驻空白行、单位默认值和自由项本次营养，以及拖选到遮罩保留草稿。身体／饮食 Inspector 真实遮罩点击仍关闭。截图在 `/tmp/formward-overview-visual/` 和 `/tmp/formward-overview-meal-editor.png`。

`meals/migration.test.ts` 从 0015 数据验证 0016 兼容旧来源、允许 reference 且拒绝非法枚举；`meals.test.ts` 覆盖小数勺换算、旧克数快照编辑、当前规格维护的数值保留、版本／摘要／跨账号、幂等与审计失败回滚。`dashboard/model.test.ts` 覆盖真实日历、零值／未知、独立指标、估计与重复候选筛选。

食材分析回归覆盖 MCP／HTTP 实时 foodLibraryRules、明确个人背景／泛化提醒在预览前拒绝且可原标识重试、餐次备注仍保留个人语境，以及 updateMealDescriptions:false 不触及任何历史餐项。饮食浏览器在 1440／390／320px 验证来源与估算分析、分项克数完整显示、详情不重复营养四项且不溢出，截图 food-analysis-*.png 位于原私有 /tmp 目录。

总览／录入验收覆盖1440、1100、390、320px与7／30／90D，默认30D及已有估计、统一图晨晚差、模块卡片和Logo返回。最近删除集成验证已删状态／版本／归属／重试／审计回滚、全部旧版本快照与照片保留、缺快照拒绝和跨餐项ID拒绝。0017升级保留旧列及数值，category和originalItemId省略不注入默认值；宏量图按已记录kcal归一，缺项／零分开。


## 统一记录审核验收

`src/features/records/operations.test.ts` 使用隔离 PGlite 覆盖三类全部7种组合、草稿不写事实、独立入库／摄入、批内 foodRef 多餐复用、内嵌新食材展开、前后快照、失效与撤销、跨账号、父子审核版本、原请求、幂等与中途失败整批回滚。`oauth.test.ts` 通过真实 MCP／OAuth 验证混合工具和单类旧授权拒绝跨域写入。

`pnpm test:records-browser` 自建虚构账号、PGlite、独立端口和 production 服务，不读取真实数据库。先运行 `pnpm build`，按本文既有 Playwright／系统库环境执行。服务端固定TZ=UTC，浏览器使用Asia/Shanghai，收集页面错误以检查跨时区初始渲染一致性。覆盖1440／1100／390／320px、底部按钮可见、草稿编辑、跨页冲突保留输入、取消食材仍保存摄入、缺图逐项明确选择、图片前后对照、成功勾和自动返回、两个PFC口径及7／30／90D共同零点。截图保存在 `/tmp/formward-records-visual/`，不进入 public 或 Git。AI、饮食及 OAuth 浏览器入口也使用统一确认语义。

## 消耗与总览

`pnpm test:energy-browser`在production build后建立独立PGlite、端口和虚构账号，不读真实数据库。覆盖分开记录／只记总数、活动合计／运动累计、隐藏旧值不叠加、同日批量保存、来源分开、未知／零、删除恢复、公式仅对照、历史资料确认、混合AI审核，以及双层关联图、交叉填色、缺测遮罩、正负盈余、相邻晨重、键盘、1440／1100／390／320px和减少动态效果。截图为/tmp/formward-energy-visual/，Playwright环境同上。

`pnpm test`覆盖模式兼容、部分摄入／估算仍计算盈余、退役默认值和旧预览保护、跨账号／版本／重复／撤销／回滚、未知和零、公式体重回退，以及0021前后36张旧表原字段和值保持。消耗、统一审核及饮食浏览器的总览选择器按data-overview-panel区分能量和kg两个绘图区，data-overview-date为贯穿两层的日期列；验证交点分色、选日不弹窗、Enter查看记录、拖动选择与独立刻度。

## 手机事实优先验收

`mobile-check.browser.mjs`随`pnpm test:energy-browser`使用隔离PGlite账号运行。验证最近10天完全空日、仅有活动、明确日期的直接补录、过去日期查询、中文餐次与服务端合计（全未知不标部分、明确0与部分已知分别展示），320／390／430px、1100／1440px、矮视口和触屏横屏，消耗三项同排且首屏可见至少80%图形、审核无主导航、单一保存栏、前两项食物与总量可见，菜单、导航高亮与无溢出。模拟时钟跨零点、缩小视口模拟键盘，确认草稿日期和输入保持；模拟不等于真实iOS键盘验收。截图等待业务内容及图形可见，分别保存全页与视口，位于`/tmp/formward-mobile-visual/`。

能量浏览器虚构数据包含尖峰、低谷、稳定静息、未知和连续缺日；不只使用平滑样本。`record-dates.test.ts`覆盖闰年／跨年、0与未知、默认有效日期与区间扩展，`chart-geometry.test.ts`覆盖局部范围、整齐刻度及kg零点。当前单元／集成共305项。

`latest-records-check.browser.mjs`由消耗浏览器入口运行，FORMWARD_LATEST_RECORDS_ONLY=1可只运行此专项，覆盖各自最近日期／跨零点摘要、320／390／430／1100／1440px三行或卡片展示、消耗来源键盘选择／持久移除／草稿保留及AI编辑只更新预览。截图在被忽略的.codex/latest-record-visual，仅使用隔离虚构账号。

OAuth测试覆盖部分授权到完整读写的一次网页同意、只读查询不请求提交、拒绝前不改权限、旧令牌保持原scope及连接检查不改健康／预览；浏览器验证六项记录权限同时展示和320／390／1440px统一权限列表。

统一审核维护专项可在production build后运行 FORMWARD_REVIEW_MAINTENANCE_ONLY=1 pnpm test:records-browser，沿用隔离PGlite与临时Playwright环境。覆盖重复餐次对照／明确另一次进食／取消不删除原餐、日常饮食和消耗与身体审核的草稿关闭保护、回执业务日期链接、停留查看和默认2秒返回；1440／390／320px截图在 /tmp/formward-records-maintenance/。records/operations.test.ts 另验证对照与摘要账号隔离、过期及取消项目；review-summary.test.ts 验证业务日期与回执映射，不跨日相加。

维护专项使用FORMWARD_MAINTENANCE_ONLY=1 pnpm test:energy-browser，验证五种宽度、矮屏、总览固定日期／折叠详情／图片延后加载、最近摄入、历史分页、每份营养及包装、运动包含关系、一次审核与减少动态效果；输入均为虚构数据。FORMWARD_REVIEW_MAINTENANCE_ONLY=1 pnpm test:records-browser覆盖重复餐对照、取消与恢复草稿、未保存输入保护和日期回执。原图表点击只选日，需显式“查看记录”打开详情，旧测试步骤须遵循同一交互。


总览视觉验收统一读取[设计文档](../docs/design-reference.md)。`overview-first-screen.browser.mjs`检查未滚动的320×560、390×560、390×640、430×780手机视口，模拟34px底部安全区，断言核心读数和主要图形在首屏，矮屏自然滚动后能看到完整双图及日期刻度；另查横屏、1100／1440px、刻度碰撞、选日稳定、固定／图外解除、自定义应用／取消及减少动态效果。截图为实际视口，需逐张复核。隔离入口为 `FORMWARD_OVERVIEW_ONLY=1 pnpm test:energy-browser`；`FORMWARD_MAINTENANCE_ONLY=1`同时回归既有维护流程；正常消耗全量入口也包含首屏检查。`FORMWARD_OVERVIEW_BROWSER=webkit`可切换临时安装的WebKit，不增加应用依赖。模拟测试不替代真实iPhone及软键盘复核。

FORMWARD_UNIFIED_UI_ONLY=1 pnpm test:energy-browser使用PGlite和虚构账号验收四页共用交互、当天／前6天待处理列表、单按钮记全、Inspector与各手机首屏；FORMWARD_OVERVIEW_BROWSER=webkit切换WebKit。截图和几何报告位于.codex/unified-ui-visual/，实际视口包含34px模拟安全区。浏览器模块和依赖可从本机私有工具目录通过既有环境变量指定，不加入产品依赖。

## 页面内历史与记全控件验收

当前身体、饮食、消耗的共用列表回归使用FORMWARD_UNIFIED_UI_ONLY=1运行tests/energy.browser.mts，配合FORMWARD_OVERVIEW_BROWSER=webkit分别验收两引擎。FORMWARD_UNIFIED_ARTIFACTS指定私有截图目录。独立虚构数据含65日历史、空日及未完成活动；检查页面展开不打开dialog、每批50日、重复日期排除、查看和编辑才开Inspector、关闭恢复窗口滚动／焦点、折叠后保留批次。鼠标实际点击首中末日检查默认白框，键盘继续显示绘图区焦点；“已记全”文字在失败／勾选／取消时保持，勾选后变淡。旧完整历史抽屉步骤由此共用回归替代。

## 一餐总量编辑器

FORMWARD_MEAL_ENTRY_ONLY=1 pnpm test:records-browser检查独立的虚构餐次、旧按份项、包装与按克食材，以及AI审核；FORMWARD_EDITOR_BROWSER=webkit切换WebKit。目标视口1440／1100／430／390／320px，检查八列表头、同高顶端对齐、标签与框内留白、手机分组、150g填240仍为240、只改数量不重乘、旧项无改动保存不丢精度、取消不写、审核更新不正式保存及库项自动换算。截图在私有.codex/meal-total-visual/。meal-editor-state.test.ts覆盖旧项原口径保留、修改后总量、元数据清除及库引用隔离。

## 身体覆盖、运动分项与跨窗口检查

FORMWARD_BODY_ENERGY_ONLY=1 pnpm test:energy-browser运行隔离PGlite和虚构账号，验证运动400＋期间静息50计入400、仅总数450原样计入、身体覆盖与单指标删除、双窗口修改提醒／保留输入／明确覆盖、中文餐次、自定义取消和慢图登录；五种宽度截图在.codex/body-energy-visual。FORMWARD_BODY_ENERGY_ARTIFACTS可指定私有目录。单元／集成新增计入规则、删除幂等／未来日期、跨账号版本摘要与数量级提醒，不读真实数据库。真实iOS系统软键盘仍待实机。

共用餐次编辑器视觉专项默认纳入pnpm test:records-browser，另用FORMWARD_MEAL_ENTRY_ONLY=1快速定位；FORMWARD_EDITOR_BROWSER=webkit切换WebKit。标准只在[设计文档](../docs/design-reference.md)D3／D4／D6维护。报告逐项区分通过、失败、未测和不适用，记录实际字形空间、完整数字列对齐、行高及详情几何；截图包含每条手机记录与实际打开的浮层。常规审核结束并关闭服务后，再启动独立临时数据库和虚构账号执行编辑器门槛，避免样本和连接互相影响。

数据优先视觉验收沿用FORMWARD_FRAME_ONLY=1，截图位于.codex/data-first-visual/{chromium,webkit}。另验运动本次851、已包含总数3415／额外增加4156、固定总数与运动中段／底部、16px操作间隔、44px点击范围、非法小数与旧四位数只改备注。参考图与本地技术通过均不代表用户已验收；实际截图与操作须先交用户确认，确认前不得发布。

FORMWARD_FRAME_STRESS_ONLY=1配合FORMWARD_FRAME_ONLY=1运行长整数专项；使用正式业务函数生成独立虚构日，320／390／1440px验证百万级读数整项换行以及实际坐标文字完整边界，Chromium和WebKit分别运行。FORMWARD_FRAME_FLOW_ONLY=1只用于交互定位，不冒充完整七组视口验收。失败时保存独立client-failure.json和server-failure.log，保持pageerror零容忍，不过滤React错误。


FORMWARD_FRAME_TOUCH_ONLY=1配合FORMWARD_FRAME_ONLY=1检查四页390×640及844×390的hasTouch/isMobile浏览器上下文，截图和touch-report.json独立保存；Chromium/WebKit均运行，不等同真实iOS或系统软键盘实测。

## AI消耗确认的事实与视觉

生产构建后，FORMWARD_ENERGY_REVIEW_ONLY=1 pnpm test:records-browser使用隔离PGlite与虚构账号，按日期检查日消耗3085、运动946=801+145、已包含不增加、额外只加801到3886、纯运动累计2859、未知与0、多日、同值不同精度、真正热量修改、分组取消/Escape/恢复、并行草稿冲突、只改草稿和最终重复保存保护。FORMWARD_EDITOR_BROWSER=webkit切换引擎，FORMWARD_ENERGY_REVIEW_ARTIFACTS指定私有截图目录。

截图覆盖320／390／430px手机、矮屏、触屏横屏及1100／1440px桌面；检查主次字号、数字单位完整、长备注折行、底栏遮挡和单项选择。另运行共用餐次填写及原身体／饮食AI确认回归。真实iOS及系统软键盘需实机，模拟不计作通过。energy-review-model.test.ts覆盖十进制语义比较，operations.test.ts覆盖服务端整日投影、核对保留原分项／精度及旧草稿刷新保护。

FORMWARD_REVIEW_FACTS_ONLY=1 pnpm test:records-browser只验混合身体／饮食／消耗确认与保存、取消恢复和并行窗口冲突，再自动执行完整共用餐次填写专项；不运行该脚本中未改动的旧图表流程。FORMWARD_REVIEW_ARTIFACTS与FORMWARD_MEAL_ENTRY_ARTIFACTS分别保存证据，两引擎分目录运行。消耗专项截图在aria-busy结束、字体与布局稳定后保存，矮屏另检查滚到底部运动操作不被保存栏遮挡；WebKit全页跳转前等待预加载结束，不过滤页面异常。

首次使用专项：pnpm test:onboarding-browser。使用独立内存PGlite、虚构新旧账号和owner，覆盖资料云端保存／冲突／失败／清空、跨设备进度、只读演练、五项选择与十段播放、缩放与横屏。TUTORIAL_BROWSER=webkit切换引擎，TUTORIAL_ARTIFACTS指定私有截图目录。


## 总览补充、双色主题与应用版本

生产构建后，pnpm test:visual用隔离PGlite及虚构账号检查七天后台读数、手机折叠、八组视口四页两套主题、AI确认、教程播放、清空活动确认及有草稿时刷新。VISUAL_BROWSER=webkit切换引擎，VISUAL_ARTIFACTS指定私有截图位置。所有截图要再逐张查看，自动无溢出不代替视觉验收。

pnpm test:app-version需要VERSION_APP_A指向预先保留的另一份生产构建（只复制.next但跳过cache、public、package.json、next.config.ts，并链接node_modules；不得复制.env或健康数据库）。脚本使用本机PostgreSQL 18（FORMWARD_PG_BIN可指定bin目录），启动独立临时数据库并在结束后停止清理；用两个真实构建、同一回环代理地址和虚构账号验证升级检测、取消保留输入、明确确认后重载新版本、登录与地址保持。VERSION_ARTIFACTS指定私有证据，不接触公网。

视频生产原片、帧时间表和实际点击命中证据放私有制作目录；public只保存虚构教程。物理iPhone、系统键盘及原生系统全屏未实测时列为未测。

ui-consistency.browser.mjs使用隔离内存数据库和虚构账号，对四页两主题、六项读数、紧凑七日、三页描边操作及历史展开、可填边框、固定顶部保存、餐次／每日消耗空白零值和已知部分进行实际检查。VISUAL_BROWSER=chromium或webkit，VISUAL_ARTIFACTS指定私有证据路径。须先production build，检查期间不重建.next；浏览器截图还需逐张人工查看。web-entry.test.ts检查网页后台和公开提交的差异、本人旧值保留、幂等及AI本批食材引用兼容，不读取真实数据库。

餐次编辑专项在频繁整页换页时，PGlite Socket可能不能模拟完整PostgreSQL协议；可用FORMWARD_BROWSER_DATABASE_URL指定独立本机库，仅接受127.0.0.1且库名以formward_browser_开头，禁止用生产连接。WebKit在测试主动整页跳转时取消同源RSC预加载属于该次导航的预期中断，单独记录；实际操作中的异常仍全部失败。

## 总览两排读数

production build后，overview-readings.browser.mjs接受FORMWARD_BROWSER_DATABASE_URL指定的全新回环PostgreSQL，库名必须以formward_browser_开头，拒绝已有用户库且不读.env.local。FORMWARD_OVERVIEW_BROWSER选chromium／webkit，FORMWARD_OVERVIEW_ARTIFACTS指定私有报告。覆盖手机三主项加三次级项、前后晨重、七日直接显示、电脑六项保持、提示行与选日几何、未知／0、七日部分、两主题、原有日期详情／自定义／估计开关及其他三页提示位置；使用虚构账号与本地服务。


餐次专项 checkMealEntry 另验宏量最多一位小数、第二位明确拒绝、旧高精度值未修改不写回，以及实际输入17／4／1→93、手填后下一次宏量编辑重算、自动热量缺项清空、0／未知、非法小数阻止保存、数据库真实总量及AI手改后统一确认。320／390／430与1100／1440深浅主题核对日期框不重叠、四项营养同排、长值自动退让、路径切换保留草稿；另使用isMobile＋hasTouch与减少动态效果留实际截图。原有包装换算、旧精度、数量不重乘与气泡边界回归保持。编辑器私有状态单元测试覆盖旧四位值、库值不回算、超限阻止保存和元数据不进入请求。


餐次专项额外覆盖独立食材库：两主题×320／390／430／844／1100／1440共12种场景，测量每行名称实际宽度是否等于其手机网格分配的四列宽度；保留长中英文食材截图。餐次窗口按是否双栏检查切换按钮／返回本餐是否隐藏；窄屏仍需切换、添加和草稿保留。不能用餐次内食材选择通过代替独立食材库通过。

chart-interactions.browser.mjs由隔离账号入口提供page/context，核对四页完整面板离开边界、鼠标点击不固定、查看目标捕获、晨晚详情、键盘、触屏及100ms真实中间帧／快速反向重定向／同日动画对象保持／尺寸和区间直接定位／减少动态效果；四页同时核对共用4%底纹、1px线、6px／1.5px空心圈及柱图短标记，逐页触屏直接定位与准确查看；Chromium用原生模拟触屏事件回归横拖与纵向滚动不误选，WebKit检查真实触屏上下文点选；只读选择和查看，不保存健康记录。login-stage.browser.mjs在有真实滚动偏移时检查加载中与失败后的舞台位置、宽度，并用虚构账号验证成功动画导航。

## 饮食与消耗详情

production build后运行pnpm test:detail-browser；FORMWARD_DETAIL_BROWSER=webkit切换引擎，FORMWARD_DETAIL_ARTIFACTS指定私有截图。入口自行创建隔离PGlite、普通虚构账号及独立应用端口，不读.env.local。detail-hierarchy-fixture.mjs提供单餐1190、多餐、部分／未知／0、长数值及3415／851／741运动包含样本；也可供已经建立隔离账号的浏览器入口复用，禁止用于既有真实账号。

checkDetailHierarchy逐态核对七种视口和深浅主题：当天合计及结构横线、餐次单层12px间距／44px展开、正常四项营养同排、消耗日期只在标题、三项单位同排、12px摘要及长值退让；checkDetailScale另查320px长值及200%页面缩放后操作可到达。checkDetailActions真实确认已记全、编辑后失效并保持1190、还原名称、空白添加退出、保存不追加催确认，以及键盘展开／Escape；不把结构改动当作改写确认逻辑。保留失败记录；pglite-socket的close回调在排空后才关闭引擎。


详情浏览器入口同时检查单行食物摘要、完整事实按需挂载、运动短状态／完整依据、更多Escape与外部关闭、删除取消、键盘和收起恢复；详情仍按七种尺寸及深浅主题比较，200%页面缩放作为模拟，真机文字放大不冒充已测。

保存结果出现后仍可能有Server Action附带重验证流收尾；脚本先等待POST响应finished，再跟踪同源POST与RSC请求的开始／结束，全部完成且静默500ms后才刻意整页重开，30秒未结束则失败。loadState可能仍是旧文档的idle，不能用它或关闭输入框代替后发请求结束。保留全部客户端异常检查，不过滤WebKit加载错误；原始请求取消、请求时序和修正后重验见维护验收。


## 小助手与区间摘要

`pnpm test:assistant-browser`在build后运行`assistant-suite.browser.mts`：建立独立内存PostgreSQL、虚构账号、最小两日事项及混合实测／估计数据，启动临时production端口，再调用`assistant.browser.mjs`与`assistant-edge.browser.mjs`。不读取`.env.local`，不向正式账号写入；结束关闭浏览器、应用与数据库。Playwright可用`PLAYWRIGHT_MODULE`指定，浏览器用`FORMWARD_ASSISTANT_BROWSER=webkit`切换，证据目录由`FORMWARD_ASSISTANT_ARTIFACTS`指定。

覆盖会话与非法参数、账号隔离、每天一次及手动重开、旧收起偏好、多标签、设备时区、跨日／过期响应、失败与401、实际记全成功后的重判、编辑互斥、AI与Excel真实去向、深浅主题、320／390／430px、矮屏／触屏横屏、1100／1440px、200%等效可用区及减少动态效果。估计专项以真实鼠标反复移至实测／估计点，逐帧比较读数、区间、标题、图形及scrollY，变化不超过1px并核对静止日期。模拟浏览器不代替真实iPhone、系统文字放大与软键盘。

版本提醒与记录变化优先级检查连续触发两次focus。首次focus须等对应`/api/record-changes`响应的`finished()`再安装下一次模拟响应，避免仍在途的旧查询合并第二次触发；`networkidle`不能单独证明这次新请求已结束。正式环境延迟下已复现并定位该测试时序问题，修正后完整Chromium／WebKit重跑通过，保留首轮失败和诊断，不修改应用请求规则或异常断言。

`assistant.test.ts`验证纯事项／偏好、有界读取、不写入及跨账号；`range-coverage.test.ts`验证已有日级收支的区间覆盖与原因，不重算能量或体重。旧总览提醒条退出，旧当日收起键仍由助手读取兼容。

保存餐次阅读专项由saved-meal-details-fixture.mjs提供单食物、多食物／估算／未知／0、热量全未知但蛋白质已知、两张虚构照片和五餐样本，saved-meal-details.browser.mjs同时检查饮食与总览。test:detail-browser的隔离入口一并执行；仅登录一次并复用会话。检查唯一当天环图、逐层挂载／Escape／焦点、完整名称、来源统计退出、原图延迟请求，以及滚动条出现前后合计内容坐标与列数稳定。热量全未知只显示破折号，不能标成已知部分。浏览器为确保触发器可见而主动滚动时，比较抽屉内内容坐标；原始失败与修正后的完整结果分目录保留。

统一审核并发检查先在第二窗口实际建立草稿，再更新第一窗口；子预览快照与父审核revision都可拒绝旧草稿，接受对应的两种明确反馈，同时核对输入保留、revision未再次改变及加载最新状态后可继续。不能只依赖开始导航证明第二窗口拿到旧版本，也不能只按某一句冲突文案判断防覆盖是否有效。

详情主题初始化仅在HTTP／HTTPS文档写本地偏好，初始about:blank不访问localStorage；应用页面的异常仍全部记录。餐次字段几何检查等待两次实际绘制，完整字体简写为空时按实际字形、字重、字号和字体族测量，保持原对齐与完整显示断言。长的非法输入仍须原样保留供修改，不能靠清空或缩字通过。干净发布源码放在仓库外的临时构建目录，避免嵌套构建产物进入当前仓库的lint与typecheck扫描。

## 训练会话

production build后运行pnpm test:training-browser。training.browser.mts自建独立PGlite、两个虚构账号和临时端口，不读.env.local；training-check.browser.mjs覆盖真实开始、动作组次自动保存、未知重量、暂停／刷新恢复、结束回看、模板排期、空训练放弃和原消耗页，另查两主题七种手机／桌面尺寸。FORMWARD_TRAINING_BROWSER=webkit切换引擎，FORMWARD_TRAINING_ARTIFACTS指定私有截图目录；本机浏览器缓存位置通过PLAYWRIGHT_BROWSERS_PATH指定。FORMWARD_TRAINING_PREVIEW=1仅保留独立预览供人工验收。

training.test.ts覆盖输入、归属、幂等与重复结束、版本冲突、会话撤销、未知／0、暂停计时、不改变消耗与0033仅新增四表。模拟截图不代表真实iPhone或系统键盘已测。

训练动作库与加载验收覆盖150项标识／分类／别名、三类记录、目标不冒充实测，以及真实MCP OAuth训练读写、原授权撤销、幂等和跨账号。training-delayed-db.ts只在隔离fixture中延迟真实数据库查询，未向应用增加等待开关；浏览器复用登录会话，不降低正式限流。training-stability.browser.mjs记录冷加载全过程，比较首屏相交的稳定标题、日期、读数、月历和绘图区槽位≤1px；屏外未知列表增长保留原始帧另查，不冒充同高数据。检查宽屏按钮／Escape／遮罩／入场中关闭和减少动态效果，并演示GPT四类动作模板、人工修改、确认排期与实际目标分离。证据均为虚构账号。

training-compact.browser.mjs随训练完整流程运行，复查标题栏点击区、默认折叠与原位展开、删除取消／失败／重试／计划恢复、边缘滚动及重复排期。Chromium通过CDP发送真实触点序列；WebKit验证原生触屏点按、实际指针捕获和连续拖动，当前Playwright没有WebKit连续触点输入接口，报告不将其计为原生连续触摸或真机验收。全过程保留输入类型与isTrusted；不通过伪造capture接口让测试通过。

双入口的 native PostgreSQL、TLS OAuth 与图片竞争测试使用 regional-fixture、regional.concurrent.mts 与 regional-oauth.http.mts；FORMWARD_TEST_RELEASE 指向同一提交的独立产物。FORMWARD_EMBEDDED_POSTGRES_MODULE 显式指定私有测试工具，不读取生产环境文件。真实源备份只作隔离一致性演练，不用于浏览器测试账号。

shared-primary.http.mts 在受信任的测试 CA 下验证原会话 Cookie、原 JWT 与原刷新令牌经过国际网关后保持账号／issuer／resource／连接编号；使用独立虚构 PostgreSQL，不连接正式库。

身体退役浏览器验收覆盖深浅主题、320/390/430、横屏及1100/1440/1920、只读与实测录入、体脂开关和图形往返；复用登录会话避免无意义重复登录。workspace-loading检查可用FORMWARD_LOADING_KINDS按overview/body等类型选择受影响页面，默认仍检查全部主页面。

## 图表样式与返回时序

production build 后以 FORMWARD_LOADING_NATIVE=1、FORMWARD_LOADING_PREVIEW=1 启动 workspace-loading.browser.mts 的隔离预览，再将其 config.json 传给 FORMWARD_LOADING_CONFIG，运行 node tests/chart-return.browser.mjs。FORMWARD_CHART_ENGINE=webkit 切换引擎，FORMWARD_CHART_ARTIFACTS 指定私有录像和报告目录。性能基准串行运行；功能矩阵并行时各用独立fixture，避免慢查询控制互相影响。

覆盖320／390／430与1100／1440／1920、两主题、晨晚／体脂／7D／30D／关联自定义。390和1440的三张卡各20次往返，其余尺寸各3次，另查慢读取、快速反向、修改指标、减少动态效果与浏览器返回。报告分开记录真实动画启动时刻和首个采样呈现帧，验收探针不逐帧强制整页布局。检查准备期原图可见、每方向只启动一次、落地后至少500ms无残层，轴与读数外框切换偏差≤1px。保留失败证据；FORMWARD_CHART_QUICK 与 FORMWARD_CHART_NO_VIDEO 仅用于定位，不作为完整视觉验收。

最终产物可通过 FORMWARD_LOADING_RELEASE 指向本仓库 .codex/regional-releases 下的 standalone，复用相同隔离数据库与验收流程。PLAYWRIGHT_MODULE 可指定独立测试运行库，不改变应用依赖。Linux WebKit r2370 存在上游毛玻璃渲染回归，相关失败须保留；本轮以Playwright 1.65.0／WebKit r2388复核，不把旧引擎卡帧计作通过，依据见[上游问题](https://github.com/microsoft/playwright/issues/43426)。

FORMWARD_CHART_BODY_ONLY=1只核对各尺寸的坐标、读数、点选、实际点径及线宽，不计为往返动效通过；FORMWARD_CHART_WIDTHS以逗号选择诊断尺寸。FORMWARD_CHART_HEADED=1可配合隔离Xvfb核对GTK WebKit，与默认WPE后端分别保留报告。更换采样后端或关闭录制不能将之前的失败样本改写为通过。
