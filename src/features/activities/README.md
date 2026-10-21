# 消耗与活动

负责每日静息／活动／总量覆盖、活动明细、按日期生效的公式资料、审核与审计。活动数值原样相加，不扣静息，不估普通日常活动；只有完成且有效的活动进入合计，未知用null；仅在账号明确设置的zeroActivityFrom日起，未录活动按0；已有未知热量明细仍保持未知。

- `model.ts`：输入校验、平均静息／默认零、三层优先级、Mifflin公式和体重回退。
- `records.ts`：归属、版本、幂等、预览、确认事务、软删除恢复和审计。
- `energy-view.tsx`／`energy-editor.tsx`／`energy.module.css`：网页和审核表单、历史图、资料与最近删除。
- `ai-api.ts`／`ai-openapi.ts`：HTTP与MCP共用查询、协议和说明。
- `energy.test.ts`／`migration.test.ts`：业务、安全、回滚及旧表保护。

网页入口、HTTP和MCP复用同一业务；不在入口重复计算规则。完整口径与维护见[消耗文档](../../../docs/energy.md)。每个新目录包含README，新增结构通过versioned migration。

`energy_defaults`保存账号日常默认值，不逐日伪造实测。网页提供独立公式对照；日记录activeEstimated／notes保存活动初始化估算。新规则与资料均可统一审核，旧快照忽略新增空字段以兼容旧pending。
