# 项目当前状态

更新日期：2026 年 10 月 4 日。

本文件记录当前实现和验证结果；新会话先读根目录 `handoff.md` 获取最新用户要求与接手顺序。产品边界和阶段顺序以 `product.md`、`milestones.md` 为准；页面细节以 `interface.md` 为准。开始修改前仍需阅读根目录 `README.md`、`AGENTS.md` 和目标目录最近的 `README.md`。

## 已实现

- `code-study.md` 按页面上可见的功能解释代码用途、识别线索和修改影响，包含样式的具体例子、登录与数据流程、修改位置速查和检查入口。首页、配置、测试与维护脚本有中文注释，CSS 按功能分组展开。
- 数据层使用 PostgreSQL / Neon、Drizzle 与 Better Auth。版本化 migration 建立内部账号与会话表，密码保存 scrypt 哈希；公开注册关闭。`/dashboard` 每次请求验证当前身份并提供退出登录，当前只显示账号与业务模块空状态。配置与维护命令见 `auth-setup.md`。
- 共用数据库入口将 Node 进程的单地址连接尝试时限设为至少 1000ms，避免跨区域网络在默认 250ms 下提前终止可用连接。数据库连接时限为 15 秒，保留环境中更长的单地址设置；修改配置或连接代码后需重启开发进程以更新缓存连接池。
- 运行框架为 Next.js 16.3.7 App Router、React 19.3、TypeScript 和 Tailwind CSS 4。动画使用浏览器内置 rAF、HTMLVideoElement 和 WebGL API，没有新增运行时依赖。
- 素材就绪后的封面显示 Discipline / Nutrition、Drive / Build yourself、Effortless / AI logging 三组两级英文排版。轻量 Manrope 标题为暖 ivory，IBM Plex Mono 微标签为低饱和暖金，两款字体本地加载。标题沿静态轨迹的三个节点对齐，短引线连接节点，位于人物下层且不随鼠标移动；转身前 200ms 淡出，倒放最后 200ms 恢复，登录与认证阶段隐藏。手机将文字横排在底部安全区上方，以细轴连接三个节点；键盘入口获焦时位于文字上方。reduced motion 随全程 180ms 淡入淡出。标题表达产品方向；饮食记录和 AI API 尚未实现。
- 首页是深石墨色的中央人物舞台，躯干后方有微弱暖金环境光与宽幅暖色层次，侧下方叠加极淡 petrol；文字和控件使用暖象牙白与哑金。第一屏显示左上角 Logo、居中人物和左下角 SCROLL TO ENTER；提示与 Discipline 共用 7% 左边距。提示为 IBM Plex Mono 8.5px 暖金文字、75% 透明度与 1×26px 细轨道，7px 动标每 1.6s 轻移 12px。仅在图片就绪、INTRO、宽度超过 700px 且支持精细指针悬停时显示。停在 INTRO 时持续显示，鼠标移动或未触发播放的输入不会隐藏；离开 INTRO 后 120ms 淡出，每次倒放完整回到 INTRO 都重新显示。加载期间的操作不影响回到首屏后的显示。加载与失败文字独立保留。
- 人物外层支持极弱反向鼠标视差：INTRO 最大水平 6px、垂直 4px，朝鼠标方向倾转最多 0.6° / 0.3°。90ms 时间常数跟随，静止 180ms 后以 600ms smoothstep 回中，静止后停止 rAF。正放、倒放和最终过渡暂停联动，播放开始时在 100ms 内回中；LOGIN_READY 未填写时与 FINAL 输入框失焦时允许半幅联动，只接收新的鼠标移动。Logo、背景、Login 和提示不随人物移动；触屏、窄屏、reduced motion、窗口失焦及页面隐藏均归零，鼠标离开舞台缓慢回稳。
- 页面滚动区域约 155vh，视觉舞台以 100svh sticky 固定在视口中。桌面和窄屏表单均位于液态尾部前方，保留肩背与腰线；只显示 Email、Password、下划线和 `ENTER`。暖烟色衬底使用 10px 背景模糊，边缘渐隐，没有外框、标题、说明或实心按钮。ENTER 为 15px 哑金文字与短下划线，禁用时仍保持可辨认；表单按视口高度向尾部下方定位。
- `PRE_LOGIN_FRAMES` 仅包含原来的 1.png 与 12.png 静态端点，`FINAL_FRAME` 独立指向 13.png。中间动作使用 `golden-turn-1s-v6.mp4` 生成的 60 帧播放视频，页面按 2 倍速在 500ms 内完成转身；正倒放共用同一时间游标，中途可反向，同方向惯性不重启。静态首尾及第 13 张的校准、鼠标联动与认证流程保持原有行为。
- 状态为 INTRO、FORWARD_ANIMATING、LOGIN_READY、REVERSE_ANIMATING、AUTHENTICATING、FINAL_TRANSITION、FINAL。滚轮在 250ms 内同方向累计 44px，触控累计 40px 后选择目标 0 或 1；手势不提供播放进度。监听在认证开始时暂停，失败时恢复，滚动边界不会阻止方向触发。
- 视频使用逐帧关键帧以便双向寻帧；未完成的寻帧合并到最新目标，黑色背景以 WebGL 转为透明 Canvas。首尾各 40ms 与原图按互补权重混合，原有隔离人物组和 `plus-lighter` 合成继续使用，背景与表单保持独立。播放文件为 960×1440，制作入口为 `scripts/prepare-turn-video.sh`。
- Login 的透明度与位移直接映射 `animationProgress`：前 60% 时间隐藏，接近背面时在最后 200ms 淡入并上移 16px，Frame 12 完整进入。表单本身不缩放或模糊，倒放同步隐藏，只有 LOGIN_READY 可提交。首次聚焦 Email 或 Password 后以 180ms 回中并锁定整个 LOGIN_READY；切换字段、失焦、点击空白或移动到 ENTER 都不解除。完整倒放回 INTRO 或进入 FINAL 后解除阶段锁定，FINAL 的输入焦点仍暂停联动。Email 和 Password 在倒放后仍保留于组件内存。
- 停在 12.png 且两项输入非空时，点击 Enter 进入 AUTHENTICATING 验证账号，禁止重复提交与方向输入；验证成功后再进入 700ms 的 FINAL_TRANSITION，交叉过渡到 13.png，伴随轻微 scale / blur。若快速提交时回中未完成，立即归零再开始过渡，不增加等待时间。最终过渡开始后拒绝方向输入并移除手势监听；最终动画结束事件触发后进入 `/dashboard`。失败显示中文提示并返回 LOGIN_READY，密码不保存到浏览器持久存储。真实账号、scrypt 凭据哈希与会话保存在 PostgreSQL / Neon。
- 运行时三张静态 PNG 通过静态导入设置 Next.js `preload` 并全部解码，视频以 `preload="auto"` 提前准备。全部素材就绪后才启动播放，加载期间的最近方向会自动执行；图片或视频失败都保持原始首帧并显示刷新提示。
- 1、12、13 的原始 PNG 与桌面、移动端校准保持不变；其他原图保留为素材，不再加载。视频首尾有额外画布留白，独立按头顶和尾滴匹配静态端点，参数见 `turn-video.ts`；原图测量与视频校准见 `frame-calibration.md`。
- SCROLL 提示仅用于视觉引导；键盘用户可通过聚焦时才显示的“进入登录”入口触发，完成后自动聚焦 Email 并锁定居中。页面方向键、PageUp / PageDown、Home / End 和 Space 支持双向播放，输入框、按钮及可编辑内容中的键盘操作不会改变动画。手机键盘改变视口不会自动倒放。
- reduced motion 保留双向交互：180ms 首尾 crossfade，Login 跟随全程进度仅淡入淡出；Enter 最终过渡为 240ms，省略人物位移、缩放、模糊效果。SCROLL 动标保持静止，离开首屏时提示立即隐藏，无鼠标联动。

