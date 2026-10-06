# App

## 目的

本目录是 Next.js App Router 入口，保存页面、布局、Server Actions 和 HTTP Route Handlers。

## 关系

入口解析身份和输入，调用 `src/features` 中的功能，再将结果转换成页面或 HTTP 响应。业务计算和数据库查询不应散落在页面中。

## 当前入口

- `page.tsx` 让 `/` 显示 `HomeExperience` 提供的人物、提示和登录体验。
- `dashboard/page.tsx` 验证当前会话后调用 measurements feature 查询自己的测量；有记录时显示最新空腹与 7 日摘要、正常纵轴的晨晚折线及明确标记的估计补全、7D／30D／90D／全部／自定义、最近记录和历史抽屉，没有记录时显示简短空状态。业务校验、日期规则和专用界面位于 `src/features/measurements`，页面不直接写 SQL 或计算晨晚差。
- `home-intro-backdrop.tsx` 显示 Discipline / Nutrition、Drive / Build yourself、Effortless logging / AI-powered。视觉首尾场景用于 reduced motion 的静态交叠，辅助技术只读取一份文案。手机使用底部三列与细轴；键盘入口获焦时位于文字上方。加载及失败时隐藏，登录与认证保留终点，成功后的最终过渡退出。
- `home-orbit.ts` 以人物进度计算 150° 倾斜椭圆投影、节点、引线、轻微缩放及明暗。正常模式直接更新 DOM，ResizeObserver 与字体就绪后重新测量，不另开动画时钟；文字始终面向读者。
- `hero-font.ts` 通过 `next/font/local` 提供 IBM Plex Mono 400，作用于微标签及滚动提示；主标题继承 Logo 的系统字体，使用 400 字重和 0.015em 字距。资源和许可证在 `public/fonts/`。
- `home-experience.tsx` 协调 INTRO、FORWARD_ANIMATING、LOGIN_READY、REVERSE_ANIMATING、AUTHENTICATING、FINAL_TRANSITION、FINAL 状态，等待静态图与视频就绪并同步表单。SCROLL 提示随 INTRO 状态显示，每次回到首屏都恢复；人物运动由独立外层承载，播放期间暂停，输入框首次聚焦后回中并锁定整个登录阶段，倒放回首屏或进入 FINAL 才解除。
- `turn-video.ts` 管理 60 帧视频的异步寻帧、WebGL 透明合成、端点大小与位置以及资源清理；播放文件由原始视频生成，视频目录保存制作说明。
- `figure-motion.ts` 用独立 rAF 控制反向位移与朝鼠标倾转，按实际时间平滑跟随，停止 180ms 后用 600ms 回中；归稳后取消 rAF。首屏幅度为水平 6px、垂直 4px、倾转 0.6° / 0.3°；Frame 12 未填写时与 Frame 13 输入框无焦点时为半幅。触屏、窄屏、reduced motion、页面隐藏和失焦时关闭。
- `use-direction-trigger.ts` 持续监听滚轮、触控和键盘方向；滚轮累计 44px、触控累计 40px 后选择目标端点。惯性不重启播放，进入最终过渡后移除监听。
- `home-timeline.ts` 用 rAF 控制 500ms 连续时间游标，正倒放及中途反向复用同一进度。`turnFrameWeights` 在首尾各 40ms 混合视频与原始静态端点，Login 在最后 200ms 淡入并上移 16px。轨道读取同一进度；reduced motion 为 180ms 静态首尾交叠。
- `frame-config.ts` 只导入运行时使用的 1、12、13，保存原有桌面、移动端校准；`PRE_LOGIN_FRAMES` 包含两个静态端点，`FINAL_FRAME` 保持独立。
- `body-sequence.tsx` 预加载三张静态图与转身视频，叠放静态端点、透明视频 Canvas 和最终图。全部素材就绪后才播放，加载期间保留最近方向。
- `login-overlay.tsx` 显示 Email、Password 和 `ENTER`，保留本轮输入并报告焦点，显示认证进度与中文错误。首次聚焦在 180ms 内回中，切换字段或失焦不解除 LOGIN_READY 的锁定。Frame 12 就绪且两项非空后，Enter 先在 AUTHENTICATING 验证账号，禁用输入和重复提交；失败恢复 LOGIN_READY，成功播放 700ms 的 12 → 13，实际动画结束后导航到 `/dashboard`。
- `globals.css` 定义石墨舞台、暖金环境光、petrol 层次、系统字体 Hero 标题和暖金微标签、轨道远近明暗、手机底部网格、烟色登录衬底及最终过渡。左下角 SCROLL 只在素材就绪的桌面 INTRO 显示，倒放回首屏恢复。人物组仍使用隔离的 `plus-lighter` 合成，文字和轨道不参与人物像素混合。
- `home-timeline.test.mjs` 验证半秒时间线、端点权重、视频索引与异步寻帧合并，覆盖模拟 60/120Hz、双向手势、中途反向、惯性和 reduced motion。实际视频帧、截图合成及移动端验收见 `tests/home-experience.browser.mjs`。
- `figure-motion.test.mjs` 验证模拟 60/120Hz 跟随与归稳、幅度上限、暂停与恢复、聚焦回中、立即归零和清理。`pnpm test` 用 Node.js 24 内置测试运行器执行两个测试文件，不需要额外框架。

## 维护约定

页面各部分对应的代码、样式规则的具体用途和修改位置见 [代码阅读指南](../../docs/code-study.md)。源码注释说明关键边界与数据流，CSS 按功能分组展开；职责、参数或行为改变时同步更新指南中的相关说明。

页面滚动距离不参与动画进度计算。视频控制、黑底透明化和与静态端点的匹配集中在 `turn-video.ts`；同一视频按正向或反向寻帧，未完成的寻帧只保留最新目标，组件卸载时清理监听及 GPU 资源。更换素材后更新校准和 `scripts/prepare-turn-video.sh`，第 13 张保持独立。表单输入保留在内存，真实认证请求调用 `src/features/auth/client.ts`。服务端入口通过 `src/features/auth/server.ts` 验证身份；`api/auth/` 提供认证接口，`dashboard/` 提供受保护主页和退出。新增页面和 API 时按实际需要创建路由目录，并为每个项目维护的目录创建 README。
