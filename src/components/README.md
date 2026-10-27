# Components

record-updates.tsx提供跨页面更新提示，record-change-client.ts负责只读检查、保存前核对和本窗口保存确认；draft-guard.ts登记草稿供明确采用最新时保护输入。use-chart-drag.ts仅处理水平手势，竖向滚动交还页面。number-change.ts以十倍／十分之一提示输入量级，不作健康判断。

本目录保存多个页面共同使用的界面组件，例如按钮、输入、导航、日期范围和图表外壳。业务专用组件留在对应页面或 feature 附近，避免形成无边界组件仓库。

`page-loading.tsx` 提供根布局使用的 `PageLoadingProvider` 和路由后备 `RouteLoading`，`page-loading-state.ts` 提供绑定真实等待状态的 `usePageLoading({ active, label })` 与共享 Context。组件模块只导出组件，保留 Fast Refresh 的状态边界。操作立即反馈，持续超过 200ms 才显示全屏虚化与居中动画／动作文字；多个来源各自登记，全部结束才收起，路由阶段交接不重置延迟。模态层使用原生 dialog，以视口宽度覆盖滚动条预留区域，位于业务弹窗上方，等待时阻止操作、Escape 和 Tab，结束后恢复可用焦点。异常与卸载清理各自状态，不自动重试。首屏路由后备可由服务器输出，客户端模态层出现后隐藏后备。

`loading-link.tsx` 包装 Next.js Link，通过其后代的 useLinkStatus 登记实际导航等待；保留预取、新标签和下载语义，预取与即时页面操作不显示加载层。程序导航使用 useTransition，再将 pending 交给共享加载组件。

`scroll-lock.ts` 为 Inspector 和加载层共用滚动锁。首次锁定保存 html／body 原 overflow 和 body paddingRight，仅补偿 body 实际释放的宽度；Dashboard 已预留稳定 gutter 时不重复补偿；最后一层释放时恢复，不重复叠加，也不因一层提前关闭而解除其他层。

维护时只接入真实异步状态，操作内容和错误处理留在对应 feature。颜色与减少动态效果规则在 app/globals.css，浏览器验收在 tests/page-loading.browser.mjs。


`use-local-today.ts` 根据设备时区显示今天，每分钟及页面重新可见时更新，服务端日期只用于一致的初始水合。

`use-mobile-mode.ts` 用 useSyncExternalStore 共用窄屏／粗指针触屏判断，覆盖触屏横屏；服务端快照为 null，避免水合时先显示桌面 30 日图或请求手机不需要的视频。设备模式变化后，已手动选择的图表区间保持。

`use-backdrop-dismiss.ts` 为饮食与身体 Inspector 共用遮罩手势判断。只有主指针按下、抬起均在真实遮罩且移动不超过 6px 才关闭；从内容拖出或拖选文字不关闭。关闭按钮、Escape、忙碌保护、焦点恢复和滚动锁由各弹窗继续管理。

`use-chart-motion.ts`供总览、身体、摄入及消耗SVG共用。首次进入视口450ms，数据变化200ms，仅对带标记的数据图形使用原生动画；悬停不重放，卸载／减少动态效果时取消。数字、坐标、命中区域和页面布局保持最终状态。

`chart-scale.ts`为各页面柱图提供独立的等距整倍数刻度，包含零并覆盖整个区间；kg步长至少0.1，空图使用固定中性范围，不随选中日期改变。总览能量折线的局部刻度在dashboard/chart-geometry.ts，不改变这里柱图包含零点的默认值。

`record-dates.ts`只推导最近7个日历日、今天／昨天标签、默认有效日期和容纳日期的最短区间，不创建记录或计算健康数值。`record-date-context.tsx`在饮食／消耗编辑器显示目标日期与补录状态；跨零点提示保持原草稿日期。

`source-input.tsx`与同名CSS模块提供身体、消耗及AI审核共用的来源输入、全部历史展开、搜索、键盘／触控选择与软移除交互；数据和移除接口由各feature提供，maxLength分别为300／200。

use-chart-date-selection.ts统一四页的临时悬停、点击固定、图外／Escape解除和键盘选日；仅维护界面日期。chart-ranges.tsx复用区间按钮，日期输入保留在各模块的自定义表单。

 daily-records.tsx与record-ui.module.css统一日期行、查看入口及次要状态位置；record-history.tsx提供页面内日期查找与每批50行加载；daily-records.tsx在最近行下方提供展开／收起历史。单日查看或编辑才开Inspector，关闭保留列表加载状态及页面位置。主列表由record-dates.ts推导今天及前6天待处理日期，不计算健康数值。

 inspector.tsx与同名CSS统一侧栏、滚动锁、焦点、Escape／遮罩、输入保护和减少动态效果。身体页传入专用标题和内容，保留候选与晨晚流程；饮食旧EditorDialog导出仅为兼容现有调用，不再自建弹窗。

 draft-guard.ts 只登记当前弹窗未提交输入与上传状态，饮食／消耗及统一审核编辑器共用。关闭、Escape、真实遮罩及表单放弃按钮走同一确认，未改动直接关闭；刷新／离开页面使用浏览器原生保护，不将健康草稿写入本地存储。

Disclosure关闭时不挂载内容，只在展开后请求原图或显示较长的详情，避免总览和审核首屏加载全部附件。
