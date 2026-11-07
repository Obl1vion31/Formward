# Components

Inspector标题两端均直接排列在面板底色上，不增加独立圆角、内高光、模糊或负边距。电脑保留原侧栏尺寸和滚动，隐藏把手且不占位；手机通过--inspector-sticky-offset预留44px，饮食与消耗的粘性保存条复用该偏移，长表单滚动不盖住把手。手机把手区与面板底色连续，键盘焦点仅围绕小把手；关闭按钮保持44px。record-intent.ts集中校验网页view／edit／create打开意图，record-ui统一列表编辑实底与查看次级样式，业务组件决定各任务可用内容。

record-intent-client.ts将同地址再次点击交给当前已挂载业务，沿用LoadingLink的草稿确认及来源退出顺序；EntrySurface仅为重复create重开稳定外壳，三类业务重新打开对应内容。不拦截趋势、其他日期／来源／查询的正常导航，不存储健康快照或增加接口。

metric-card-rail.tsx在手机提供横滑及拖后点击抑制，电脑提供自适应网格；真实卡片与MetricCardRailSkeleton共用外壳。trend-glyph.tsx复用2:1数据平面，metric-trend-model.ts只管绘图尺度和内部趋势链接校验。三类卡片两端共用日期、区间与图形交接；关联图区最大宽640px、居中，其他桌面区间保留完整图幅。nutrition-chart.tsx将设备分支放在绘图外壳，尺寸测量只随实际挂载节点运行，切换设备宽度后重新绑定。专页均提供返回总览，手机在页头、电脑在正文标题行。

chart-flight.ts集中管理一次图形转场的所有权、返回幂等及取消清理。按钮返回、popstate和路由提交复用同一回程；取消前先隐藏旧图层，旧完成回调只清理自己的id。回程使用来源几何立即收束，再由实际卡片接管；配对核对指标、完整日期轴、绘图模型、可见目标及视口。区间／指标、尺寸或记录变化后取消旧配对，正常导航与返回。chart-transition.tsx的本人内存上下文另保存总览区间及显示选项；认证布局按账号重建，不缓存健康读数供返回恢复。

Inspector在手机提供底部面板：只读stableScroll详情默认半屏，录入默认近全屏，把手可拖动及点击切换。所有关闭路径仍经过同一个草稿/忙碌保护；正文自行滚动，桌面侧栏和compact确认框保持各自用途。工作区的PageLoadingProvider显示非模态任务反馈，登录等工作区外流程继续使用原反馈；AssistantProvider显式识别工作区pending。

appearance-state区分用户选择system/light/dark与实际data-theme，早期初始化保留本机既有偏好；AppearanceSync在持久框架内保持系统监听，设置面板关闭后仍响应。AppearanceToggle在顶栏直接切换，FollowSystemAppearance提供账号菜单单个系统外观开关；首次使用的AppearanceSwitch保持。appearance-motion使用原生View Transition揭示真实主题，快速反向取消旧层及旧回调，失败／减少动态效果立即交接，不复制表单或重挂载页面。

form-draft.ts比较有效数字文本而不舍入，draft-guard.ts集中“继续编辑／放弃修改”。LoadingLink保留Next原有链接能力，站内导航先处理真实草稿；Inspector、内部返回和退出登录遵从相同判定。record-history.tsx使用显式日期查看表单，Enter与同日重复查看可用。主表单以data-entry-form标记使用globals.css公共边框、16px输入、44px操作和逐态样式；带单位的个人资料沿用一个外框。

`brand-logo.tsx` 和同名 CSS 模块统一 F＋手臂图标、formward 字标和金色圆点。图形用 `/icons/formward-mark.svg` 的透明遮罩跟随文字颜色；工作区的 `compactOnMobile` 在窄屏／触屏仅显示图标。可访问名称由外层图片语义或链接提供，内部图形与文字不重复朗读。

## 四页共用框架、确认和读数

