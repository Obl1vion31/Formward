# Hero 字体

## 目的

保存首页英文标题与微小标签使用的本地字体。`src/app/hero-font.ts` 通过 `next/font/local` 加载，浏览器和构建过程都不依赖外部字体服务。

## 内容与来源

- `manrope-latin-variable.woff2`：Manrope 的 Latin 可变字体，字重范围 300–500，用于 Discipline、Drive、Effortless。
- `ibm-plex-mono-latin-regular.woff2`：IBM Plex Mono 的 Latin 正体 400，用于辅助标签和滚动提示。
- `manrope-OFL.txt`、`ibm-plex-mono-OFL.txt`：对应字体的完整许可证，保持原文。

字体文件来自 Google Fonts 的官方分发服务，许可证来自 [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope) 和 [IBM Plex Mono](https://github.com/google/fonts/tree/main/ofl/ibmplexmono) 官方目录。获取日期为 2026-10-04。分发请求为 `https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=Manrope:wght@300..500&display=swap`，仅保存各字体的 Latin 子集。

## 维护约定

新增字重、字符集或替换字体时，同步更新加载定义、来源和许可证。字体只应用于首页 Hero 的英文排版，表单和其他页面沿用自己的字体体系。
