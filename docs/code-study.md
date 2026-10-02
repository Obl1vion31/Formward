# Formward 代码自学指南

学习基准日期：**2026 年 10 月 3 日**。

本文按照当前仓库里的实际代码讲解，从文件阅读顺序、React 写法、人物图片配置，到 CSS、动画时钟、鼠标和键盘事件、测试与修改方法。建议一边打开页面，一边在编辑器中对照对应文件。后续代码或参数变化时，本文中的参数表和行为说明也应同步更新。

快速跳转：

- [推荐阅读路线](#reading-route)：按文件顺序学习。
- [React 与 TypeScript 写法](#language-basics)：理解 JSX、props、state、ref、effect。
- [CSS 逐组讲解](#css-guide)：理解颜色、尺寸、位置、合成与媒体查询。
- [首页状态与数据流](#home-coordination)：继续阅读转身、方向输入和鼠标系统。
- [参数索引](#parameters)：直接找“想改什么”对应的文件与数值。
- [修改练习](#exercises)：按具体示例实践。
- [测试与验收](#verification)：知道修改后如何检查。
- [调试方法](#debugging)：通过开发者工具定位问题。

## 1. 先知道当前项目做到哪里

当前可以运行的是首页人物动画与登录界面的视觉交互。页面使用 13 张人物图片，滚动负责选择转身方向，独立时间线自动播放，表单跟着转身进度出现。鼠标可以造成很小的视差，输入框聚焦后人物回中。

登录表单现在只在组件内存里保存输入值；点击 ENTER 播放第 12 张到第 13 张的过渡。代码没有请求真实登录接口，也没有数据库读写、会话创建或业务页面跳转。

`src/features`、`src/db`、`src/components` 和 `drizzle` 已有目录及 README，但还没有这些功能的运行代码。README 里的数据库、饮食、运动、AI API 等是架构方向，不能把目录存在理解成业务已经完成。

当前实际安装的运行依赖是 Next.js、React 和 React DOM。Tailwind、TypeScript、ESLint 属于开发依赖。Better Auth、Drizzle、数据库驱动、shadcn/ui、Vitest 和 Playwright 尚未成为项目依赖；浏览器验收使用临时安装的 Playwright。判断是否安装某个库，以 [package.json](../package.json) 为准。

<a id="reading-route"></a>

## 2. 推荐阅读路线：从哪里看到哪里

第一遍先看页面如何组成，不必从最复杂的动画公式开始。第二遍再沿着一次滚动事件看数据如何流动。

| 顺序 | 打开文件 | 本轮重点 | 看懂后的目标 |
| --- | --- | --- | --- |
| 1 | [根 README](../README.md)、[当前状态](status.md)、[页面方案](interface.md) | 如何启动、当前行为、设计边界 | 能打开页面并说出一次滚动和 ENTER 分别做什么 |
| 2 | [package.json](../package.json)、[next.config.ts](../next.config.ts)、[tsconfig.json](../tsconfig.json) | 命令、开发来源、类型检查 | 分清源码、工具配置与构建产物 |
| 3 | [layout.tsx](../src/app/layout.tsx) → [page.tsx](../src/app/page.tsx) | 全局外壳与 `/` 路由 | 明白首页入口在哪里 |
| 4 | [home-experience.tsx](../src/app/home-experience.tsx) 的最后一个 `return` | DOM 结构、组件和类名 | 找到人物、表单、Logo、SCROLL 各自的位置 |
| 5 | [home-header.tsx](../src/app/home-header.tsx)、[login-overlay.tsx](../src/app/login-overlay.tsx) | JSX、props、受控输入、回调 | 知道文案、输入值和按钮条件由谁控制 |
| 6 | [frame-config.ts](../src/app/frame-config.ts) → [body-sequence.tsx](../src/app/body-sequence.tsx) | 素材、帧顺序、对齐值、CSS 变量 | 能定位某张人物图的大小和位置配置 |
| 7 | [globals.css](../src/app/globals.css) 从上往下 | 色板、人物三层、表单、提示、媒体查询 | 能通过类名找到视觉参数 |
| 8 | [use-direction-trigger.ts](../src/app/use-direction-trigger.ts) → `requestDirection` | 意图、阈值、目标端点 | 明白为什么滚一下就能自动播完 |
| 9 | [home-timeline.ts](../src/app/home-timeline.ts) → `renderProgress` | 时间游标、帧权重、表单浮现 | 能区分总播放时间和相邻帧交叠时间 |
| 10 | [figure-motion.ts](../src/app/figure-motion.ts) → `updateMotion` / `focusInput` | 视差、回中、状态锁定 | 能调整鼠标幅度与响应速度 |
| 11 | 两份源码旁的单元测试 → [浏览器验收](../tests/home-experience.browser.mjs) | 模拟时间与真实截图 | 能判断改动之后应该检查什么 |
| 12 | [目录检查脚本](../scripts/check-structure.sh) 与其他目录 README | 工具和后续业务边界 | 不会把工具文件或预留目录误当作页面代码 |

每一轮阅读可以回答三个问题：这个文件接收什么、它改变什么、结果交给谁。遇到参数先在本文第 14 节查位置，再回到原文件确认上下文。

## 3. 文件类型与目录地图

### 3.1 文件后缀是什么意思

| 后缀 / 文件 | 当前项目中的用途 | 怎么读 / 改 |
| --- | --- | --- |
| `.ts` | 带类型的 TypeScript，常用于配置、计算和控制器 | 先看 `export`，再看函数输入与返回值 |
| `.tsx` | TypeScript 加 JSX，用来描述 React 界面 | 先看 `return` 的界面，再看 state、事件和 effect |
| `.css` | 布局、颜色、字体、视觉效果及 CSS 动画 | 从 JSX 的 `className` 搜索对应选择器 |
| `.mjs` | 明确使用 ES module 的 JavaScript；当前主要是配置与测试 | 看 `import`、`export` 和测试入口，不依赖 TypeScript 类型 |
| `.json` | 严格的数据 / 工具配置格式 | 属性名加双引号；不能写 `//` 注释或多余尾逗号 |
| `.md` | 产品说明、学习材料与维护约定 | 不会直接变成页面上的文字 |
| `.sh` | Bash 维护脚本 | 在终端执行，通常与网站运行逻辑无关 |
| `.png` | 带透明度的人物素材 | 原图内容、清晰度和姿态不由 CSS 重新生成 |
| `pnpm-lock.yaml` | 包管理器记录的精确依赖解析结果 | 安装命令维护，通常不手改 |
| `next-env.d.ts` | Next.js 生成的类型声明入口 | 不当作页面源码编辑 |
| `tsconfig.tsbuildinfo` | TypeScript 增量检查缓存 | 可以重新生成，不是可调参数 |
| `*.png:Zone.Identifier` | 仓库中现有的文件来源附带信息 | 当前首页没有导入或读取这些文件，不控制显示效果 |

### 3.2 完整职责地图

```text
Formward/
├─ package.json                  命令和依赖
├─ pnpm-lock.yaml                精确依赖版本
├─ .nvmrc                        Node.js 版本
├─ next.config.ts                Next.js 开发配置
├─ tsconfig.json                 TypeScript 配置
├─ eslint.config.mjs             代码检查规则
├─ postcss.config.mjs            Tailwind 的 CSS 处理入口
├─ .gitignore                    不纳入版本控制的内容
├─ AGENTS.md                     仓库协作与安全约定
├─ PROJECT_BOOTSTRAP.md           技术初始化参考
├─ src/app/
│  ├─ layout.tsx                 HTML 外壳、metadata、全局 CSS 引入
│  ├─ page.tsx                   根路径页面
│  ├─ home-experience.tsx        首页状态与各系统协调
│  ├─ home-header.tsx            Logo 的 JSX
│  ├─ frame-config.ts           图片、帧顺序、桌面 / 手机对齐
│  ├─ body-sequence.tsx          挂载全部人物帧
│  ├─ login-overlay.tsx          表单输入、校验、提交与焦点回调
│  ├─ globals.css                视觉样式、响应式、最终 CSS 动画
│  ├─ use-direction-trigger.ts  滚轮 / 触摸 / 键盘方向识别
│  ├─ home-timeline.ts           转身时间线、帧权重、表单进度
│  ├─ figure-motion.ts           鼠标视差与回稳控制器
│  ├─ home-timeline.test.mjs      时间线与方向识别单元测试
│  └─ figure-motion.test.mjs      视差与回稳单元测试
├─ src/features/                 后续业务功能，当前只有职责 README
├─ src/db/                       后续数据库连接和 schema
├─ src/components/               后续跨页面复用组件
├─ public/images/                1.png 至 13.png
├─ public/icons/                 公开图标目录，当前有 README
├─ tests/home-experience.browser.mjs  真实浏览器验收
├─ scripts/check-structure.sh    自有目录 README 检查
├─ docs/                         产品、界面、架构、校准和本指南
├─ data/imports/                 本地原始导入文件，不是网站资源
├─ data/exports/                 本地报告与导出
└─ drizzle/                      后续数据库迁移历史
```

`node_modules` 是安装的第三方代码，`.next` 是 Next.js 生成的开发 / 构建内容。学习当前功能时主要读 `src`，不从这两个目录里的产物开始改。确实需要确认当前版本 API 时，可以读 `node_modules/next/dist/docs/` 的安装版文档。

`docs/20261002Prompt.md` 和 `docs/20261002Prompt2.md` 保存需求输入，不参与程序执行。当前已经采用的参数和交互以实际源码、`interface.md`、`status.md` 为准。

## 4. 页面到底如何组成

### 4.1 组件依赖

```mermaid
flowchart TD
  L[layout.tsx 全局外壳] --> P[page.tsx 根路径]
  L --> C[globals.css 全局样式]
  P --> H[HomeExperience 总控]
  H --> HH[HomeHeader Logo]
  H --> B[BodySequence 人物帧]
  H --> LO[LoginOverlay 表单]
  B --> F[frame-config.ts 图片与对齐]
  H --> D[useDirectionTrigger 方向输入]
  H --> T[home-timeline.ts 转身时钟]
  H --> M[figure-motion.ts 鼠标时钟]
```

### 4.2 实际 DOM 层级

在浏览器开发者工具的 Elements / 元素面板中，可以按这个顺序找到结构：

```text
html
└─ body
   └─ main.home-page                   data-phase / data-images-ready / --final-duration
      ├─ header.home-header
      │  └─ div.home-logo              formward + 金色圆点
      └─ section.home-scroll           页面滚动空间
         └─ div.home-stage             sticky 舞台、环境背景
            ├─ div.figure-motion       鼠标位移 / 倾转
            │  └─ div.body-sequence    人物隔离合成组
            │     ├─ div.body-frame.body-frame-intro × 12
            │     │  └─ img            各自的图片
            │     └─ div.body-frame.body-frame-final
            │        └─ img            第 13 张
            ├─ div.login-overlay       表单的出现进度和位置
            │  └─ form.login-form      烟色衬底、标签、输入、ENTER
            ├─ div.scroll-hint         SCROLL、鼠标外框和滚轮
            ├─ div.image-status        加载时才存在，失败时保留
            └─ button.keyboard-entry   只在键盘聚焦时可见
```

注意 `figure-motion` 只包人物。Login、SCROLL、状态信息与它并列，Logo 在舞台之外。因此人物微微移动时，其他 UI 不一起移动。

“第一屏”和“第二屏”主要是同一个舞台的不同交互阶段；这里没有两个分别挂载人物的页面。前后图片、表单都在同一套 DOM 中，只改变透明度、位置和可操作状态。

<a id="language-basics"></a>

## 5. 先掌握代码里经常出现的写法

### 5.1 `import`、`export` 与路径

```tsx
import HomeExperience from "./home-experience";
import { PRE_LOGIN_FRAMES } from "./frame-config";
import type { CSSProperties } from "react";
```

`./` 表示当前文件所在目录，`../` 表示上一级。默认导出使用第一种导入形式，具名导出写在花括号里。`import type` 只引入类型，编译后不形成运行时变量。

`tsconfig.json` 配置了 `@/* → ./src/*` 的路径别名，但当前首页主要使用相对路径。不必为改参数统一改写导入方式。

### 5.2 JSX 与 props

```tsx
<LoginOverlay
  accessible={accessible}
  canSubmit={phase === "LOGIN_READY"}
  onEnter={enter}
/>
```

大写名称是组件，小写 `div`、`input` 是 HTML 元素。组件上的属性是 props，父组件把值或函数传给子组件。`{}` 内是 JavaScript 表达式；`"LOGIN_READY"` 是字符串；`phase === "LOGIN_READY"` 得到布尔值。

`onEnter={enter}` 是传递函数，子组件需要时调用它；写成 `onEnter={enter()}` 会在渲染时立即调用，含义不同。

JSX 用 `className` 表示 HTML 的 `class`，用 `htmlFor` 关联 label 与 input 的 `id`。JSX 标签内部注释写成 `{/* 注释 */}`，普通 TypeScript 代码中使用 `//` 或 `/* */`。

### 5.3 `useState` 与 `useRef`

```tsx
const [phase, setPhase] = useState<Phase>("INTRO");
const phaseRef = useRef<Phase>("INTRO");
```

state 的变化让 React 安排重新渲染，用来更新 JSX，比如 `data-phase`。ref 的 `.current` 可以直接改变，改变本身不会触发 React 渲染，适合 DOM、计时器、控制器和事件回调中需要立即读取的值。

这里同时使用 `phase` 和 `phaseRef`：事件先通过 `phaseRef.current` 看到最新阶段，React 随后通过 `phase` 更新界面属性。`changePhase` 同时维护两者。只改其中一个，可能造成事件认为已进入最终态，但 CSS 仍按旧阶段显示的不同步问题。

`stageRef`、`overlayRef` 等绑定到标签的 `ref` 属性，挂载后 `.current` 指向实际 DOM 元素。`motionRef`、`timelineRef` 保存的是控制器对象，不是元素。

### 5.4 `useEffect` 与清理

```tsx
useEffect(() => {
  window.addEventListener("blur", blur);
  return () => window.removeEventListener("blur", blur);
}, [updateMotion]);
```

effect 在客户端组件提交后建立浏览器交互。依赖数组里的值变化时，React 清理上一轮 effect 后建立下一轮；组件卸载时也执行清理。开发环境的严格模式还可能执行额外的建立 / 清理检查，所以不能省略清理。

在当前代码中，清理负责移除事件、取消 rAF 和 timeout，并用 `active = false` 阻止已卸载组件收到异步 decode 结果。漏掉清理容易导致同一个操作响应两次或离开页面后仍在运行。

### 5.5 `useCallback`、闭包和控制器

`useCallback` 根据依赖保留函数引用，方便 effect 使用稳定的回调；它不会自动调用函数，也不是把函数结果缓存起来。

`createProgressTimeline` 和 `createFigureMotion` 返回带方法的对象。函数内部的变量由这些方法共享，这叫闭包。它们在创建时初始化一次，后续 `playTo`、`move`、`reset` 改变同一份内部状态。

当前每帧数值直接写入 DOM style，React 只处理阶段、就绪、错误与输入等变化。这是选择性的优化，不代表所有 React 项目都应该直接改 DOM。

### 5.6 类型与常见符号

| 写法 | 当前代码中的含义 |
| --- | --- |
| `type Phase = "INTRO" \| ...` | 只允许指定的阶段字符串 |
| `TargetProgress = 0 \| 1` | 目标只能是起点或终点，连续进度本身可以是小数 |
| `number \| null` | 数字或空值，例如还没有待执行 rAF |
| `as const` | 保留数组元素的具体字面量类型，防止变成宽泛的 `string[]` |
| `Record<FramePath, FigureFrame>` | 每个合法帧路径都应有完整配置 |
| `as CSSProperties` | 类型断言，让 TypeScript 接受自定义 CSS 属性；不转换实际数值 |
| `?.` | 可选链，对象不存在时不继续访问 / 调用 |
| `??` | 只在左侧为 `null` 或 `undefined` 时使用右侧默认值 |
| `!` 在表达式后 | 非空断言，只影响类型检查，不是运行时校验 |
| `!` 在表达式前 | 布尔取反，例如 `!accessible` |
| `...pose` | 展开对象内容，创建副本 |
| `map` | 把每个元素转换成另一个元素；这里把帧路径变成 JSX |
| `findIndex` | 找到第一个满足条件的位置；时间线用它定位当前段 |
| `Promise.all` | 等全部异步任务成功；任一失败会进入 catch |

## 6. 页面入口和三个显示组件分别控制什么

### 6.1 `layout.tsx`：共有外壳

它引入 `globals.css`，定义浏览器标签标题和页面描述，并输出 `<html lang="zh-CN"><body>{children}</body></html>`。`children` 是 Next.js 放入的当前页面。

改浏览器标签标题找 `metadata.title`；改 SEO 页面描述找 `metadata.description`；改全站字体找 CSS 的 `body`。Logo 和人物不是在 `metadata` 中画出来的。

### 6.2 `page.tsx`：`/` 路由入口

根目录的 `src/app/page.tsx` 对应网站根路径 `/`。当前只返回 `<HomeExperience />`，便于把路由入口与复杂交互分开。

页面和布局默认是 Server Components。`HomeExperience` 顶部的 `"use client"` 建立客户端边界，允许使用 state、effect 和浏览器事件。客户端组件仍可参与首屏 HTML 预渲染；不能把 `"use client"` 理解为“服务器完全不处理它”。`window`、`document` 等访问放在 effect、事件或客户端控制器调用中。

### 6.3 `home-header.tsx`：Logo

JSX 里只有固定的 `formward` 与单独的 `<span>.</span>`。金色圆点对应 `.home-logo span`，整个 Logo 对应 `.home-logo`，外层位置对应 `.home-header`。

基础透明度 `.78`，登录就绪 / 最终过渡 / 最终状态为 `1`。这些由 CSS 的 `[data-phase="..."]` 选择器控制，组件没有独立播放时钟。

### 6.4 `body-sequence.tsx`：人物帧结构

它遍历 `PRE_LOGIN_FRAMES`，一次生成 12 个 `body-frame-intro`，再独立生成 `body-frame-final`。每一帧内部是一张 Next.js `<Image>`。

`key={path}` 给 React 稳定标识。`data-intro-frame={index}` 从 0 开始，方便父组件和测试寻找滚动序列；`data-frame-path={path}` 表示图片对应的配置键，便于调试。

所有帧都挂载在 DOM 中，正常播放通过 opacity 决定可见帧。不是每隔几十毫秒给同一个 `<img>` 换一次 `src`。

`frameStyle` 把 `FRAME_CONFIG` 转成六个 CSS 自定义属性。它负责连接配置与样式，不计算动画。`preload` 负责提前请求，`decode()` 的整体等待在 `HomeExperience` 中。

### 6.5 `login-overlay.tsx`：输入和提交

| prop / 变量 | 谁提供 / 谁控制 | 作用 |
| --- | --- | --- |
| `overlayRef` | HomeExperience | 父级找到表单外层，写显示进度 |
| `accessible` | HomeExperience | 控制 inert 与 aria-hidden |
| `canSubmit` | HomeExperience | 只有 LOGIN_READY 可以提交 |
| `onEnter` | HomeExperience | 提交通知，触发最终过渡 |
| `onInputFocus` / `onInputBlur` | HomeExperience | 把焦点变化交给人物联动系统 |
| `email` / `password` | LoginOverlay 的 state | 保存本轮输入值 |
| `canEnter` | LoginOverlay | 阶段允许且两项非空时启用按钮 |

输入框是受控输入：`value={email}` 展示 state；`onChange` 把实际输入更新回 state。倒放时表单隐藏但组件仍挂载，所以值保留；刷新重新挂载后恢复空值。

`handleSubmit` 调用 `event.preventDefault()`，阻止浏览器默认提交和刷新，再在 `canEnter` 为真时调用父级 `onEnter()`。按钮点击与在表单中按 Enter 共用 `onSubmit`。

当前 `email.trim().length > 0` 只检查去掉首尾空白后非空，password 只检查长度。`type="email"` 与 `inputMode="email"` 帮助键盘和语义，但 `<form noValidate>` 跳过原生格式验证。不能从当前代码推断存在邮箱格式校验、密码正确性判断或真实身份验证。

`accessible` 与 `canSubmit` 含义不同：最终状态下输入框仍可编辑、聚焦，按钮禁止再次提交。`inert` 负责禁止交互与 Tab 进入；`aria-hidden` 控制辅助技术是否读取。单独把 opacity 设成 0 并不会自动禁用输入，因此需要这些属性。

## 7. 图片配置与三层人物变换

### 7.1 `frame-config.ts` 的三种数据

1. 静态导入 `frame1` 到 `frame13`：包含素材地址、原图宽高等 Next.js 图片信息。
2. `PRE_LOGIN_FRAMES` 与 `FINAL_FRAME`：定义哪些图片参加转身、哪张只用于 ENTER。
3. `FRAME_CONFIG`：按路径关联 `image`、`desktop`、`mobile`。

例如当前第一帧：

```ts
"/images/1.png": {
  image: frame1,
  desktop: { scale: 1, x: "0%", y: "1%" },
  mobile: { scale: 0.98, x: "0%", y: "-3%" },
}
```

`image` 决定素材；`scale` 决定逐帧等比缩放；`x` 正值向右、负值向左；`y` 正值向下、负值向上。桌面与手机值分别由 CSS 选择，并不是 JavaScript 根据浏览器名称判断手机。

路径字符串在当前配置中主要是关联键。真正传给 `<Image>` 的是静态导入对象，生成后的 `currentSrc` 可能是 Next.js 优化图片地址，不一定直接显示 `/images/1.png`。

### 7.2 图片尺寸不统一，为什么还能一起播放

当前 1–4、6–9、13 是 1024×1536；第 5 张是 793×1983；10–12 是 887×1774。CSS 给它们统一的基础显示高度、自动宽度，再使用各自的 scale / x / y 校准人体关键点。

统一画布外框并不等于统一人体位置：透明区域大小、头顶位置、躯干中心可能不同。当前校准优先稳定头顶和躯干，保留尾部自然变化。原图标记、拟合公式和残差见 [frame-calibration.md](frame-calibration.md)，该文档的数据还被浏览器测试读取。

### 7.3 三层变换各管一件事

| 层 | 控制来源 | 主要作用 |
| --- | --- | --- |
| `.figure-motion` | `figure-motion.ts` → 四个 CSS 变量 | 整个人物组的鼠标位移与倾转 |
| `.body-frame` | `frame-config.ts` → 六个 CSS 变量 | 每一帧的居中、平移和缩放校准 |
| `.body-frame-final img` | `final-settle` keyframes | 最终第 13 张的轻微缩放与模糊收敛 |

如果把三个 transform 全写到同一个元素上，容易互相覆盖。当前分层让鼠标移动不改变帧对齐，最终缩放也不覆盖帧的居中定位。

### 7.4 居中与百分比平移怎么理解

```css
.body-frame {
  top: 50%;
  left: 50%;
  transform:
    translate(-50%, -50%)
    translate(var(--frame-x-desktop), var(--frame-y-desktop))
    scale(var(--frame-scale-desktop));
}
```

`top / left: 50%` 把帧元素的左上角放到父层中心；`translate(-50%, -50%)` 再移动自身宽高的一半，实现居中。这里两组百分比基准不同：top / left 参考父层，translate 参考自身。

CSS 变换从右往左应用：先缩放，再进行配置平移，再进行居中平移。配置的百分比平移基于缩放前元素尺寸，不能按舞台宽度计算。例如基础图片高度约 806.4px 时，`y: "1%"` 约移动 8.064px；`x: "1%"` 要按图片自身宽度计算。

完整标记换算以校准文档公式为准。改 x / y 适合修正某一帧，整体放大优先改 CSS 图片高度，避免把每一帧校准值一起乱改。

### 7.5 预加载与解码的分工

```text
静态导入提供尺寸 / 素材地址
    → BodySequence 挂载全部 13 张并设置 preload
    → 浏览器提前请求
    → HomeExperience 对实际 img 调用 decode()
    → Promise.all 全部成功
    → imagesReady = true
    → 可以执行排队的方向输入
```

请求完成与图片可供绘制不是同一个阶段，所以代码等待实际显示图片的 `decode()`。不额外创建一组同路径的 Image 对象来替代实际 DOM 图片的解码结果。

加载时已经下滚，`targetProgressRef` 保存目标 1；全部就绪后自动播放，不需要再滚一次。加载时最新意图变成目标 0，则保持首帧。任一解码失败进入 catch，显示刷新提示，暂不开始动画。

<a id="css-guide"></a>

## 8. `globals.css` 从上往下怎么读

### 8.1 选择器基础

| 选择器例子 | 读法 |
| --- | --- |
| `:root` | 文档根元素，定义共享 CSS 变量 |
| `.home-logo` | class 包含 home-logo 的元素 |
| `.home-logo span` | Logo 里面的 span，当前是金色圆点 |
| `.body-frame img` | 所有帧元素里的实际图片 |
| `.home-page[data-phase="INTRO"] .scroll-hint` | 处于 INTRO 的页面里的提示 |
| `.login-overlay[inert]` | 带 inert 属性的表单外层 |
| `.login-form::before` | 表单前的伪元素，当前画烟色衬底 |
| `.login-form button::after` | 按钮后的伪元素，当前画短下划线 |
| `:hover` | 指针悬停 |
| `:focus-visible` | 浏览器判断需要显示焦点提示的状态，常见于键盘操作 |
| `:disabled` | 控件禁用 |
| `:not(:disabled)` | 排除禁用控件 |
| 多个选择器以逗号隔开 | 同一组声明应用到多个匹配目标 |

伪元素需要 `content` 才生成视觉内容；`content: ""` 可以生成一个空的、能够设置尺寸与背景的装饰层，不需要增加 JSX 标签。

### 8.2 色板、单位和尺寸函数

当前共享色板在 `:root`：

| 变量 | 当前值 | 用途 |
| --- | --- | --- |
| `--graphite` | `#10100f` | 石墨背景 |
| `--warm-white` | `#f0e9dd` | Logo、标签、输入值、焦点入口 |
| `--gold` | `#bea478` | 圆点、ENTER、SCROLL、焦点线 |
| `--line` | `rgba(240, 233, 221, .42)` | 输入下划线 |
| `--muted` | `#a8a195` | 已定义，当前首页未直接引用 |

`var(--gold)` 读取变量。CSS 的 `rgba(..., .42)` 最后一个数是透明度，范围 0–1。`opacity` 则影响整个元素及其合成显示，不只是某个背景颜色。

| 写法 | 含义 / 当前用法 |
| --- | --- |
| `px` | CSS 像素，不必等同设备物理像素 |
| `%` | 随具体属性变化：top / left 通常参考父层，translate 参考自身 |
| `vw` / `vh` | 视口宽 / 高的 1% |
| `svh` | 小视口高度的 1%，减少移动浏览器工具栏变化造成的尺寸跳动 |
| `em` | 当前元素字号的倍数；`.18em` 常用于文字间距 |
| `ms` / `s` | 毫秒 / 秒 |
| `deg` | 旋转角度 |
| `min(340px, calc(100vw - 48px))` | 取较小者，让表单最多 340px，同时给屏幕边缘留空间 |
| `clamp(24px, 4.2vw, 68px)` | 理想值为 4.2vw，但限制在 24–68px |
| `calc(-50% + var(--login-y, 16px))` | 居中平移加上动画偏移，变量不存在时使用 16px |

`padding: 18px 24px 12px` 是上 / 左右 / 下；`margin: 0 0 20px` 是上 / 左右 / 下；四个值按上、右、下、左。`inset: 0` 相当于四边都设为 0，负 inset 可以向外扩展。

### 8.3 页面空间、定位与层级

`.home-page` 最小高度和 `.home-scroll` 高度均为 155vh，提供滚动空间。`.home-stage` 高度为 100svh、`position: sticky; top: 0`，在滚动段内贴在视口顶部。

`fixed` 的 Logo 固定在视口上方；`absolute` 的人物、表单和提示相对于相应定位父层排列；`relative` 的 form 给伪元素一个定位基准。

舞台的 `overflow: hidden` 防止内容溢出。层级大致为人物 0、表单和提示 2、键盘入口 3、Logo 5。`z-index` 只在相应的堆叠上下文里比较，不能把任意两个嵌套元素的数字直接作全局比较。`isolation`、transform 等也会影响分组合成和层级。

背景的 `radial-gradient` 从前往后叠加：中心暖金、宽幅暖光、右下 petrol，最后是石墨实色。中心百分比控制光的位置，ellipse 尺寸控制光的覆盖范围，颜色透明度控制强度，`transparent 85%` 控制衰减范围。手机媒体查询有一套更宽的光区，调背景时需要分别复核。

### 8.4 人物大小与 SCROLL 的位置联动

基础人物图片高度为 89.6svh，最大 1176px；手机为 73.44svh；视口高度不超过 640px 时后面的规则改为 78.4svh。

`.home-stage` 的 `--figure-height` 是**SCROLL 定位参考**，不是控制图片高度的唯一来源。它的基础值为 `min(89.6svh, 1176px)`，低高度规则为 `min(78.4svh, 1176px)`。改桌面人物高度时同步这两个相关位置，避免提示与人物再次脱节。

SCROLL 的纵向位置为 `50% - --figure-height × .11`，横向理想位置为 `50% + --figure-height × .14 + 32px`，外面再通过 clamp 防止越界。数值 `.11` 越大越往上；横向 `.14` 或 `32px` 越大越往右。修改后要重新检查人物边缘与提示间距。

### 8.5 `isolation` 与 `plus-lighter` 为什么一起保留

`frameWeights` 输出相邻两帧的互补透明度，例如 0.5 与 0.5。默认的普通透明度叠放会让后画的帧再衰减下面已画出的帧，交叠中间可能出现额外变暗。

`.body-sequence { isolation: isolate }` 建立独立的人物组，`.body-frame { mix-blend-mode: plus-lighter }` 把互补权重的图像先在组里相加，再与舞台合成。背景、Logo 和 Login 不参与这组帧之间的相加。

两帧互补权重很关键；不能为“更亮”把两帧同时设为 1。也不要随意移除 isolation、把表单放进人物组，或给正常帧增加一套额外 transition。是否恢复变暗，必须通过真实截图检查，不只看透明度之和。

### 8.6 表单：位置、承托与文字

`.login-overlay` 控制整块表单的中心位置、宽度和进度。桌面 `top: 64%`；手机 `67%`；高度 ≤640px 为 `66%`；高度 ≤480px 为 `70%`。因为 transform 包含 `-50%`，top 指的是整体中心附近，不是表单最上沿。增大 top 会下移。

`.login-form` 控制内部竖向排列及 padding。`::before` 是玻璃承托：底色 `rgba(28, 26, 22, .82)`，背景模糊 10px，负 inset 向四周扩展，radial mask 让边缘渐隐。

`backdrop-filter` 模糊元素背后的画面；`filter: blur(...)` 会模糊元素自身，二者用途不同。当前表单文字不需要整体 blur。mask 里的黑色用于表示保留区域，并不是给表单画黑色文字。

标签 12px，输入值 16px。input 的 `border: 0` 去掉常规边框，只保留 `border-bottom`。focus / hover 时线变金色；focus-visible 还有外轮廓供键盘用户识别。

ENTER 是透明背景的整行按钮，15px、600 字重、字间距 `.14em`、操作高度至少 44px。`::after` 是 42px 短细线，跟随 `currentColor`；disabled 时透明度 `.8`，hover 颜色变化只对可用按钮生效。

### 8.7 SCROLL 的当前规则

SCROLL 默认 `display: none`。只有宽度 ≥701px、支持 hover、精细指针时才改成 flex；还必须同时满足 `data-phase="INTRO"` 和 `data-images-ready="true"`，才能变为 visible、opacity `.55`。

鼠标外框 14×20px，滚轮 2×4px，`scroll-wheel` 每 1.6s 循环，最多下移 3px。默认 paused，首屏可见时 running。

它现在是首屏常驻提示：移动鼠标不隐藏，未达到触发阈值的滚动不隐藏，离开 INTRO 后 120ms 淡出，完整倒放回 INTRO 后再次显示。代码里没有“已经使用过所以永久隐藏”的记忆状态。

reduced motion 下滚轮静止、隐藏无过渡。触屏和窄屏仍不显示鼠标提示；键盘入口和方向键操作是独立能力。

### 8.8 媒体查询与覆盖顺序

当前顺序：基础样式 → 桌面提示能力查询 → 宽度 ≤700px → 高度 ≤640px → 高度 ≤480px → reduced motion。

宽度与高度条件可以同时成立，后面的同等优先级规则覆盖前面的同名属性。比如 320×568：先满足手机规则的 73.44svh，再被低高度规则覆盖为 78.4svh，表单 top 最终为 66%。390×844 使用手机 73.44svh 与 67%；844×390 使用低高度 78.4svh 与 70%。

不要以为改了第一处 height 就能覆盖全部视口。改参数后至少查看 1440×900、390×844、320×568、844×390 四种情况。

<a id="home-coordination"></a>

## 9. `HomeExperience` 如何协调整个首页

### 9.1 六个阶段

| 阶段 | 画面与操作 | 人物鼠标幅度 | SCROLL |
| --- | --- | --- | --- |
| INTRO | 第 1 张；可以触发正放 | 就绪且能力允许时全幅 | 桌面满足能力条件时显示 |
| FORWARD_ANIMATING | 向第 12 张自动播放；可以中途反向 | 关闭，100ms 内回中 | 淡出 |
| LOGIN_READY | 第 12 张；两项非空可以 ENTER；可倒放 | 未聚焦过输入时半幅；开始填写后锁为零 | 隐藏 |
| REVERSE_ANIMATING | 向第 1 张倒放；可中途正放 | 关闭 | 隐藏，到 INTRO 后恢复 |
| FINAL_TRANSITION | 从第 12 张到第 13 张；拒绝方向和重复提交 | 零姿态 | 隐藏 |
| FINAL | 保持第 13 张；输入仍可编辑，不能再提交或倒放 | 输入无焦点、能力允许时半幅 | 隐藏 |

```mermaid
stateDiagram-v2
  [*] --> INTRO
  INTRO --> FORWARD_ANIMATING: 下滚 / 上滑 / 前进键
  FORWARD_ANIMATING --> LOGIN_READY: 到进度 1
  FORWARD_ANIMATING --> REVERSE_ANIMATING: 中途反向
  LOGIN_READY --> REVERSE_ANIMATING: 上滚 / 下滑 / 后退键
  REVERSE_ANIMATING --> INTRO: 到进度 0
  REVERSE_ANIMATING --> FORWARD_ANIMATING: 中途反向
  LOGIN_READY --> FINAL_TRANSITION: 两项非空并提交
  FINAL_TRANSITION --> FINAL: 最终过渡结束
```

刷新会重新建立组件，从 INTRO 开始。最终态没有回到 INTRO 的方向输入通路。

### 9.2 四个 state 与全部 ref

四个 state 是 `phase`、`reducedMotion`、`imagesReady`、`imageError`，用于 JSX 显示阶段、动画时长、加载状态和错误信息。

| ref | 保存什么 | 主要使用位置 |
| --- | --- | --- |
| `stageRef` | 舞台 DOM | 查图片、查帧、鼠标坐标换算、进度属性 |
| `motionLayerRef` | 人物外层 DOM | 写四个视差 CSS 变量 |
| `motionRef` | 鼠标控制器 | 改 gain、回中、销毁 |
| `mouseEnabledRef` | 设备和宽度允许联动吗 | `updateMotion` |
| `pageActiveRef` | 页面是否活跃 | blur / focus / visibility |
| `motionGainRef` | 当前联动幅度 | 快速排除不允许的鼠标输入 |
| `formLockedRef` | 本轮 LOGIN_READY 是否已经开始填写 | 持续锁定居中 |
| `inputFocusedRef` | 当前输入框是否有焦点 | FINAL 中暂停 / 恢复 |
| `frameNodesRef` | 12 个滚动帧 DOM | `renderProgress` 写 opacity |
| `overlayRef` | 表单外层 DOM | 写浮现变量、自动聚焦 Email |
| `focusLoginRef` | 正放结束后是否要自动聚焦 | 键盘入口进入 |
| `phaseRef` | 立即可读的阶段 | 所有事件与提交保护 |
| `timeoutRef` | 最终阶段完成计时器 | ENTER 后切 FINAL、卸载清理 |
| `timelineRef` | 转身控制器 | 正放、倒放、中途反向、取消 |
| `targetProgressRef` | 最新方向目标 | 加载期间保留输入 |
| `imagesReadyRef` | 立即可读的解码结果 | 防止未就绪播放与鼠标联动 |
| `reducedMotionRef` | 立即可读的动态效果偏好 | 每帧渲染与方向播放 |

### 9.3 主要函数的阅读顺序

先看 `requestDirection`，它接受目标 0 或 1：

1. 如果阶段已经是最终过渡或最终态，返回。
2. 保存最新目标；倒放请求也取消待自动聚焦标记。
3. 如果未解码完成或时间线不存在，先返回，保留目标。
4. 已经停在目标端点时不启动动画。
5. `changePhase` 切换正放 / 倒放阶段，联动因此暂停。
6. `timeline.playTo` 按独立时钟行进。

再看 `renderProgress`，它是时间线每帧调用的绘制桥梁：

1. 读取 `frameWeights(progress, 12, reduced)`。
2. 按数组顺序写 12 个帧的 inline opacity。
3. 把进度写入 `data-animation-progress`，用于调试与验收。
4. 普通模式用 `loginReveal(progress)`，reduced motion 直接用 progress。
5. 写 `--login-opacity` 与 `--login-y`，让 CSS 显示表单。

最后看 `changePhase` 与 `updateMotion`：前者同步 ref / state，并在进入 INTRO 或 FINAL 时解除登录阶段锁定；后者综合阶段、设备、解码、页面活跃和焦点，选择 gain。

`updateMotion` 中多层三元表达式可以按下面的意思读：条件不允许 → 0；INTRO → 1；LOGIN_READY 且未锁定 → 0.5；FINAL 且输入无焦点 → 0.5；其他 → 0。它只控制幅度，不会改变转身进度。

### 9.4 effect 的五组工作

| effect | 建立时做什么 | 清理 / 更新 |
| --- | --- | --- |
| reduced motion 查询 | 读取系统偏好 | 监听偏好变化，关闭联动时立即归零 |
| 鼠标系统 | 建立控制器、读取设备能力、挂 pointer / 页面活跃事件 | 移除事件、销毁控制器、能力变化时更新 gain |
| 自动聚焦 | LOGIN_READY 且有入口请求时 focus Email | 只消费一次标记，普通滚动不强制聚焦 |
| 时间线与解码 | 查帧 DOM、创建时钟、渲染首帧、等待 13 张 decode | active 失效、取消时钟、清理最终 timeout |
| `useDirectionTrigger` 内部 effect | 按 enabled 挂方向监听 | 进入最终过渡或卸载时移除 |

### 9.5 页面打开后发生什么

服务端 / 构建产生初始 HTML，CSS 默认显示第 1 帧并隐藏 Login。客户端接管后建立事件和时钟，对图片解码。全部成功后开放鼠标与转身，并使 INTRO 的 SCROLL 可见。

图片还没就绪时，`image-status` 显示“正在加载”；失败时改成刷新提示。`active` 保护异步回调，避免用户离开页面后 Promise 成功再启动动画。

## 10. 转身时间线：速度、帧顺序和交叠

### 10.1 先区分四个概念

| 概念 | 表示什么 | 当前值 / 范围 |
| --- | --- | --- |
| `animationProgress` | 转身的归一化时间游标 | 0–1；不等于整数帧号 |
| `targetProgress` | 当前要到哪个端点 | 0 或 1 |
| `FRAME_INTERVALS_MS` | 相邻帧之间的一整个时间段 | 11 个不等长段，合计 425ms |
| `FRAME_OVERLAP_MS` | 每个段尾的柔和混合时间 | 16ms，包含在段长内 |

滚动事件没有把“滚了多少像素”转换成进度。它只请求目标；之后即使手指松开、滚轮停止，rAF 时间线也会自动行进到端点。

### 10.2 当前完整帧节点表

| 到达图片 | 相对前一张的段长 | 从首帧累计时间 |
| --- | ---: | ---: |
| 1.png | 初始 | 0ms |
| 2.png | 38ms | 38ms |
| 3.png | 36ms | 74ms |
| 4.png | 34ms | 108ms |
| 5.png | 32ms | 140ms |
| 6.png | 30ms | 170ms |
| 7.png | 30ms | 200ms |
| 8.png | 32ms | 232ms |
| 9.png | 38ms | 270ms |
| 10.png | 45ms | 315ms |
| 11.png | 52ms | 367ms |
| 12.png | 58ms | 425ms |

表中节点表示相应图片完全显示的基准时刻；每个节点前 16ms 是两张相邻图的交叠。第 12 张到达后持续保持，不会在 58ms 后自行消失。

### 10.3 `frameWeights` 怎么算

先把进度截在 0–1 内。`count < 1` 返回空数组，只有一帧返回 `[1]`；当前 12 帧使用累计节点，其他帧数使用等间隔兼容映射。

普通模式把 `progress × 425` 映射为基准时间，找到当前段，再算段尾交叠：

```text
交叠时间比例 t = (当前时间 − (段末时间 − 交叠长度)) / 交叠长度
把 t 截在 0–1
blend = 3t² − 2t³
当前帧权重 = 1 − blend
下一帧权重 = blend
其他帧权重 = 0
```

首段例子：0–22ms 第 1 帧权重 1；30ms 位于 22–38ms 的中点，两帧各 0.5；38ms 第 2 帧完全显示。过渡时间比例 25% 时，smoothstep 后权重为 15.625%，所以“经过四分之一交叠时间”和“下一张透明度四分之一”不是同一个概念。

最多同时出现两张相邻帧。代码的 `Math.min(FRAME_OVERLAP_MS, interval)` 防止混合窗口超过该段，但设计时仍应保留很短的交叠，避免重影。

reduced motion 分支只混合第 1 张与第 12 张，中间帧权重为 0；这也是特殊模式不遵循相邻图片混合的原因。

### 10.4 `createProgressTimeline` 如何保证中途反向

控制器保存当前位置、目标、起点、开始时刻、剩余时长和运行标记。每次 tick 根据真实经过时间计算：

```text
elapsed = (当前时刻 − startedAt) / duration
progress = startProgress + (targetProgress − startProgress) × elapsed
```

正放与倒放只改变目标差值的正负，不重新做一份倒放帧数组。播放中收到相同目标直接返回，惯性不重新起步。

收到反方向时，先用 `performance.now()` 补采最新位置，再取消上一轮 rAF，以当前位置为新起点。剩余时长是 `总时长 × 到新目标的距离`。例如从 0.6 倒放到 0，普通模式需要约 `425 × 0.6 = 255ms`；从 0.6 继续正放到 1，约 `425 × 0.4 = 170ms`。

到端点后不再请求下一帧，调用 `onComplete` 让父级进入 INTRO 或 LOGIN_READY。`cancel()` 停止时钟但保留进度，适合反向接续。

`durationMs` 的可选参数供测试比较 400 / 425 / 450ms；页面默认使用常量 425ms。改变传入 duration 会改变整段实际速度，而 `frameWeights` 保留相同的节奏比例。修改默认常量时还必须同步段长总和，见第 15 节示例。

### 10.5 表单为什么在末尾出现

`loginReveal` 使用：

```ts
smoothstep((animationProgress - 0.6) / 0.4)
```

前 60% 的结果被截为 0，最后 40% 平滑升到 1。425ms 的 40% 是 170ms。进度 0.8 时结果为 0.5。

`renderProgress` 让表单 opacity 等于这个结果，y 等于 `(1 - reveal) × 16px`。刚开始浮出时有向下 16px 偏移，结束时偏移归零，表现为轻微上移。倒放同样沿映射下降，不需要额外“退出表单”动画。

reduced motion 直接令 reveal 等于 progress，并把 y 设为 0；表单全程只淡入淡出。

### 10.6 ENTER 的最终过渡与普通转身不同

`enter()` 先检查阶段与就绪条件，取消转身时钟，立即把人物外层 reset 到零，再切 FINAL_TRANSITION。

此时 CSS 让所有 intro 帧 opacity 变为 0，覆盖第 12 张的内联透明度；第 13 张通过 `final-presence` 变为 1，图片自身通过 `final-settle` 从 scale `.98`、blur `3px` 收到 scale `1`、blur `0`。透明度使用相同的 ease 和时长，人物组继续使用 plus-lighter。

`setTimeout` 在 700ms 后把阶段标为 FINAL，普通转身的 rAF 不负责这一步。reduced motion 改为 240ms 且不做图片缩放 / 模糊。改变最终时长时，父级 timeout 与 `--final-duration` 必须一致。

## 11. 方向输入：滚轮、触摸和键盘

### 11.1 滚轮

`WHEEL_THRESHOLD_PX = 44` 是累计阈值；`GESTURE_GAP_MS = 250` 表示相邻事件超过该间隔，按新手势重新累计。方向改变也重新累计，防止上一方向的量串入另一方向。

事件的 `deltaMode` 可能是像素、行、页。代码分别乘以 1、16、视口高度，统一为近似像素。`deltaY > 0` 请求目标 1，负值请求目标 0。

同组同向事件只触发一次，时间线还会防止同向目标重启。横向占优、deltaY 为零、ctrlKey 触控板缩放被排除。

监听使用 `passive: true`，因此这里只观察，不拦截浏览器原生滚动。调小阈值会更容易触发，不能用它替代总播放时长来“加快动画”。

### 11.2 触摸

只跟踪单指 identifier，累计纵向距离 40px 且纵向大于横向时触发。计算为“旧 y − 新 y”：手指上滑结果正，选择目标 1；下滑选择目标 0。

同一次触摸中换方向会重新累计，可立即反向，不要求先松手。touchend 还会读取 changedTouches，补上某些设备只在结束事件提供的最后一段移动。多指或 touchcancel 清空跟踪状态。

### 11.3 键盘

| 前进到背面 | 回到正面 |
| --- | --- |
| ArrowDown、PageDown、End、Space | ArrowUp、PageUp、Home、Shift + Space |

已经被别处处理的事件、Ctrl / Meta / Alt 快捷键，以及 input、textarea、select、button、contenteditable 内部的按键都不触发页面方向。这保护打字、按钮提交与编辑操作。

键盘专用“进入登录”按钮只在聚焦时可见，点击或 Enter / Space 走同一正放逻辑，完成后 focus Email。它与装饰性的 SCROLL 是两个不同元素。

### 11.4 监听为什么拆成函数和 Hook

`listenForDirectionIntent` 建立事件并返回清理函数，能直接在 Node 的模拟浏览器中测试。`useDirectionTrigger` 只通过 useEffect 按 enabled 挂载它，完成与 React 生命周期的连接。

最终过渡开始后 enabled 为 false，effect 清理监听。普通 LOGIN_READY 仍保持监听，以便上滚倒放。

## 12. 鼠标视差、回中和输入锁定

### 12.1 坐标和方向

父级把鼠标舞台坐标换成 -1 到 1：中心为 0，左右边为 -1 / 1，上下边为 -1 / 1。控制器再截断范围，防止外部输入超过预设幅度。

全幅目标：

```text
target.x  = −水平坐标 × 6px
target.y  = −垂直坐标 × 4px
target.rx = −垂直坐标 × 0.3deg
target.ry =  水平坐标 × 0.6deg
```

鼠标向右时人物轻微向左、rotateY 微微朝右；鼠标向上时人物轻微向下。半幅 gain 0.5 时所有数值减半。gain 0 时忽略新的鼠标目标。

这里是整张 PNG 平面的微弱倾转，不是改变人体模型朝向，也不重新选择人物帧。

### 12.2 跟随公式

```text
blend = 1 − exp(−dt / 90)
当前位置 += (目标 − 当前位置) × blend
```

`dt` 是真实经过的毫秒数。90ms 为时间常数，经过一个时间常数靠近目标约 63%；不是“90ms 后完全到达目标”。改小会更紧跟鼠标，改大会更迟缓。

使用实际时间避免在 120Hz 下每秒更新次数更多而显得更快。当前单元测试验证模拟 60 / 120Hz；不意味着已经做过 120Hz 实机验收。

### 12.3 静止、离开和能力变化

每次鼠标移动更新 `idleAt = now + 180`。静止超过 180ms 后，从当时姿态开始 600ms smoothstep 回中。总计最后一次移动约 780ms 后精确归零，rAF 停止。

鼠标离开舞台直接启动 600ms 回稳；窗口失焦、页面隐藏、窄屏能力变化、reduced motion 等立即归零。能力恢复时不使用旧鼠标坐标，必须有新移动才产生偏移。

运动时 `will-change: transform`，归稳后恢复 auto。`will-change` 是给浏览器的优化提示，不是动画函数；常驻或到处添加不会自动让页面更顺滑。

### 12.4 为什么首次聚焦后一直居中

`focusInput` 做两件事：记录当前输入焦点，在 LOGIN_READY 里设置 `formLockedRef = true`。`updateMotion(180)` 因此选择 gain 0，以 180ms 回中。

`blurInput` 只清除当前焦点，不清除登录阶段锁。所以切换 Email / Password、点击空白、移到 ENTER 时都保持稳定。完整倒放回 INTRO 或进入 FINAL 才清除阶段锁。

FINAL 中仍有输入焦点时保持零；失焦后可重新接收半幅鼠标输入。若在 180ms 回中完成前快速提交，`enter()` 立即 reset 到零再开始最终过渡，不额外等待一段回中动画。

### 12.5 控制器方法区别

| 方法 | 用途 | 是否改变联动幅度 |
| --- | --- | --- |
| `move(x, y)` | 接收新目标并平滑跟随 | 否，使用现有 gain |
| `setGain(0, 180)` | 暂停新目标并回中 | 是，设为 0 |
| `setGain(0.5)` | 开放半幅，等待新鼠标输入 | 是，设为 0.5 |
| `reset()` | 立即归零并取消待执行回中 | 否 |
| `reset(600)` | 从当前姿态缓慢回中 | 否 |
| `dispose()` | 归零、取消 rAF、标记销毁 | 关闭后续调用 |

不要把 reset 理解为永久禁用鼠标；如果 gain 仍非零，之后的新 move 仍能驱动人物。阶段锁由 HomeExperience 管理。

## 13. TypeScript 配置、构建工具和目录脚本

### 13.1 `package.json`：命令与依赖

| 命令 | 实际入口 | 用途 |
| --- | --- | --- |
| `pnpm dev` | `next dev --webpack` | 带开发更新的本地服务 |
| `pnpm build` | `next build --webpack` | 类型检查与优化的 production 构建 |
| `pnpm start` | `next start` | 启动已有构建；先 build |
| `pnpm lint` | `eslint .` | 检查代码规则 |
| `pnpm typecheck` | `tsc --noEmit` | 检查类型，不输出编译文件 |
| `pnpm test` | Node 内置 test runner | 运行 `src/app/*.test.mjs`，当前 32 项 |

`engines` 要求 Node 24，`.nvmrc` 指定 24.21.0，`packageManager` 指定 pnpm 9.15.9。`private: true` 用于防止误发布 npm 包，不是网站访问控制。

`--test-isolation=none` 让当前两份单元测试在同一测试进程里执行；测试必须恢复自己替换的全局时钟。浏览器验收没有包含在 `pnpm test` 中，需单独启动服务和执行文件。

### 13.2 `tsconfig.json`：哪些选项与阅读相关

| 选项 | 当前含义 |
| --- | --- |
| `strict: true` | 开启严格类型检查，缺失对象、错误类型更容易被发现 |
| `noEmit: true` | tsc 只检查，不生成 JS；Next.js 负责应用构建 |
| `jsx: "react-jsx"` | 使用现代 JSX 编译方式，不必只为 JSX 手动导入 React 默认对象 |
| `moduleResolution: "bundler"` | 按打包器方式解析模块导入 |
| `lib` 中的 `dom` | 提供浏览器 DOM API 类型 |
| `incremental: true` | 允许保存增量检查信息 |
| `paths` | 提供 `@/` 到 src 的别名 |
| `include` | 检查 TS / TSX 和 Next.js 生成的相关类型 |
| `exclude` | 排除 node_modules 的直接文件扫描 |

`allowJs: true` 允许纳入 JavaScript 文件；没有开启 `checkJs`，不能把它理解成“所有 .mjs 都已经做了完整类型检查”。测试的正确执行依靠 lint 和运行测试共同验证。

JSON 不接受普通源码注释，因此 package / tsconfig 的详细解释放在本文中。

### 13.3 Next.js、PostCSS 与 ESLint

`next.config.ts` 的 `allowedDevOrigins: ["127.0.0.1"]` 允许该本地主机来源使用开发服务资源。它不是生产 API 的 CORS 规则，也不是允许某个用户登录。使用新的端口转发域名时按根 README 添加主机名并重启开发服务。

`postcss.config.mjs` 启用 `@tailwindcss/postcss`，处理 CSS 中的 `@import "tailwindcss"`。当前界面视觉主要通过自定义类完成，不是 JSX 里堆满 Tailwind utility classes。

`eslint.config.mjs` 展开 Next.js 的 core-web-vitals 与 TypeScript 规则，忽略 `.next`、构建目录与自动生成类型入口。不要把忽略项扩大到实际源码来规避检查。

### 13.4 `.gitignore` 与私有目录

忽略依赖、缓存、构建产物、日志、环境变量文件、密钥、表格和 data 的私人文件。`!` 开头的规则重新纳入例外，比如允许保留导入目录的 README。

被 Git 忽略与能否公开访问是两件事。`public` 内容仍会被网站公开提供，所以原始 Excel、个人健康图片、凭据和内部报告不能放在那里。`data` 是本地文件工作区，也不是数据库。

### 13.5 `scripts/check-structure.sh`

脚本先通过 `${BASH_SOURCE[0]}` 找自身位置，再确定仓库根目录，因此不依赖调用时所在的目录。`set -u` 检查未定义变量，`pipefail` 让管道中的失败可见。

`find` 使用 prune 跳过依赖、缓存和工具目录；对其他目录使用 `-print0` 输出 NUL 分隔路径。`read -r -d ''` 配对读取，带空格的目录也不会被拆开。

`[[ -f "$readme" ]]` 检查文件存在，`[[ -s "$readme" ]]` 检查非空。`failed` 汇总问题，最后非零退出表示失败。执行方式：

```bash
bash scripts/check-structure.sh
```

新建项目维护目录时，同一次修改中创建 README。

<a id="parameters"></a>

## 14. 想改什么，就从这张参数索引开始

表中的值是学习基准当天的实际值。CSS 已按分组展开并加注释，可直接搜索类名或变量名，不依赖容易随注释变化的行号。

### 14.1 静态画面

| 想调整 | 文件与搜索位置 | 当前值 | 注意关联 |
| --- | --- | --- | --- |
| 石墨底色 | `globals.css` → `--graphite` | `#10100f` | html、页面、舞台和键盘入口使用它 |
| 象牙文字色 | `--warm-white` | `#f0e9dd` | Logo、label、input 等共同变化 |
| 金色 | `--gold` | `#bea478` | 圆点、ENTER、SCROLL、焦点共同变化 |
| 输入下划线浓度 | `--line` | alpha `.42` | 单独改线，避免改变所有文字 |
| 页面字体 | `body` → `font-family` | Avenir Next / Segoe UI / PingFang SC / sans-serif | 系统没有前面的字体时自动使用后面的备选 |
| Logo 文案 | `home-header.tsx` | `formward` 与单独圆点 | 视觉样式仍在 CSS |
| Logo 边距 / 大小 | `.home-header` / `.home-logo` | 88px 高、clamp padding / font-size | 手机 68px 高、20px 左右 padding |
| 人物整体大小 | `.body-frame img` → `height` / `max-height` | 89.6svh / 1176px | 手机、低高度规则和提示定位参考也要复核 |
| 某一帧的位置 | `frame-config.ts` → 对应 path | 每帧不同的 x / y | 桌面与手机分开，百分比参考帧自身 |
| 某一帧缩放 | `FRAME_CONFIG` → `scale` | 每帧不同 | 不能解决原图姿态或清晰度差异 |
| 环境光位置 / 强度 | `.home-stage` → `radial-gradient` | 暖金 `.11`、宽光 `.035`、petrol `.16` | 手机另有对应 gradient |
| 表单整体下移 | `.login-overlay` → `top` | 64 / 67 / 66 / 70% | 增大往下；不同媒体查询分开看 |
| 表单宽度 | `.login-overlay` → `width` | 桌面最多 340px，手机 320px | 内部 padding 和边缘空间共同决定输入宽度 |
| 表单承托强度 | `.login-form::before` → background alpha | `.82` | 同时看文字对比度和遮住尾部的程度 |
| 表单承托范围 | 同上 → inset / mask-image | `-24px -40px`、渐隐 mask | 更负的 inset 会向外扩展 |
| 背景模糊 | 同上 → backdrop-filter | 10px | 不要换成对整个表单 filter blur |
| label 字号 | `.login-form label` | 12px | 与输入值字号分别控制 |
| 输入值字号 / 高度 | `.login-form input` | 16px / 34px | 极低高度 input 为 28px 高 |
| 输入之间的空隙 | input → margin-bottom | 20px；手机 18px；低高度 12 / 10px | 后面媒体查询可覆盖 |
| ENTER 大小 / 强度 | `.login-form button` | 15px / 600 / `.14em` | 保留操作高度与禁用区分 |
| ENTER 短细线 | `button::after` | 42×1px | 与输入下划线不是同一规则 |
| SCROLL 文案 | `home-experience.tsx` → `.scroll-hint` JSX | `SCROLL` | 改长文案要同时复核 72px 宽度和右侧留白 |
| SCROLL 字号 / 浓度 | `.scroll-hint` 与 INTRO 选择器 | 9px / opacity `.55` | 基础 opacity 是 0，不要只改错位置 |
| SCROLL 与人物间距 | `.scroll-hint` → left / top | `.14H + 32px`、`-.11H` | H 来自 --figure-height，clamp 保证边界 |
| 提示滚轮速度 / 幅度 | `.scroll-hint-wheel` / `scroll-wheel` | 1.6s / 3px | reduced motion 静止 |
| 提示淡出时间 | `.scroll-hint` → transition | 120ms | opacity 与 visibility 延迟需要同步 |

### 14.2 动画和交互

| 想调整 | 文件与搜索位置 | 当前值 | 注意关联 |
| --- | --- | --- | --- |
| 完整转身速度 | `home-timeline.ts` → `PRE_LOGIN_DURATION_MS` | 425ms | 11 个段长总和要匹配，更新相关测试 |
| 转身节奏 | `FRAME_INTERVALS_MS` | 38 / 36 / 34 / 32 / 30 / 30 / 32 / 38 / 45 / 52 / 58 | 12 张对应 11 段，不是 12 个静止时长 |
| 相邻帧柔和衔接 | `FRAME_OVERLAP_MS` | 16ms | 包含在段内，太长重影明显 |
| Login 开始浮现 | `loginReveal` 的 `.6` / `.4` | 前 60% 隐藏，最后 40% 出现 | 改开始点时剩余范围也要同步 |
| Login 上移动量 | `home-experience.tsx` → `--login-y` | 16px | CSS fallback 16px 和三档浏览器测试也引用它 |
| 最终过渡时间 | `FINAL_DURATION_MS` | 700ms | JS timeout 与 CSS 变量共用；reduced 单独 240ms |
| reduced 首尾淡入淡出 | `REDUCED_DURATION_MS` | 180ms | 与输入回中 180ms 含义不同 |
| reduced 最终时长 | `home-experience.tsx` 两处 `240` | 240ms | 完成 timeout 与 --final-duration 同步 |
| 最终缩放 / 模糊 | `globals.css` → `final-settle` | scale `.98 → 1`、blur `3px → 0` | 不改逐帧外框 transform |
| 滚轮触发敏感度 | `use-direction-trigger.ts` → `WHEEL_THRESHOLD_PX` | 44px | 不改变播放速度 |
| 触摸触发距离 | `TOUCH_THRESHOLD_PX` | 40px | 同时排除横向占优和多指 |
| 手势分组间隔 | `GESTURE_GAP_MS` | 250ms | 不是滑动停止后必须等待的播放延迟 |
| 鼠标水平 / 垂直幅度 | `figure-motion.ts` → target.x / y | 6 / 4px | LOGIN_READY / FINAL 半幅 |
| 鼠标倾转幅度 | target.rx / ry | .3 / .6deg | 外层 CSS perspective 配合 |
| 鼠标跟随速度 | `FOLLOW_TIME_CONSTANT_MS` | 90ms | 越小越灵敏；必须保持正值 |
| 静止多久开始归稳 | `IDLE_DELAY_MS` | 180ms | 不是输入框回中时长 |
| 静止回稳持续多久 | `RETURN_DURATION_MS` | 600ms | 鼠标离开时父级也明确调用 reset(600) |
| 输入聚焦回中 | `focusInput` → `updateMotion(180)` | 180ms | 登录阶段锁定由 formLockedRef 保持 |
| 转身开始回中 | `updateMotion(settleMs = 100)` | 100ms | 控制器 setGain 的默认值也是 100ms |
| 鼠标透视 | `.figure-motion` → perspective / origin | 1600px / 50% 32% | 幅度太大容易偏离当前克制方向 |
| 首屏 / 末态联动条件 | `updateMotion` → gain | 1 / .5 / 0 | 不直接在控制器里重写页面阶段判断 |
| 禁用时 ENTER 浓度 | `.login-form button:disabled` | `.8` | 可用性条件还在 canEnter 中 |

<a id="exercises"></a>

## 15. 用具体练习理解修改方法

以下数值是**练习示例**，不会自动生效。先理解修改关系，再决定是否采用，不需要一次把所有示例应用到页面。

### 15.1 练习一：只把桌面表单稍微下移

1. 打开 `globals.css`，搜索 `.login-overlay`。
2. 将基础规则 `top: 64%` 试改为 `66%`。
3. 暂时保留手机和低高度媒体查询，观察仅桌面高视口的变化。
4. 在 1440×900 看肩背、腰线、尾部与按钮；再查看另外三种视口，确认覆盖关系。
5. 想让其他视口也下移，再分别改对应媒体查询，不在所有选择器上加 `!important`。

这个练习只调整静态位置，不需要改 `animationProgress` 或表单入场时钟。top 下移和 `--login-y` 入场位移是两类参数。

### 15.2 练习二：把鼠标联动收得更弱

原目标：

```ts
target = {
  x: -x * 6 * gain,
  y: -y * 4 * gain,
  rx: -y * 0.3 * gain,
  ry: x * 0.6 * gain,
};
```

可以试水平 4px、垂直 2.5px、rotateX .2deg、rotateY .4deg。保持负号和 gain 机制，才能仍然是反向位移、半幅末态与填写锁定。

这里不用改图片对齐值，也不改 425ms。修改后检查：首屏极端鼠标位置、停止回稳、转身时归零、输入聚焦锁定、FINAL 失焦后的半幅。测试中的特定幅度断言依据原规格，需按决定采用的新幅度更新；不要删除方向、锁定和清理约束。

### 15.3 练习三：把默认转身时长改为 450ms

默认时长与节点表共同维护。可以采用一组比例接近当前节奏、合计 450ms 的示例：

```ts
export const PRE_LOGIN_DURATION_MS = 450;
export const FRAME_INTERVALS_MS = [40, 38, 36, 34, 32, 32, 34, 40, 48, 55, 61] as const;
```

16ms 交叠可先保留，末尾表单浮现会由 170ms 变为 `450 × .4 = 180ms`。这属于规格变化，需同步页面说明、本文参数、按原 425ms 命名或写死数组的相关测试，以及浏览器验收中的默认时长判断。

不要只改 `PRE_LOGIN_DURATION_MS` 而保留段长合计 425ms，否则游标时间范围与最后节点不一致。也不要给整段进度再套一次 ease；当前节奏已经由节点分布定义。

400 / 425 / 450ms 的测试注入参数用于比较速度；修改默认值后，这些测试是否还能顺序完整也应检查。更新测试前先确认新规格，然后保留完整顺序、中途反向、互补权重等不变量。

### 15.4 练习四：表单晚一点出现

若希望最后 30% 才出现，可试：

```ts
return smoothstep((animationProgress - 0.7) / 0.3);
```

开始点 `.7` 与剩余范围 `.3` 合计 1，进度 1 时仍能完全显示。只改 `.6` 为 `.7` 却保留分母 `.4`，到终点时 reveal 还没有达到 1。

这个变化不改变帧播放速度，只改变表单映射。转身前段隐藏的单元 / 浏览器断言需要同步新开始点；继续检查正放、倒放和中途反向都没有跳变。

### 15.5 练习五：整体放大人物，避免破坏对齐

1. 优先调 `.body-frame img` 的基础 height；不要先把 13 个 scale 全部各改一遍。
2. 同步 SCROLL 使用的 `--figure-height` 参考值。
3. 根据需求分别处理手机与低高度规则，以及 max-height 上限。
4. 检查第 1、5、10、12、13 张；第 5、10–12 宽高比不同，最容易暴露位置问题。
5. 运行四种视口的全部帧裁切检查；放大后当前 16px 安全边距可能不再满足。
6. 若某张仍不齐，再依据原图标记调整该帧配置。

整体大小变动也会改变人体和表单的覆盖关系，即使表单 top 没有变化。视觉复核不能只看首帧。

### 15.6 练习六：替换图片或增加中间帧

替换同编号素材后，静态导入会读取新尺寸，重新构建生成新的内容地址。再测量关键点，更新 `FRAME_CONFIG` 与 `frame-calibration.md`；不要沿用原图的画布比例。

增加中间帧需要新增静态导入、加入 `PRE_LOGIN_FRAMES`、补配置、重新定义节奏。N 张滚动图需要 N−1 个换帧段。第 13 张目前是独立最终帧，不能仅为了“多一张”把它加入滚动数组。

测试中的帧数、最终索引、图片请求数量和校准数据也要跟着真实方案更新。增加帧数量后，原来的兼容等间隔映射虽然可以运行，但不自动等于想要的新节奏。

<a id="verification"></a>

## 16. 测试文件怎么读，修改后怎么验收

### 16.1 单元测试：看输入、推进时间、断言

`home-timeline.test.mjs` 中的 `browserClock` 模拟 window、事件与 rAF。`wheel` 发一个滚轮事件，`advance(时间)` 执行待处理帧，`elapse` 只改变时钟、不执行 rAF，用来模拟两帧之间的反向输入。

`setupTimeline` 使用真实方向监听器和真实时间线，只替换环境。因此它能检查一次手势自动播完、中途反向、同向惯性、触摸方向、权重及 reduced motion。

`figure-motion.test.mjs` 也模拟时钟，收集控制器输出与剩余待执行帧。它既看坐标是否回到零，也看有没有残留 rAF。`t.after` 必须先 dispose 再恢复假时钟，防止清理调用失效。

`assert.equal` 比较单值，`assert.deepEqual` 比较数组 / 对象，`assert.ok` 检查条件。比如“最多两帧，权重和为 1”是规则测试；“某次截图亮度是否正确”必须交给浏览器，不能由该断言替代。

当前两份测试合计 32 项，包含模拟 60 / 120Hz，但没有真实显示器刷新率验收。

### 16.2 浏览器测试的函数地图

| 函数 / 区域 | 测什么 | 为什么需要真实浏览器 |
| --- | --- | --- |
| `newPage` / `phase` | 建上下文、等解码、等阶段 | 确认实际页面能运行 |
| `snapshot` / `figurePose` | 读取进度、帧透明度、表单、姿态 | 看实际 DOM / computed style |
| `verifyFigureInteraction` | SCROLL 常驻、鼠标、焦点锁、快速 ENTER、恢复与能力降级 | 事件、焦点和媒体查询的实际组合 |
| `startRecording` / `finishRecording` | 逐 rAF 采样与端点时间 | 不把截图工具延迟混进播放时间 |
| `verifySequence` | 顺序、相邻交叠、权重 | 完整执行路径不能只检查最后一帧 |
| `verifySpeedProfiles` | 同一实现比较三档实际速度 | 允许真实 rAF 的采样间隔 |
| `verifyFrameAlignment` | 原图标记换算、残差、Alpha 裁切、提示位置 | 需要实际 CSS 尺寸与变换 |
| `verifyCrossfadePixels` | 合成后 RGB 是否符合加权参考 | computed opacity 正确仍可能变暗 |
| 主 try 内 A–E | 正放、倒放、反向、ENTER、最终锁定 | 确认整页行为组合 |
| 手机 / reduced 区域 | 原生滑动与减少动态效果 | 单元模拟无法替代设备能力分支 |
| coldContext / failedContext | 预加载、解码等待、无新请求、失败状态 | 需要控制实际网络请求与图片 decode |

像素检查截取固定舞台范围，采集两端和背景，再按 25%、50%、75% 的透明度权重比较真实交叠截图。只统计人物可见区域，平均 RGB 误差要求 ≤2/255。这里的比例是直接设置的混合权重，不是 smoothstep 前的时间比例。

当前 87 组：桌面 36、手机 36、reduced motion 6、固定最大视差 9。还临时恢复 normal 混合作为失败对照，确认测试确实能识别变暗。截图包含虚构输入，存临时目录，不放 public。

### 16.3 常用执行顺序

改完先在开发服务观察，再执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
bash scripts/check-structure.sh
```

这些命令分别检查规则、类型、自动化逻辑、生产构建、目录说明。它们都通过也不能替代视觉判断；CSS 承托、人物裁切、输入焦点与手机键盘仍需看实际页面。

浏览器验收单独执行。按 [tests/README.md](../tests/README.md) 安装临时 Playwright / Chromium，先启动开发服务或 build 后的 production 服务，再设置 `PLAYWRIGHT_MODULE`、`PLAYWRIGHT_BROWSERS_PATH`，需要非默认端口时设置 `FORMWARD_BASE_URL`。

```bash
# 已完成 production build 时，在一个终端启动服务；该终端需保持运行。
pnpm start

# 另一个终端执行，前提是已按 tests/README.md 完成临时浏览器安装。
PLAYWRIGHT_MODULE=/tmp/formward-browser-check/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/formward-browser-check/browsers node tests/home-experience.browser.mjs
```

当前 25 项浏览器验收包含上述像素与交互类别。修改纯中文注释时，确认可执行代码未变化并完成基础检查即可；修改图片、CSS 合成、焦点策略、时间线时应执行对应真实浏览器验收。

<a id="debugging"></a>

## 17. 用开发者工具定位问题

### 17.1 从肉眼看到的元素反查代码

1. 在浏览器 Elements / 元素面板选择目标，比如 Email 标签。
2. 看它的 class 和父层；Email 对应 `.login-form label`，整块位移看 `.login-overlay`。
3. 在 Styles / 样式面板看生效声明和被覆盖声明。
4. 如果基础 top 被划掉，检查当前高度是否触发后面的媒体查询。
5. Computed / 计算样式中看最终 opacity、transform、width。
6. 回编辑器搜类名，修改真实源码；浏览器面板里的临时修改刷新会丢失。

### 17.2 在 Console 读取页面状态

以下只读片段可帮助调试：

```js
const page = document.querySelector(".home-page");
const stage = document.querySelector(".home-stage");
({
  phase: page?.dataset.phase,
  imagesReady: page?.dataset.imagesReady,
  progress: stage?.dataset.animationProgress,
  frameOpacity: [...document.querySelectorAll("[data-intro-frame]")]
    .map((node) => getComputedStyle(node).opacity),
});
```

`dataset.imagesReady` 对应 HTML 的 `data-images-ready`，读出来是字符串 `"true"` / `"false"`，不是 JavaScript 布尔值。进度属性也是字符串，需要计算时用 Number 转换。

`data-reduced-motion` 用于观察 JS 偏好状态；CSS 动态效果分支直接使用系统媒体查询。可以检查：

```js
matchMedia("(prefers-reduced-motion: reduce)").matches;
matchMedia("(min-width: 701px) and (hover: hover) and (pointer: fine)").matches;
```

### 17.3 暂时看某一张图的静态位置

停在 INTRO、动画未运行时，可以临时显示第 5 张：

```js
const frames = [...document.querySelectorAll("[data-intro-frame]")];
frames.forEach((node, index) => {
  node.style.opacity = String(index === 4 ? 1 : 0);
});
```

这里只改画面透明度，没有改变 phase，不能用它判断登录阶段或提交逻辑。鼠标联动也仍按 INTRO 工作，观察对齐时等它回稳。刷新恢复正常首帧；下一次实际播放会由控制器重新写透明度。

### 17.4 常见现象对应哪个系统

| 现象 | 优先检查 |
| --- | --- |
| 改完 CSS 没变化 | 开的是 dev 还是旧 production；实际 class；媒体查询覆盖；生产服务需重新 build |
| 某一张人物突然高低跳 | 对应帧 x / y / scale、素材画布和测量点，不先调滚轮阈值 |
| 每次交叠都变暗 | isolation、plus-lighter、互补权重、是否误加正常 opacity transition |
| 出现两个轮廓停留很久 | FRAME_OVERLAP_MS 是否过长、是否有两套动画系统叠加 |
| SCROLL 不见 | 是否 INTRO、是否全部图片就绪、宽度和精细指针 / hover 条件 |
| 回到首屏仍无提示 | data-phase 是否真的 INTRO、CSS 是否被临时 style 覆盖；当前没有一次性隐藏标记 |
| 滚了却没播 | 是否达到方向阈值、是否解码失败、是否已经最终态、客户端控制台是否报错 |
| 滚动条在动但人物完全静止 | 客户端脚本是否正常、开发来源配置与日志；参考根 README |
| 输入后人物不再随鼠标 | LOGIN_READY 填写锁定的正常行为，完整倒放或最终阶段才解除 |
| 输入值为空却 ENTER 可用 | 检查 canEnter 是否被改坏、canSubmit 与 disabled 是否还连接 |
| FINAL 无法上滚返回 | 当前最终锁定的既定行为 |
| 表单有位置但点不到 | inert、accessible、阶段以及是否被其他层覆盖 |
| 手机与桌面人物大小不一样 | 不同 height 与 mobile 对齐值，低高度规则还可覆盖 |
| 提示滚轮不动、没有视差 | reduced motion，或设备能力不满足；先看媒体查询结果 |

## 18. 自学时可以按这几个小目标推进

| 学习轮次 | 操作 | 自己验收是否理解 |
| --- | --- | --- |
| 第一轮：页面结构 | 对照 DOM 地图打开每个 TSX | 能指出 Logo、人物、表单、提示的父子关系 |
| 第二轮：静态样式 | 临时调整一个颜色、一个间距，再恢复 | 能解释选择器与媒体查询为什么生效 |
| 第三轮：配置传递 | 从 FRAME_CONFIG 跟到 frameStyle 和 CSS var | 能说明某帧 x 为什么不是屏幕百分比 |
| 第四轮：事件流 | 从滚轮到 onIntent、requestDirection、playTo、renderProgress | 能解释手势结束后为什么还会播完 |
| 第五轮：时钟与状态 | 按节点表计算一个权重，按剩余距离算一次倒放时长 | 能区分阶段、进度、帧索引和目标 |
| 第六轮：输入稳定 | 跟 focusInput、formLockedRef、updateMotion、setGain | 能解释 blur 为什么不解除填写锁定 |
| 第七轮：验证 | 看一个模拟时钟测试，再看浏览器像素比较 | 知道哪个问题不能只靠单元断言判断 |

每次练习尽量只改一个明确参数，写下原值、预期结果与实际结果，再决定是否保留。涉及多处配套值时一起核对，例如总时长与段长总和、最终 timeout 与 CSS 时长、图片高度与提示定位参考。

要进入真实业务开发时，再依次读 [轻量架构](architecture.md)、[产品范围](product.md)、[里程碑](milestones.md)、[数据模型](data-model.md)、[Excel 导入](excel-import.md) 和相应 feature README。网页与 AI API 将共享 feature 函数，数据库 schema 与迁移由 db / drizzle 管理，不能把当前视觉表单的本地状态当作完整认证实现。