record-trend-panel.tsx统一正文、日期与查看、主要读数、区间、标题与实际选项、图例和绘图区。InlineChartControls直接呈现单个勾选与占比切换，ChartOptions只放真正需展开的业务选项，自定义日期须应用才生效。数值、单位及完整标签共同决定列数，labelVariants／noteVariants按当前区间全部状态预留高度；reserveNote保留身体估计说明行，稳定id避免标签变化重新挂载。必要状态按当前区间的可能文字预留紧凑高度，无提示区间不占行。确认由confirmation.tsx与confirmation-state.ts集中排队、取消/Escape、焦点和滚动锁；没有挂载时不降级到浏览器确认。number-format.ts按业务显示蛋白质／碳水／脂肪最多一位小数并去掉末尾0、热量／消耗整数和身体两位；decimal-input.tsx的宏量输入最多接受一位小数，手填热量／消耗仍只收整数。格式化、聚焦和失焦不写回未修改原值，未知与0保持区别；热量计算与落库不提前取整，公开请求和查询精度保持。健康计算仍在各feature共用模型。

record-updates.tsx沿用现有变化检测并发出formward-record-context-stale供助手失效重查，提供跨页面更新提示，record-change-client.ts负责只读检查、保存前核对和本窗口保存确认；draft-guard.ts登记草稿供明确采用最新时保护输入。use-chart-drag.ts仅处理水平手势，竖向滚动交还页面。number-change.ts以十倍／十分之一提示输入量级，不作健康判断。

本目录保存多个页面共同使用的界面组件，例如按钮、输入、导航、日期范围和图表外壳。业务专用组件留在对应页面或 feature 附近，避免形成无边界组件仓库。

workspace-motion.ts只管理四模块普通导航的正文轻横移与淡变，方向来自workspace-pages顺序；WorkspaceFrame持久挂载同一容器，骨架替换不重播。图形交接、日期详情、录入、同页刷新及初次打开不叠加，顶栏／导航与面板不在动画容器内。200ms、手机16px／电脑12px；快速反向从当前姿态续接，取消前撤销所有权，过期完成回调不影响新动画，减少动态效果即时完成。record-change-client的可选id校验防止同版本不同编号被误认；已知核对错误使用RecordVersionError供业务保留具体原因。

`page-loading.tsx` 提供根布局使用的 `PageLoadingProvider` 和路由后备 `RouteLoading`，`page-loading-state.ts` 提供绑定真实等待状态的 `usePageLoading({ active, label })` 与共享 Context。组件模块只导出组件，保留 Fast Refresh 的状态边界。操作立即反馈，工作区超过200ms显示非模态状态；以下模态反馈仅用于工作区外流程：多个来源各自登记，全部结束才收起，路由阶段交接不重置延迟。模态层使用原生 dialog，以视口宽度覆盖滚动条预留区域，位于业务弹窗上方，等待时阻止操作、Escape 和 Tab，结束后恢复可用焦点。保存前若需要用户确认，等待层暂停展示，确认结束后按实际请求恢复，避免盖住确认按钮。异常与卸载清理各自状态，不自动重试。首屏路由后备可由服务器输出，客户端模态层出现后隐藏后备。

`loading-link.tsx`包装Next.js Link并保留草稿保护、预取、新标签和下载语义。普通导航不登记全局等待；直接录入不预取，保存与真实任务继续使用原反馈。

`scroll-lock.ts` 为 Inspector 和加载层共用滚动锁。首次锁定保存 html／body 原 overflow 和 body paddingRight，仅补偿 body 实际释放的宽度；Dashboard 已预留稳定 gutter 时不重复补偿；最后一层释放时恢复，不重复叠加，也不因一层提前关闭而解除其他层。

维护时只接入真实异步状态，操作内容和错误处理留在对应 feature。颜色与减少动态效果规则在 app/globals.css，浏览器验收在 tests/page-loading.browser.mjs。


`use-local-today.ts` 根据设备时区显示今天，每分钟及页面重新可见时更新，服务端日期只用于一致的初始水合。

`use-mobile-mode.ts` 用 useSyncExternalStore 共用窄屏／粗指针触屏判断，覆盖触屏横屏；服务端快照为 null，避免水合时先显示桌面 30 日图或请求手机不需要的视频。设备模式变化后，已手动选择的图表区间保持。