## 代码入口与维护位置

| 文件 | 当前职责 |
| --- | --- |
| `src/app/page.tsx` | 让 `/` 显示首页人物与登录体验。 |
| `src/app/home-experience.tsx` | 协调状态、连续时间线、静态图解码与视频就绪、首屏常驻提示、鼠标能力及焦点锁定，协调认证与动画结束后的导航。 |
| `src/app/home-intro-backdrop.tsx` | 封面三组标题与微标签、共享锚点的轨迹和节点，独立于人物视差与透明合成。 |
| `src/app/hero-font.ts`、`public/fonts/` | Hero 本地字体变量、字体资源、来源与完整许可证。 |
| `src/app/figure-motion.ts` | 人物外层视差、时间相关跟随、归稳与暂停恢复；不改变帧时间线。 |
| `src/app/use-direction-trigger.ts` | 双向滚轮、触控及键盘意图；方向阈值和惯性处理。 |
| `src/app/home-timeline.ts` | rAF 自动播放与反向、视频与静态端点的交叠权重、封面背景与 Login 显示映射及持续时间。 |
| `src/app/turn-video.ts` | 视频寻帧、透明 Canvas 合成、首尾校准与资源清理。 |
| `src/app/frame-config.ts` | `PRE_LOGIN_FRAMES`、`FINAL_FRAME`、静态导入和 `FRAME_CONFIG` 的逐帧对齐值。 |
| `src/app/body-sequence.tsx` | 叠放三张静态图与视频 Canvas，准备播放素材。 |
| `src/app/login-overlay.tsx` | 输入、非空按钮条件、焦点回调、认证中禁用与中文错误。 |
| `src/app/home-header.tsx`、`src/app/globals.css` | Logo、舞台、提示、人物外层变换、表单、最终过渡和响应式样式。 |
| `src/app/home-timeline.test.mjs` | 半秒时间线、模拟 60/120Hz 三档速度、手势、反向、惯性、视频帧索引和异步寻帧及 reduced motion 单元测试。 |
| `src/app/figure-motion.test.mjs` | 视差幅度、模拟 60/120Hz 跟随、回中、暂停恢复、连续接续和资源清理。 |
| `tests/home-experience.browser.mjs` | 提示、视差、焦点锁定、能力降级、四种视口端点校准、三档速度、真实视频帧、截图像素、A–E、手机手势、键盘及实际图片解码验收。 |
| `docs/frame-calibration.md` | 当前素材的测量标记、离线拟合方法及校准残差；浏览器检查读取其 JSON 标记数据。 |
| `docs/code-study.md` | 文件用途、界面与样式关系、登录和数据流程、修改位置及检查入口。 |
| `src/features/auth/server.ts`、`auth.ts`、`client.ts` | 服务端身份验证、统一 Better Auth 配置和浏览器认证请求。 |
| `src/features/auth/provision.ts`、`scripts/create-account.mts` | 内部账号创建、scrypt 哈希、事务与重复保护。 |
| `src/db/schema.ts`、`drizzle/`、`scripts/migrate.mts` | PostgreSQL 表、版本化 migration 与执行入口。 |
| `src/app/dashboard/page.tsx` | 受保护的主页与当前账号，退出调用正式认证接口。 |
| `tests/auth.browser.mts` | 隔离数据库与 production 服务上的真实认证和动画顺序测试。 |
| `next.config.ts` | 开发环境允许 `127.0.0.1` 访问 Next.js 客户端资源。 |

