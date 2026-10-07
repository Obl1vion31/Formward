# Tests

## 目的

本目录保存跨功能、数据库和浏览器端到端测试。单个 feature 的单元测试优先与源文件放在一起。

## 当前验证入口

- `pnpm test` 使用 Node.js 24 内置测试运行器，执行动画与轨道、认证、身体测量测试。测量另覆盖晨间基准四种情况、稳健中位差、28 天窗口／至少 3 日／最多 7 个晨间样本／7 天延续、样本不足、正常模式排除估计与未来实测、历史稳定、真实替代估计、按指标独立补缺、准确时间确认、重建与数据库指标存在约束、来源与写入入口独立、占位时间不生成 UTC、补全预览／幂等及整批回滚；初始化另覆盖全范围真实配对、两侧插值、受限边界外推、真实来源快照与逐项报告、一次性与并发幂等、冻结空缺、补录仅替代对应指标、普通重建／恢复保护、来源隔离与审计失败回滚；也覆盖当地 06:00／18:00 边界、跨月跨年、时区与夏令时、白天空腹确认、晚间非空腹规则、缺项、多次测量、维护预览绑定、幂等修正／软删除／恢复、事务回滚、重复与并发重试、重新排序导入及跨账号访问。时间线覆盖 500ms 正倒放、中途反向、方向阈值、惯性、两端各 40ms 的视频 / 静态混合、60 帧索引、异步寻帧合并及清理、reduced motion；475 / 500 / 525ms 以模拟 60Hz、120Hz 时钟验证线性游标。
- `figure-motion.test.mjs` 验证原有鼠标位移、倾转、跟随、回中、暂停恢复和焦点锁定。模拟时钟不代表实机高刷新率验收。
- `home-experience.browser.mjs` 对 production 首页检查提示、视差、焦点锁定、键盘、手机触控、能力降级、四种视口的静态端点校准与裁切、视频透明合成、实际解码的正倒放帧及中途反向、首尾和最终交叠、reduced motion、三张静态图及视频的冷启动与加载失败。输入为虚构账号，默认访问 `http://127.0.0.1:3000`，可用 `FORMWARD_BASE_URL` 指定。
- `pnpm test:measurements-browser` 在同一隔离 production 服务上运行 `measurements.browser.mjs`，验证体重／体脂正常纵轴、稀疏 7 日摘要与覆盖天数、7D／30D／90D／全部／自定义／单日、晨晚折线、估计菱形／虚线与依据、真实体重／估计体脂共存、非真实配对差值留空且不展示预测区间、仅实测摘要、来源及占位时间、极淡同色缺测桥、最近 10 个记录日、候选图表／表格／详情一致性和空状态。另用独立虚构初始化账号检查历史补全来源、插值／边界趋势依据与真实样本列表。图表实测／估计点和表格有效数值直接打开同一 Inspector，验证共享主读数字号、日期／状态与记录信息，估计仅增加依据；Inspector 内指标切换不改变页面趋势，跨午夜保留实际时间与归属日，未知设备／时区不占空行。查看候选不改变代表选择，完整历史返回恢复展开、滚动及焦点。估计直接打开所点时段与当前指标，常规视口首屏可看到数值、依据、样本日数与辅助趋势提示，参考记录默认折叠，普通详情无工程元数据；统一估算规则说明两种模式，关闭估计仍可查看，展开保留图表实例。四列表格与图表等宽，全部行与表头边界一致，固定列宽不受估计标签影响。检查历史抽屉焦点、Escape／遮罩关闭、滚动恢复和触控，默认桌面与 390px 手机主要内容不超过约 1.5 屏。覆盖 1440×1000、1100×1000、390×844、320×740、844×390 视口及 reduced motion；收集客户端异常，检查页面无横向溢出，保存虚构数据截图。
- `pnpm test:measurements-http` 在 production build 后使用独立内存数据库、虚构测量与内部账号验证实际 `/dashboard`：未登录重定向、已登录的摘要／空腹主趋势／最近记录及归属和来源展示数据、跨午夜归属、多次候选、跨账号参数无效及无记录空状态。此入口不需要浏览器，不读取真实 `.env.local` 数据库；不将 HTTP 渲染验收当作浏览器交互或视觉验收。

校准读取 `docs/frame-calibration.md` 的 JSON 标记，检查实际 CSS 变换后的原始首尾。视频验收直接记录已绘制的帧号，确认正倒放沿正确方向显示多个实际帧；不只检查 DOM 进度，也不将浏览器丢帧误称为完整 60fps。透明合成读取 Canvas Alpha，要求四角全透明且人物仍可见。首尾停留检查原图、原有鼠标幅度与焦点锁定，第 12 → 13 张继续独立验收。

