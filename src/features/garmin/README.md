# Garmin Personal API 只读核对

本目录负责个人账号最近七天的佳明数据读取、字段核对与本机私有报告。只通过 Personal API 换取令牌及 GET 每日汇总、分页活动列表，不连接 Formward 数据库、不创建审核或正式记录、不提供公开 HTTP／MCP 接口。

- `client.ts`：固定官方站点、限时和限量读取、失败与分页诊断；令牌仅驻留本次进程。
- `model.ts`：按官方 V2 schema 整理七日读数、活动和字段观察，保留缺失、空值、明确零与原精度。
- `report.ts`：自包含的深浅主题只读 HTML，含日期选择、活动、字段对应及经白名单处理的 JSON。
- `private-files.ts`：独立用户目录配置、0600 私有输出及仅本机随机地址预览。
- `garmin.test.ts`：虚构响应下的读取边界、数据口径、脱敏、错误及私有文件测试。

脚本入口是 `scripts/preview-garmin.mts`，配置与使用见 [Garmin 接入](../../../docs/garmin-personal.md)。原始响应只保存于被忽略的 `data/imports/`，不出现在终端、预览页面、截图和 AI 样本中。字段观察保留未知路径的类型及存在情况，但未知字段的值默认不披露。所有页面标明实际数据或虚构演示；预览不等于导入。