替换静态图片时保留编号，更新 `frame-calibration.md` 与 `frame-config.ts`；替换视频时更新制作脚本、帧率和帧数、视频端点校准，重新生成播放文件。原始上传视频保持不变，第 13 张继续独立于转身时间线。

## 验证与本地查看

- lint、typecheck、41 项单元与认证集成测试、production build 通过。认证测试使用独立内存 PostgreSQL，覆盖正常、无效、重复、跨账号、过期、撤销、来源检查与限流。
- 真实 Neon 的只读连接诊断通过：共用数据库入口连续建立三次新连接，执行 `SELECT 1` 和零行账号表结构查询；更长的进程单地址尝试设置能够保留。未读取账号内容或写入真实数据库。
- 独立 production 浏览器验收通过：实际登录失败重试、认证中防重复与方向锁定、原有 700ms / 240ms 动画结束先于主页请求、账号会话隔离和退出，以及完整首页的手势、焦点、四种视口、冷启动和失败分支。
- Hero 排版的浏览器验收通过：本地字体就绪后，四种视口无裁切、避开人物与左下角 SCROLL；桌面引线连接节点、标题沿节点对齐，手机键盘入口位于文字上方。背景前 200ms 实际淡出，完全隐藏时移出辅助技术，倒放恢复，reduced motion 随全程淡出，加载及失败时隐藏。桌面、手机、窄屏、横屏封面及桌面、手机登录截图已复核。
- v6 的 2 倍速浏览器验收通过：500ms 时间线的实测约 517ms，真实下滚正放 / 上滚倒放含事件与采样延迟约 540ms / 524ms，分别采样到 16 / 16 个不同解码帧，方向正确；中途反向与端点衔接通过。源文件一秒、60 帧，实际可见帧数随浏览器性能与刷新率变化，没有执行 120Hz 实机验收。
- Canvas Alpha 检查通过：视频四角全透明，人物实体保留；黑底不会遮盖原舞台。
- 39 组交叠截图比较通过，涵盖桌面、手机、reduced motion、最大视差与视频尾端；最大平均 RGB 误差为 0.635/255，低于 2/255。临时使用 `normal` 的变暗反例误差约 38/255，确认检查能识别亮度问题。
- 1440×900、390×844、320×568、844×390 的原始静态首尾无裁切，最大加权校准 RMS 分别为 3.73 / 2.81 / 2.02 / 1.41px。视频尾端与第 12 张、登录态在桌面截图中复核，人物位置及表单保持衔接。
- 冷启动分别拦截三张静态图和视频，确认未就绪时保持首帧，释放后自动执行排队方向；后续正倒放不新增图片请求。图片或视频加载失败均保持首帧并显示错误提示。
- Playwright 与浏览器工具仅临时安装于 `/tmp`，未增加项目依赖；复现入口见 `tests/README.md`。本地页面为 `http://localhost:3000` 或 `http://127.0.0.1:3000`，其他转发域名需要加入 `next.config.ts` 的 `allowedDevOrigins` 并重启服务。

## 尚未完成

- 首页视觉仍待产品评审；人物素材和对齐值可继续调整。
- 健康记录尚未接入；当前主页只展示账号与模块空状态。多实例部署前需要将进程内存登录限流改为共享存储。数据库与内部账号接入步骤见 `auth-setup.md`。
- 饮食、运动、身体指标、看板、Excel 导入和外部 AI API 仍按 `milestones.md` 的顺序实现。网页与 AI API 继续共享 feature 规则；AI Token 尚未实现。
