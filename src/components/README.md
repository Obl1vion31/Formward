# Components

本目录保存多个页面共同使用的界面组件，例如按钮、输入、导航、日期范围和图表外壳。业务专用组件留在对应页面或 feature 附近，避免形成无边界组件仓库。

`page-loading.tsx` 提供根布局使用的 `PageLoadingProvider` 和路由后备 `RouteLoading`，`page-loading-state.ts` 提供绑定真实等待状态的 `usePageLoading({ active, label })` 与共享 Context。组件模块只导出组件，保留 Fast Refresh 的状态边界。操作立即反馈，持续超过 200ms 才显示全屏虚化与居中动画／动作文字；多个来源各自登记，全部结束才收起，路由阶段交接不重置延迟。模态层使用原生 dialog，位于业务弹窗上方，等待时阻止操作、Escape 和 Tab，结束后恢复可用焦点。异常与卸载清理各自状态，不自动重试。首屏路由后备可由服务器输出，客户端模态层出现后隐藏后备。

`loading-link.tsx` 包装 Next.js Link，通过其后代的 useLinkStatus 登记实际导航等待；保留预取、新标签和下载语义，预取与即时页面操作不显示加载层。程序导航使用 useTransition，再将 pending 交给共享加载组件。

`scroll-lock.ts` 为 Inspector 和加载层共用滚动锁。首次锁定保存原 overflow／paddingRight 并补偿实际滚动条宽度；最后一层释放时恢复，不重复叠加，也不因一层提前关闭而解除其他层。

维护时只接入真实异步状态，操作内容和错误处理留在对应 feature。颜色与减少动态效果规则在 app/globals.css，浏览器验收在 tests/page-loading.browser.mjs。