`use-backdrop-dismiss.ts` 为饮食与身体 Inspector 共用遮罩手势判断。只有主指针按下、抬起均在真实遮罩且移动不超过 6px 才关闭；从内容拖出或拖选文字不关闭。关闭按钮、Escape、忙碌保护、焦点恢复和滚动锁由各弹窗继续管理。

`use-chart-motion.ts`供总览、身体、摄入及消耗SVG共用。首次进入视口450ms，数据变化200ms，仅对带标记的数据图形使用原生动画；悬停不重放，卸载／减少动态效果时取消。数字、坐标、命中区域和页面布局保持最终状态。

use-chart-drag供四页共用横拖选择与纵向滚动判断；手指按下不立即选日，确认横拖或完成点击后才选中，拖动后抑制额外合成点击。

`chart-scale.ts`为各页面柱图提供独立的等距整倍数刻度，包含零并覆盖整个区间；kg步长至少0.1，空图使用固定中性范围，不随选中日期改变。总览能量折线的局部刻度在dashboard/chart-geometry.ts，不改变这里柱图包含零点的默认值。

`record-dates.ts`只推导最近7个日历日、今天／昨天标签、默认有效日期和容纳日期的最短区间，不创建记录或计算健康数值。`record-date-context.tsx`在饮食／消耗编辑器显示目标日期与补录状态；跨零点提示保持原草稿日期。

`source-input.tsx`与同名CSS模块提供身体、消耗及AI审核共用的来源输入、全部历史展开、搜索、键盘／触控选择与软移除交互；数据和移除接口由各feature提供，maxLength分别为300／200。候选使用真实按钮，触屏不取消pointerdown默认行为；输入框失焦且relatedTarget为空时不抢先收起，改由点击／聚焦外部、Tab离开、Escape及窗口失焦关闭。鼠标选择保留输入焦点，中文输入法确认不触发历史选中。

use-chart-date-selection.ts统一四页的鼠标临时预览、自定义期间暂停、完整面板离开恢复，以及键盘和触屏选择；鼠标点击后保持日期并忽略后续悬停，Escape／换区间解除；未点击的悬停离开后恢复默认，同日同输入方式去重，仅维护界面状态。chart-ranges.tsx复用区间按钮，日期输入保留在各模块的自定义表单。

 daily-records.tsx与record-ui.module.css统一日期行、查看入口及次要状态位置；record-history.tsx提供页面内日期查找与每批50行加载；daily-records.tsx在最近行下方提供展开／收起历史。单日查看或编辑才开Inspector，关闭保留列表加载状态及页面位置。主列表由record-dates.ts推导今天及前6天待处理日期，不计算健康数值。

 inspector.tsx与同名CSS统一侧栏、滚动锁、焦点、Escape／遮罩、输入保护和减少动态效果。身体页传入专用标题和内容，保留候选与晨晚流程；饮食旧EditorDialog导出仅为兼容现有调用，不再自建弹窗。

 draft-guard.ts 只登记当前弹窗未提交输入与上传状态，饮食／消耗及统一审核编辑器共用。关闭、Escape、真实遮罩及表单放弃按钮走同一确认，未改动直接关闭；刷新／离开页面使用浏览器原生保护，不将健康草稿写入本地存储。

Disclosure关闭时不挂载内容，只在展开后请求原图或显示较长的详情，避免总览和审核首屏加载全部附件。

use-chart-viewport.ts按实际坐标字体测量刻度宽度，统一总览、饮食及消耗的图宽与左边距；数据或区间换刻度时先完成测量，悬停不改变坐标。长整数不缩字、不裁切。


appearance-state.ts保存本设备主题的读取、早期初始化和跨窗口通知；appearance-switch.tsx提供顶栏日／月切换及账号菜单的跟随系统开关。颜色集中在app/theme.css，图表也使用同一语义变量，图片不反色。

