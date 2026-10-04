# App

## 目的

本目录是 Next.js App Router 入口，保存页面、布局、Server Actions 和 HTTP Route Handlers。

## 关系

入口解析身份和输入，调用 `src/features` 中的功能，再将结果转换成页面或 HTTP 响应。业务计算和数据库查询不应散落在页面中。

## 当前入口

- `page.tsx` 让 `/` 显示 `HomeExperience` 提供的人物、提示和登录体验。
- `home-intro-backdrop.tsx` 显示 Discipline / Nutrition、Drive / Build yourself、Effortless / AI logging 三组英文排版。节点、引线与标题共享 SVG 坐标，位于人物下层并独立于人物视差。手机在底部安全区上方横排三组文字，用细轴连接节点；键盘入口获焦时位于文字上方。素材加载及失败时隐藏，转身时复用时间线淡出，倒放连续恢复。
- `hero-font.ts` 通过 `next/font/local` 提供 Manrope 300–500 和 IBM Plex Mono 400 的字体变量，只作用于 Hero 标题、小标签及滚动提示；资源和许可证在 `public/fonts/`。
- `home-experience.tsx` 协调 INTRO、FORWARD_ANIMATING、LOGIN_READY、REVERSE_ANIMATING、AUTHENTICATING、FINAL_TRANSITION、FINAL 状态，等待静态图与视频就绪并同步表单。SCROLL 提示随 INTRO 状态显示，每次回到首屏都恢复；人物运动由独立外层承载，播放期间暂停，输入框首次聚焦后回中并锁定整个登录阶段，倒放回首屏或进入 FINAL 才解除。
- `turn-video.ts` 管理 60 帧视频的异步寻帧、WebGL 透明合成、端点大小与位置以及资源清理；播放文件由原始视频生成，视频目录保存制作说明。
- `figure-motion.ts` 用独立 rAF 控制反向位移与朝鼠标倾转，按实际时间平滑跟随，停止 180ms 后用 600ms 回中；归稳后取消 rAF。首屏幅度为水平 6px、垂直 4px、倾转 0.6° / 0.3°；Frame 12 未填写时与 Frame 13 输入框无焦点时为半幅。触屏、窄屏、reduced motion、页面隐藏和失焦时关闭。
- `use-direction-trigger.ts` 持续监听滚轮、触控和键盘方向；滚轮累计 44px、触控累计 40px 后选择目标端点。惯性不重启播放，进入最终过渡后移除监听。
- `home-timeline.ts` 用 rAF 控制 500ms 连续时间游标，正倒放及中途反向复用同一进度。`turnFrameWeights` 在首尾各 40ms 混合视频与原始静态端点；`introReveal` 控制封面背景在前 40%（200ms）退出，Login 在最后 40%（200ms）淡入并上移 16px。reduced motion 为 180ms 静态首尾淡入淡出，背景标题随整个进度退出。
- `frame-config.ts` 只导入运行时使用的 1、12、13，保存原有桌面、移动端校准；`PRE_LOGIN_FRAMES` 包含两个静态端点，`FINAL_FRAME` 保持独立。
- `body-sequence.tsx` 预加载三张静态图与转身视频，叠放静态端点、透明视频 Canvas 和最终图。全部素材就绪后才播放，加载期间保留最近方向。
- `login-overlay.tsx` 显示 Email、Password 和 `ENTER`，保留本轮输入并报告焦点，显示认证进度与中文错误。首次聚焦在 180ms 内回中，切换字段或失焦不解除 LOGIN_READY 的锁定。Frame 12 就绪且两项非空后，Enter 先在 AUTHENTICATING 验证账号，禁用输入和重复提交；失败恢复 LOGIN_READY，成功播放 700ms 的 12 → 13，实际动画结束后导航到 `/dashboard`。
- `globals.css` 定义石墨舞台、微弱暖金与宽幅暖光、petrol 环境色、Hero 轻量暖 ivory 标题和暖金微标签、尾部前方无外框烟色衬底、人物外层透视与最终过渡。首屏常驻提示为左下角的 SCROLL TO ENTER 和细线动标，与左侧标题共用边距；鼠标移动不隐藏，离开 INTRO 后 120ms 淡出，回到 INTRO 后恢复。仅在宽度超过 700px、支持 hover 的细指针设备显示。键盘入口只在焦点时显示，加载 / 失败信息独立于提示。ENTER、表单和现有人物显示高度保持原设计。人物组使用 `isolation: isolate`，所有人物帧用 `plus-lighter` 按互补权重合成；`layout.tsx` 提供共用的 HTML 文档结构、默认页面元信息和全局样式入口。
- `home-timeline.test.mjs` 验证半秒时间线、端点权重、视频索引与异步寻帧合并，覆盖模拟 60/120Hz、双向手势、中途反向、惯性和 reduced motion。实际视频帧、截图合成及移动端验收见 `tests/home-experience.browser.mjs`。
- `figure-motion.test.mjs` 验证模拟 60/120Hz 跟随与归稳、幅度上限、暂停与恢复、聚焦回中、立即归零和清理。`pnpm test` 用 Node.js 24 内置测试运行器执行两个测试文件，不需要额外框架。

## 维护约定

页面各部分对应的代码、样式规则的具体用途和修改位置见 [代码阅读指南](../../docs/code-study.md)。源码注释说明关键边界与数据流，CSS 按功能分组展开；职责、参数或行为改变时同步更新指南中的相关说明。

页面滚动距离不参与动画进度计算。视频控制、黑底透明化和与静态端点的匹配集中在 `turn-video.ts`；同一视频按正向或反向寻帧，未完成的寻帧只保留最新目标，组件卸载时清理监听及 GPU 资源。更换素材后更新校准和 `scripts/prepare-turn-video.sh`，第 13 张保持独立。表单输入保留在内存，真实认证请求调用 `src/features/auth/client.ts`。服务端入口通过 `src/features/auth/server.ts` 验证身份；`api/auth/` 提供认证接口，`dashboard/` 提供受保护主页和退出。新增页面和 API 时按实际需要创建路由目录，并为每个项目维护的目录创建 README。
