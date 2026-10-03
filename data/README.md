# Private Data Workspace

## 目的

本目录保存本机使用的私有导入、导出和可选的开发数据库，不能作为网站静态资源公开提供。正式运行数据保存在配置的 PostgreSQL / Neon 数据库。

## 内容

- `imports/`：用户提供的原始导入文件。
- `exports/`：导入报告和数据导出结果。
- `postgres/`：可选的本机 PGlite 开发数据库；生成的 storage 被 Git 忽略。

## 维护约定

除 README 外的内容均被版本控制忽略。文件可能包含个人健康数据，不复制到 `public/`，不作为测试样本提交。
