# Tests

## 目的

本目录保存跨功能、数据库和浏览器端到端测试。单个 feature 的单元测试优先与源文件放在一起。

## 当前验证入口

- `pnpm test` 使用 Node.js 24 内置测试运行器，以 `--test-isolation=none` 执行源码旁的两份 `*.test.mjs`，共 32 项测试。`home-timeline.test.mjs` 验证 425ms 的 11 段节奏、16ms 交叠、双向时间线、手势阈值、中途反向、惯性、帧数扩展及 reduced motion。400 / 425 / 450ms 分别按模拟 60Hz 和 120Hz 时钟检查线性游标、完整帧顺序与反向映射。
- `figure-motion.test.mjs` 验证反向位移、倾转幅度、90ms 跟随、180ms 静止等待后 600ms 回稳、100ms 播放回中、180ms 输入回中、半幅恢复、连续接续和清理。60Hz / 120Hz 模拟检查时间相关的跟随与回稳；模拟采样不代表实机高刷新率验收。
- `home-experience.browser.mjs` 对运行中的首页执行浏览器验收，覆盖首屏常驻 SCROLL 提示、早期操作与加载失败状态、鼠标联动及回稳、焦点锁定与快速提交、能力降级、四种视口的 12 帧对齐与裁切、三档时长、prompt 的 A–E、表单前段隐藏、双向中途反向、刷新、键盘、手机原生触控、reduced motion 和 13 张图片冷启动预加载，并检查真实截图像素。输入使用虚构账号，默认访问 `http://127.0.0.1:3000`，可由 `FORMWARD_BASE_URL` 指定。

校准标记读取 `docs/frame-calibration.md` 的 JSON 数据块。测试测量实际 CSS 变换后的头顶、躯干中心、躯干高度和尾滴；相对 Frame 1 的残差上限按图片显示高度换算，分别为桌面参考下 4 / 4 / 7 / 12px，横向躯干中心偏差不超过 0.1px。所有 12 帧都检查可见范围。桌面提示与首帧人物间距至少 30px、不得越界，触屏与窄屏不显示；底部箭头已移除。键盘入口只在聚焦时显示，保持至少 44px 高度，进入后自动聚焦 Email 并锁定人物居中。

鼠标交互检查确认 Logo 和 Login 的位置不受人物联动影响，人物位移与倾转不改变帧进度；鼠标移动及很小的滚轮输入后首屏提示持续显示，开始转身后隐藏，完整倒放后重新显示并恢复滚轮动势。首次输入聚焦后 180ms 回中，切换字段、失焦或点击空白仍保持整个登录阶段锁定；回中完成前按 Enter 也从中心开始最终过渡。完整倒放解除锁定，FINAL 只在输入框失焦后接收新的半幅鼠标输入。鼠标离开缓慢回稳，窗口失焦、页面隐藏、窄屏与 reduced motion 立即归零。冷启动期间鼠标移动不影响返回首屏后的提示显示，加载失败文字独立保留。

三档时长测试在浏览器内加载同一 `home-timeline.ts` 的编译结果，仅通过内部时长参数比较 400 / 425 / 450ms，页面默认固定 425ms。真实交互的完成时间由游标端点属性变更记录，避免将 React 状态提交或下一次截图采样的延迟算进动画；仍允许浏览器 rAF 的采样间隔。测试报告实际 rAF 中位间隔，不能据此宣称完成 120Hz 实机验证。冷启动检查记录每张实际人物图的 `decode()` 成功、待执行手势，以及后续正倒放没有新增图片请求或更换 `currentSrc`。

像素检查在桌面和手机视口覆盖全部 11 次初始换帧及 12 → 13，在 reduced motion 下覆盖 1 → 12 及 12 → 13，共 78 组。桌面另外固定最大位移与倾转，检查 1 → 2、5 → 6、11 → 12 的三个交叠位置，共 9 组，合计 87 组。每对图片分别采集完整显示的两端截图，再比较 25%、50%、75% 交叠截图与两端加权参考；只统计相对背景可见的人物区域，平均 RGB 误差要求不超过 2/255。截图裁切使用固定舞台范围，人物对齐及外层姿态在每组检查期间保持一致，不将最终动画中的缩放或模糊变化误当作合成误差。桌面还临时恢复 `normal` 合成作为反例，确认旧方式的变暗能被检查识别。图片解码使用浏览器 Canvas，仅用于测试，无需额外图片处理依赖。

Playwright 可临时安装到 `/tmp`，不修改项目依赖。先启动开发服务或构建后的 production 服务，再执行：

```bash
npm install --prefix /tmp/formward-browser-check --no-audit --no-fund playwright
PLAYWRIGHT_BROWSERS_PATH=/tmp/formward-browser-check/browsers node /tmp/formward-browser-check/node_modules/playwright/cli.js install chromium
PLAYWRIGHT_MODULE=/tmp/formward-browser-check/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/formward-browser-check/browsers node tests/home-experience.browser.mjs
```

运行环境需提供 Chromium 所需的系统库。`FORMWARD_BROWSER_ARTIFACTS` 可指定已存在的截图目录，包含桌面、手机的登录态及人物合成对照截图；截图包含虚构测试输入，不放入 `public/`。视觉布局另需人工复核桌面、手机、窄屏和横屏的肩背展示、人物裁切、表单边缘与文字可读性。

## 首版重点

- 账号之间不能访问彼此数据。
- AI Token 可以撤销，重复请求不会创建重复记录。
- 汇总只统计有效饮食和已完成运动。
- 缺失数据保持为空。
- Excel 导入拦截异常体脂、计划运动和重复来源行。
- 导入事务失败时不留下部分数据。

## 维护约定

测试文件的阅读顺序、模拟时钟和截图验收的分工见 [代码自学指南](../docs/code-study.md)。源码中的注释解释测试环境、实际端点采样和像素参考方法。

测试使用虚构或脱敏数据。只有出现真实测试内容时才创建更细的测试目录。
