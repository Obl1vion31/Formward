# Tests

## 目的

本目录保存跨功能、数据库和浏览器端到端测试。单个 feature 的单元测试优先与源文件放在一起。

## 当前验证入口

- `pnpm test` 使用 Node.js 24 内置测试运行器，执行 41 项测试：32 项动画、9 项认证。时间线覆盖 500ms 正倒放、中途反向、方向阈值、惯性、两端各 40ms 的视频 / 静态混合、60 帧索引、异步寻帧合并及清理、reduced motion；475 / 500 / 525ms 以模拟 60Hz、120Hz 时钟验证线性游标。
- `figure-motion.test.mjs` 验证原有鼠标位移、倾转、跟随、回中、暂停恢复和焦点锁定。模拟时钟不代表实机高刷新率验收。
- `home-experience.browser.mjs` 对 production 首页检查提示、视差、焦点锁定、键盘、手机触控、能力降级、四种视口的静态端点校准与裁切、视频透明合成、实际解码的正倒放帧及中途反向、首尾和最终交叠、reduced motion、三张静态图及视频的冷启动与加载失败。输入为虚构账号，默认访问 `http://127.0.0.1:3000`，可用 `FORMWARD_BASE_URL` 指定。

校准读取 `docs/frame-calibration.md` 的 JSON 标记，检查实际 CSS 变换后的原始首尾。视频验收直接记录已绘制的帧号，确认正倒放沿正确方向显示多个实际帧；不只检查 DOM 进度，也不将浏览器丢帧误称为完整 60fps。透明合成读取 Canvas Alpha，要求四角全透明且人物仍可见。首尾停留检查原图、原有鼠标幅度与焦点锁定，第 12 → 13 张继续独立验收。

四种视口在本地字体就绪后检查 Discipline、Drive、Effortless 与 Nutrition、Build yourself、AI logging 的两级英文排版，确认位于人物下层、不裁切或被人物遮挡、避开左下角 SCROLL TO ENTER。桌面检查引线端点与节点连接、标题沿节点对齐；手机隐藏大弧线，用细轴连接三个节点，键盘入口获焦时位于文字上方。真实转身采样确认背景实际淡出、前 200ms 后隐藏并移出辅助技术、倒放恢复；reduced motion 随全程 180ms 淡出。冷启动与加载失败时背景隐藏。轨迹使用静态 SVG 和 CSS，字体由本站提供，不增加外部字体请求。

截图像素检查在桌面、手机、reduced motion、最大视差及视频尾端覆盖视频 / 静态与 12 → 13 的 39 组交叠。两端完整截图按 25%、50%、75% 加权，比较实际人物区域，平均 RGB 误差上限为 2/255；临时恢复 `normal` 作为变暗反例。视频尾端单独检查，避免将首帧解码画面误作最后一帧。截图使用浏览器 Canvas 解码，无新增项目依赖。

Playwright 可临时安装到 `/tmp`，不修改项目依赖。先完成 production build，再运行自带独立数据库和测试服务的入口：

```bash
npm install --prefix /tmp/formward-browser-check --no-audit --no-fund playwright
PLAYWRIGHT_BROWSERS_PATH=/tmp/formward-browser-check/browsers node /tmp/formward-browser-check/node_modules/playwright/cli.js install chromium
pnpm build
FORMWARD_VISUAL_CHECK=1 PLAYWRIGHT_MODULE=/tmp/formward-browser-check/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/formward-browser-check/browsers pnpm test:browser
```

运行环境需提供 Chromium 所需的系统库。`FORMWARD_BROWSER_ARTIFACTS` 可指定已存在的截图目录，包含桌面、手机的登录态及人物合成对照截图；截图包含虚构测试输入，不放入 `public/`。视觉布局另需人工复核桌面、手机、窄屏和横屏的肩背展示、人物裁切、表单边缘与文字可读性。

## 认证与浏览器隔离

`src/features/auth/auth.test.ts` 使用独立的内存 PostgreSQL，执行同一 Drizzle migration，覆盖正确登录、错误密码、未知账号、无效输入、关闭注册、重复及并发创建、跨账号身份、过期与撤销、重复退出、CSRF 来源、HTTPS cookie 和限流。

`auth.browser.mts` 自行建立内存 PostgreSQL socket 服务、虚构账号和独立端口的 Next.js production 服务，覆盖受保护主页、失败重试、认证期间防重复、实际动画结束早于导航、刷新会话、跨账号退出与手机 reduced motion。测试不读取或写入 `.env.local` 的真实数据库。默认只运行认证浏览器检查；`FORMWARD_VISUAL_CHECK=1` 再执行 `home-experience.browser.mjs` 的完整手势、校准与像素回归。不要对真实 Neon 数据库运行需要虚构账号的视觉脚本。

浏览器环境缺少系统库时，需要补齐 Chromium 依赖；截图中的中文需要 CJK 字体。可在临时目录下载并解压系统库，通过 LD_LIBRARY_PATH 提供给浏览器，不必修改项目运行依赖。

## 首版重点

- 账号之间不能访问彼此数据。
- AI Token 可以撤销，重复请求不会创建重复记录。
- 汇总只统计有效饮食和已完成运动。
- 缺失数据保持为空。
- Excel 导入拦截异常体脂、计划运动和重复来源行。
- 导入事务失败时不留下部分数据。

## 维护约定

不同改动应检查哪些场景、各检查命令能确认什么，见 [代码阅读指南](../docs/code-study.md)。浏览器环境准备和完整验收范围以本文为准，源码中的注释供需要查看测试实现时参考。

测试使用虚构或脱敏数据。只有出现真实测试内容时才创建更细的测试目录。
