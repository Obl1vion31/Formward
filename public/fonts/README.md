# Hero 字体

## 目的

保存首页微标签及滚动提示使用的本地字体，以及保留的公开字体素材。`src/app/hero-font.ts` 通过 `next/font/local` 加载 IBM Plex Mono；主标题继承 Logo 的系统字体体系。浏览器和构建不依赖外部字体服务。

## 内容与来源

- `manrope-latin-variable.woff2`：Manrope Latin 可变字体，字重范围 300–500，保留为公开素材，当前页面不加载。
- `ibm-plex-mono-latin-regular.woff2`：IBM Plex Mono 的 Latin 正体 400，用于辅助标签和滚动提示。
- `manrope-OFL.txt`、`ibm-plex-mono-OFL.txt`：对应字体的完整许可证，保持原文。

字体文件来自 Google Fonts 的官方分发服务，许可证来自 [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope) 和 [IBM Plex Mono](https://github.com/google/fonts/tree/main/ofl/ibmplexmono) 官方目录。获取日期为 2026-10-04。分发请求为 `https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=Manrope:wght@300..500&display=swap`，仅保存各字体的 Latin 子集。

## 维护约定

新增字重、字符集或替换字体时，同步更新加载定义、来源和许可证。当前只为微标签及滚动提示加载 IBM Plex Mono，主标题、Logo、表单和其他页面沿用系统字体。
