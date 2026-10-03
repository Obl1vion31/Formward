# App

## 目的

本目录是 Next.js App Router 入口，保存页面、布局、Server Actions 和 HTTP Route Handlers。

## 关系

入口解析身份和输入，调用 `src/features` 中的功能，再将结果转换成页面或 HTTP 响应。业务计算和数据库查询不应散落在页面中。

## 当前入口

- `page.tsx` 挂载中央人物舞台 `HomeExperience`。
- `home-experience.tsx` 协调 INTRO、FORWARD_ANIMATING、LOGIN_READY、REVERSE_ANIMATING、AUTHENTICATING、FINAL_TRANSITION、FINAL 状态，等待图片解码并同步表单。SCROLL 提示随 INTRO 状态显示，每次回到首屏都恢复；人物运动由独立外层承载，播放期间暂停，输入框首次聚焦后回中并锁定整个登录阶段，倒放回首屏或进入 FINAL 才解除。
- `figure-motion.ts` 用独立 rAF 控制反向位移与朝鼠标倾转，按实际时间平滑跟随，停止 180ms 后用 600ms 回中；归稳后取消 rAF。首屏幅度为水平 6px、垂直 4px、倾转 0.6° / 0.3°；Frame 12 未填写时与 Frame 13 输入框无焦点时为半幅。触屏、窄屏、reduced motion、页面隐藏和失焦时关闭。
- `use-direction-trigger.ts` 持续监听滚轮、触控和键盘方向；滚轮累计 44px、触控累计 40px 后选择目标端点。惯性不重启播放，进入最终过渡后移除监听。
- `home-timeline.ts` 用 rAF 时钟驱动线性时间游标 `animationProgress`；正放、倒放全程均为 425ms，中途改变方向从当前游标继续。12 帧的 11 个段长为 38 / 36 / 34 / 32 / 30 / 30 / 32 / 38 / 45 / 52 / 58ms，每段仅在末尾交叠 16ms，不再叠加全局缓动；其他帧数使用等间隔兼容映射。Login 在最后 40% 时间（170ms）淡入并上移 16px，reduced motion 则全程仅淡入。内部时长参数仅用于测试三档速度，页面固定使用 425ms。
- `frame-config.ts` 定义 1–12 的 `PRE_LOGIN_FRAMES` 和独立的 13 `FINAL_FRAME`。`FRAME_CONFIG` 按路径保存静态导入及每帧桌面、移动端的 scale / x / y；1–12 以 Frame 1 为基准，优先对齐头顶和躯干，测量与残差见 `docs/frame-calibration.md`。静态导入提供实际尺寸和内容变化后的新地址。
- `body-sequence.tsx` 叠放全部人物帧，并为全部 13 张图设置 Next.js `preload`。只有实际图片全部 `decode()` 完成才播放；加载期间的最近方向被保留。
- `login-overlay.tsx` 显示 Email、Password 和 `ENTER`，保留本轮输入并报告焦点，显示认证进度与中文错误。首次聚焦在 180ms 内回中，切换字段或失焦不解除 LOGIN_READY 的锁定。Frame 12 就绪且两项非空后，Enter 先在 AUTHENTICATING 验证账号，禁用输入和重复提交；失败恢复 LOGIN_READY，成功播放 700ms 的 12 → 13，实际动画结束后导航到 `/dashboard`。
- `globals.css` 定义石墨舞台、微弱暖金与宽幅暖光、petrol 环境色、尾部前方无外框烟色衬底、人物外层透视与最终过渡。首屏常驻提示为人物右侧腰部的 SCROLL 和微型鼠标轮廓，鼠标移动不隐藏，离开 INTRO 后 120ms 淡出，回到 INTRO 后恢复；仅在宽度超过 700px、支持 hover 的细指针设备显示。键盘入口只在焦点时显示，加载 / 失败信息独立于提示。ENTER、表单和现有人物显示高度保持原设计。人物组使用 `isolation: isolate`，所有人物帧用 `plus-lighter` 按互补权重合成；`layout.tsx` 提供共享 HTML 外壳。
- `home-timeline.test.mjs` 验证分段时间线、模拟 60/120Hz 的三档速度、双向手势、中途反向、惯性、帧扩展和 reduced motion；浏览器交互、实际截图像素和校准验收见 `tests/home-experience.browser.mjs`。
- `figure-motion.test.mjs` 验证模拟 60/120Hz 跟随与归稳、幅度上限、暂停与恢复、聚焦回中、立即归零和清理。`pnpm test` 用 Node.js 24 内置测试运行器执行两个测试文件，不需要额外框架。

## 维护约定

阅读路线、逐个组件与 CSS 的对应关系、动画公式及参数修改示例见 [代码自学指南](../../docs/code-study.md)。源码注释说明关键边界与数据流，CSS 按功能分组展开；参数改变时同步更新指南的实际值。

页面滚动距离不参与动画进度计算。当前 12 帧使用显式分段节奏；改变序列长度时会使用等间隔兼容映射，需要重新设计节奏时同步调整 `FRAME_INTERVALS_MS` 与测试。替换素材后重新测量校准标记和对齐值，最终帧保持独立。表单输入保留在内存，真实认证请求调用 `src/features/auth/client.ts`。服务端入口通过 `src/features/auth/server.ts` 验证身份；`api/auth/` 提供认证接口，`dashboard/` 提供受保护主页和退出。新增页面和 API 时按实际需要创建路由目录，并为每个项目维护的目录创建 README。
