# 消耗与活动

负责每日静息／活动／总量覆盖、活动明细、按日期生效的公式资料、审核与审计。活动数值原样相加，不扣静息，不估普通日常活动；只有完成且有效的活动进入合计，未知用null。

- `model.ts`：输入校验、三层优先级、Mifflin公式和体重回退。
- `records.ts`：归属、版本、幂等、预览、确认事务、软删除恢复和审计。
- `energy-view.tsx`／`energy-editor.tsx`／`energy.module.css`：网页和审核表单、历史图、资料与最近删除。
- `ai-api.ts`／`ai-openapi.ts`：HTTP与MCP共用查询、协议和说明。
- `energy.test.ts`／`migration.test.ts`：业务、安全、回滚及旧表保护。

网页入口、HTTP和MCP复用同一业务；不在入口重复计算规则。完整口径与维护见[消耗文档](../../../docs/energy.md)。每个新目录包含README，新增结构通过versioned migration。