四种视口在字体就绪后检查 Discipline / NUTRITION、Drive / BUILD YOURSELF、Effortless / AI LOGGING 的排版及登录终点：本地 Newsreader 已加载、主词与 Logo 分属两套字体、三个主词单行同级、IBM Plex Mono 副标签、文字朝向读者、节点与引线连接。检查文字顶部距节点水平线 12px、引线距文字边缘 12px、左右镜像对齐；停留画面避开人物、SCROLL 和表单，无裁切。真实转身采样检查轨道角度始终等于人物进度乘 150°，连续经过多个节点位置；登录与认证停留终点，成功后随最终人物动画淡出。手机维持底部三列，键盘入口位于词组上方；reduced motion 交叠两套静态构图，不进行空间旋转，辅助技术只读取一份文案。另检查登录终点跨视口重排和动态 reduced motion，加载及失败时隐藏背景。登录字段覆盖默认透明底线、局部 hover 增强、键盘 Tab 焦点框、尺寸稳定、倒放后保留输入，以及触屏点击标签显现和 reduced motion 即时变化。轨迹使用 SVG、CSS 与现有 rAF，不增加外部字体请求或动画依赖。

截图像素检查在桌面、手机、reduced motion、最大视差及视频尾端覆盖视频 / 静态与 12 → 13 的 39 组交叠。两端完整截图按 25%、50%、75% 加权，比较实际人物区域，平均 RGB 误差上限为 2/255；临时恢复 `normal` 作为变暗反例。视频尾端单独检查，避免将首帧解码画面误作最后一帧。截图使用浏览器 Canvas 解码，无新增项目依赖。

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

`editing.test.ts` 覆盖四项的 15 种非空组合、仅体脂统计与后续补体重、单项估算／合并／实测替代、冻结保护、空白日期和当天停止提醒、当地跨日、重复／并发请求、请求内容绑定、伪造归属、版本冲突、审计失败回滚、样本不足保持空白及待选候选。`measurements-entry.browser.mjs` 使用独立虚构账号和与服务器一致的当地日期，验证四项直接输入及相邻估算按钮、部分保存与剩余项提醒、估计视为已填、关闭和当天跳过、新增持久空行、历史编辑保留记录信息、390／320px 无横向溢出及触控尺寸、会话失效保留草稿和估计替代后返回实测 Inspector。老回看场景固定浏览器日期，不混入真实今天的提醒。

## 认证与浏览器隔离

`src/features/auth/auth.test.ts` 使用独立的内存 PostgreSQL，执行同一 Drizzle migration，覆盖正确登录、错误密码、未知账号、无效输入、关闭注册、重复及并发创建、跨账号身份、过期与撤销、重复退出、CSRF 来源、HTTPS cookie 和限流。

`auth.browser.mts` 自行建立内存 PostgreSQL socket 服务、虚构账号和独立端口的 Next.js production 服务，覆盖受保护主页、失败重试、认证期间防重复、实际动画结束早于导航、刷新会话、跨账号退出与手机 reduced motion。测试不读取或写入 `.env.local` 的真实数据库。默认只运行认证浏览器检查；`FORMWARD_VISUAL_CHECK=1` 再执行 `home-experience.browser.mjs` 的完整手势、校准与像素回归。不要对真实 Neon 数据库运行需要虚构账号的视觉脚本。

浏览器环境缺少系统库时，需要补齐 Chromium 依赖；截图中的中文需要 CJK 字体。可在临时目录下载并解压系统库，通过 LD_LIBRARY_PATH 提供给浏览器，不必修改项目运行依赖。

## 首版重点

- 账号之间不能访问彼此数据。
- AI Token 可以撤销，重复请求不会创建重复记录。
- 汇总只统计有效饮食和已完成运动。
- 实测原始缺项为空；估计按指标独立标记，不参与实测摘要。正常写入不自动估算，补录仅替代对应实测指标；初始化冻结范围同样仅替代对应实测指标，连同日其他估计也保持，更晚实测不反向改写历史。
- Excel 导入拦截异常体脂、计划运动和重复来源行。
- 导入事务失败时不留下部分数据。

## 维护约定

不同改动应检查哪些场景、各检查命令能确认什么，见 [代码阅读指南](../docs/code-study.md)。浏览器环境准备和完整验收范围以本文为准，源码中的注释供需要查看测试实现时参考。

测试使用虚构或脱敏数据。只有出现真实测试内容时才创建更细的测试目录。
