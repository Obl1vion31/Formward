# Tests

## 目的

本目录保存跨功能、数据库和浏览器端到端测试。单个 feature 的单元测试优先与源文件放在一起。

## 当前验证入口

- `pnpm test` 使用 Node.js 24 内置测试运行器，执行动画与轨道、认证、身体测量测试。测量另覆盖晨间基准四种情况、稳健中位差、28 天窗口／至少 3 日／最多 7 个晨间样本／7 天延续、样本不足、正常模式排除估计与未来实测、历史稳定、真实替代估计、按指标独立补缺、准确时间确认、重建与数据库指标存在约束、来源与写入入口独立、占位时间不生成 UTC、补全预览／幂等及整批回滚；初始化另覆盖全范围真实配对、两侧插值、受限边界外推、真实来源快照与逐项报告、一次性与并发幂等、冻结空缺、补录仅替代对应指标、普通重建／恢复保护、来源隔离与审计失败回滚；也覆盖当地 06:00／18:00 边界、跨月跨年、时区与夏令时、白天空腹确认、晚间非空腹规则、缺项、多次测量、维护预览绑定、幂等修正／软删除／恢复、事务回滚、重复与并发重试、重新排序导入及跨账号访问。时间线覆盖 500ms 正倒放、中途反向、方向阈值、惯性、两端各 40ms 的视频 / 静态混合、60 帧索引、异步寻帧合并及清理、reduced motion；475 / 500 / 525ms 以模拟 60Hz、120Hz 时钟验证线性游标。
- `figure-motion.test.mjs` 验证原有鼠标位移、倾转、跟随、回中、暂停恢复和焦点锁定。模拟时钟不代表实机高刷新率验收。
- `home-experience.browser.mjs` 对 production 首页检查提示、视差、焦点锁定、键盘、手机触控、能力降级、四种视口的静态端点校准与裁切、视频透明合成与首中末帧暗光晕去除／人物实体保留、实际解码的正倒放帧及中途反向、首尾和最终交叠、reduced motion、三张静态图及视频的冷启动、图片失败提示与视频失败后的静态登录。输入为虚构账号，默认访问 `http://127.0.0.1:3000`，可用 `FORMWARD_BASE_URL` 指定。
- `pnpm test:measurements-browser` 使用虚构数据库、独立端口与 Chromium 验证正文居中、六项摘要同时可见、当前值等宽同字号、双图共用筛选与独立纵轴、估计虚线／菱形、按指标实测优先、真实配对差值、来源和时间精度、候选选择及完整历史返回。五列表格逐行检查列边界、统一行高、操作位置；各日期常驻查看与状态操作，没有独立今日入口、跳过按钮、晨间条件选择器或自动弹窗。覆盖今天与最近10日待补录／待选择日期、漏记昨日、连续空日、闰年与跨月、无测量账号、部分保存／仅体脂、实测与估计共存、每批 50 日期历史加载与补录、旧非空腹／未知晨间只读、草稿禁用估算、保存按钮下划线及会话失效保留草稿。Inspector 逐帧验证 320ms 滑入、240ms 退出、遮罩渐变、退出前保持滚动锁定、完成后恢复焦点及原内边距；页头、摘要、双图及表格不横移。保留键盘循环、Escape／遮罩／按钮／录入返回关闭、Strict Mode 重放、减少动态效果及触控。覆盖 1440×1000、1100×1000、390×844、320×740、844×390，双图常驻允许自然变长；收集客户端异常并检查无横向溢出，截图仅保存虚构数据。
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

`calendar.test.ts` 覆盖最早账号／记录／已保存日期边界、无测量账号、闰年跨月、最近 10 日和完整历史每批 50 日。`editing.test.ts` 覆盖四项的 15 种非空组合、仅体脂统计与后续补体重、晨间非空腹／未知／遗漏条件拒绝及事务回滚、旧条件只读和晚间独立编辑、先估晚间后补晨间保持估计、先保存晨间再估晚间的锚点、单项估算／合并／实测替代、冻结保护、既有日期／提醒兼容、当地跨日、重复／并发请求、请求内容绑定、伪造归属、版本冲突、审计失败回滚、样本不足保持空白及待选候选。`measurements-entry.browser.mjs` 使用独立虚构账号和与服务器一致的当地日期，验证查看与录入／补录／编辑、四格输入及相邻估算按钮、草稿禁用估算、部分保存、无自动弹窗、晨间固定空腹／旧条件只读、保存按钮 4px 下划线与触控尺寸、50 日历史加载与空行仅体脂补录、历史编辑保留记录信息、晨晚独立整数 GMT 时区选择／新记录默认系统时区／仅改 API 记录时区／清空／采用系统时区／原 IANA 回显与仅时区草稿刷新保护、390／320px 闰年空行对齐及无溢出、会话失效保留草稿和估计替代后返回实测 Inspector。老回看场景固定浏览器日期，日历录入场景与服务器当地日期一致。

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