app-updates.tsx仅检查构建版本，与record-updates.tsx的健康记录变化分开。可见时90秒、恢复前台检查；不缓存的版本接口不带身份或旧部署标记。草稿确认复用confirmation及draft-guard；approvePageRefresh只允许用户明确批准的这次刷新跳过重复离开弹窗，不存健康草稿。

DailyRecords／DailyRecordRow及RecordHistory提供三页最近记录的统一标题、44px描边操作和历史展开，业务页面不得再用“所有按钮”高优先级样式覆盖。RecordTrendPanel支持六项读数按6／3／2退让、数值基线对齐；电脑图表标题、单位与图例同排，手机图例另行。控件边界使用主题control-border，深浅两套均须核对对比。

RecordTrendPanel的metricVariants传入当前区间已算好的各日读数字符串，按数字实际字体缓存最长宽度；列数不随鼠标选日反复变化，换区间或窗口再测量。不生成或修改健康读数。

总览通过RecordTrendPanel的可选statusInDate将短提示放入既有日期行，其他页面默认行为保持。SelectedDateHeading的可选status只提供同排内容，不扩展业务计算。

chart-selection-marker.tsx及同名CSS集中管理ChartSelectionColumn底纹／辅助线／柱图短标记、ChartSelectionPoint空心高亮圈。永久SVG图层100ms（cubic-bezier(.2,0,0,1)）短过渡，中断时取消旧动画并续接当前视觉位置；列层位于数据之前、裁在绘图区，底纹与线使用同一变换。触屏、首次定位、区间／尺寸更换和减少动态效果直接就位，首次450ms／数据更新200ms动画仍由use-chart-motion独立负责；use-chart-date-selection.ts区分鼠标临时预览、点击保持、键盘焦点内选择与触屏持久选择。完整趋势面板负责离开及焦点边界，查看入口先捕获目标日期。


record-detail-actions.tsx在已展开的餐次／运动中统一编辑及更多删除；删除保留业务原有确认，Escape先关闭更多并返回焦点，外部点击或焦点离开关闭菜单。Disclosure继续只在展开后挂载完整内容。

Inspector的titleParts仅为只读日期详情按完整文字块换行，stableScroll只在该类详情预留滚动条空间；其他填写窗口沿用原布局和草稿保护。极窄或放大视口中标题与关闭按钮分行，44px关闭操作保持可到达。

workspace-skeleton.tsx复用正式卡片、语义色图例与图形槽位，空数据时绘制明确的网格／图形占位；已有真实缩略图先到目标，数据接管不二次入场。导航不注册全局加载提示，保留8秒重试及保存／认证反馈。surface-motion显式区分sheet／drawer／anchored／center；底部面板不读取来源位置，退出先保持末态再撤销动画。

workspace-frame.tsx提供固定首页动作及桌面标题，手机返回并入DashboardHeader，不额外占行。SkeletonBlock裁切数字占位与扫光，EntrySurface先开录入面板，原表单portal接管并保留草稿上下文。Inspector自定义标题关闭按钮复用InspectorCloseButton；onSavedCloseReady仅在服务器确认保存成功后用于退出，普通关闭继续检查忙碌和草稿。饮食／消耗在同一Inspector中切换查看与编辑，不叠加两个dialog。

草稿登记、关闭回调和InspectorBusyContext在首绘前同步；portal转交忙碌Context，自定义标题使用同一关闭按钮，避免保存尚未完全结束时看似能关闭却没有反应。助手外壳固定在视口许可的高度，数据就绪只更新内部内容。

电脑饮食／消耗／身体的RecordTrendPanel读数复用现有主页／身体暖雾卡片材质、圆角、高光及阴影：常规横排，主卡内显示对应的真实供能环图、静息／活动比例或晨重小折线，语义色点与数值一致。骨架共用同一结构，宽度不足按整个区间的实际文字宽度稳定换行，不缩字；未知与0不伪造比例。手机沿用已验收布局。

主导航第三项为训练，原消耗仍由同一导航分组进入，WorkspaceFrame为训练提供持续页面外壳和标题，不将其识别为身体页。训练与消耗的内容及图表语义保持独立。
