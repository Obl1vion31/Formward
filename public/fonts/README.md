# Hero 字体

## 目的

保存首页概念词、微标签及滚动提示使用的本地字体，以及保留的公开字体素材。`src/app/hero-font.ts` 通过 `next/font/local` 加载 Newsreader 和 IBM Plex Mono；Logo、登录表单及其他页面沿用系统 sans serif。浏览器和构建不依赖外部字体服务。

## 内容与来源

- `manrope-latin-variable.woff2`：Manrope Latin 可变字体，字重范围 300–500，保留为公开素材，当前页面不加载。
- `ibm-plex-mono-latin-regular.woff2`：IBM Plex Mono 的 Latin 正体 400，用于辅助标签和滚动提示。
- `newsreader-latin-regular.woff2`：Newsreader 的 Latin 正体 400，保留 6–72 的 `opsz` 光学尺寸轴，仅用于 Effortless、Discipline、Drive 概念词。
- `manrope-OFL.txt`、`ibm-plex-mono-OFL.txt`：对应字体的完整许可证，保持原文。
- `newsreader-OFL.txt`：Newsreader 的完整 SIL Open Font License 1.1，保持原文。

字体文件来自 Google Fonts 的官方分发服务，许可证来自 [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope) 和 [IBM Plex Mono](https://github.com/google/fonts/tree/main/ofl/ibmplexmono) 官方目录。获取日期为 2026-10-04。分发请求为 `https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=Manrope:wght@300..500&display=swap`，仅保存各字体的 Latin 子集。

Newsreader 来自 [Google Fonts 官方目录](https://github.com/google/fonts/tree/main/ofl/newsreader)，由 Production Type 设计，获取日期为 2026-10-06。分发请求为 `https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400&display=swap`，使用现代浏览器 User-Agent 获取 WOFF2，仅保存 Latin 子集。分发文件为 `https://fonts.gstatic.com/s/newsreader/v26/cY9VfjOCX1hbuyalUrK49dLafXjalZCsZBsgBgbNJYQ.woff2`，许可证来自官方目录中的 `OFL.txt`。

## 维护约定

新增字重、字符集或替换字体时，同步更新加载定义、来源和许可证。Newsreader 仅作用于首页概念词，启用 `font-optical-sizing: auto`；IBM Plex Mono 仅作用于微标签及滚动提示。字体就绪后轨道重新测量标注尺寸，保证本地字体替换后引线、对齐和响应式避让正确。
