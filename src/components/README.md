# Components

本目录保存多个页面共同使用的界面组件，例如按钮、输入、导航、日期范围和图表外壳。业务专用组件留在对应页面或 feature 附近，避免形成无边界组件仓库。

`page-loading.tsx` 提供根布局使用的 `PageLoadingProvider` 和路由后备 `RouteLoading`，`page-loading-state.ts` 提供绑定真实等待状态的 `usePageLoading({ active, label })` 与共享 Context。组件模块只导出组件，保留 Fast Refresh 的状态边界。操作立即反馈，持续超过 200ms 才显示全屏虚化与居中动画／动作文字；多个来源各自登记，全部结束才收起，路由阶段交接不重置延迟。模态层使用原生 dialog，以视口宽度覆盖滚动条预留区域，位于业务弹窗上方，等待时阻止操作、Escape 和 Tab，结束后恢复可用焦点。异常与卸载清理各自状态，不自动重试。首屏路由后备可由服务器输出，客户端模态层出现后隐藏后备。

`loading-link.tsx` 包装 Next.js Link，通过其后代的 useLinkStatus 登记实际导航等待；保留预取、新标签和下载语义，预取与即时页面操作不显示加载层。程序导航使用 useTransition，再将 pending 交给共享加载组件。

`scroll-lock.ts` 为 Inspector 和加载层共用滚动锁。首次锁定保存 html／body 原 overflow 和 body paddingRight，仅补偿 body 实际释放的宽度；Dashboard 已预留稳定 gutter 时不重复补偿；最后一层释放时恢复，不重复叠加，也不因一层提前关闭而解除其他层。

维护时只接入真实异步状态，操作内容和错误处理留在对应 feature。颜色与减少动态效果规则在 app/globals.css，浏览器验收在 tests/page-loading.browser.mjs。


`use-local-today.ts` 根据设备时区显示今天，每分钟及页面重新可见时更新，服务端日期只用于一致的初始水合。

`use-mobile-mode.ts` 用 useSyncExternalStore 共用窄屏／粗指针触屏判断，覆盖触屏横屏；服务端快照为 null，避免水合时先显示桌面 30 日图或请求手机不需要的视频。设备模式变化后，已手动选择的图表区间保持。

`use-backdrop-dismiss.ts` 为饮食与身体 Inspector 共用遮罩手势判断。只有主指针按下、抬起均在真实遮罩且移动不超过 6px 才关闭；从内容拖出或拖选文字不关闭。关闭按钮、Escape、忙碌保护、焦点恢复和滚动锁由各弹窗继续管理。

`use-chart-motion.ts`供总览、身体、摄入及消耗SVG共用。首次进入视口450ms，数据变化200ms，仅对带标记的数据图形使用原生动画；悬停不重放，卸载／减少动态效果时取消。数字、坐标、命中区域和页面布局保持最终状态。
