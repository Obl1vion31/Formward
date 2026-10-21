const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
export const recordAiInstructions = "同一轮涉及身体、摄入、食材和消耗的任意组合时，优先使用 submit_record_operation 合并提交，不拆成多个审核链接。各类内容可任意组合，一次返回一个 confirmationUrl。每项有唯一 key，复用 save_record、estimate_cell、save_meal、save_food 及既有删除恢复字段。同批新食材单独 save_food，餐项以 foodRef 引用其 key，不再重复 foodDraft 或 nutrition；内嵌 foodDraft 也兼容并展开为独立审核项。用户可只保存摄入或只入库食材。逐项核对和修改只更新草稿，底部统一确认后才正式保存；pending 不代表已经保存。未知为 null，照片与来源核对规则不变。重试复用 operationId 和原内容，不能通过工具代替网页登录确认。";
export const recordSchemas = {
  RecordInput: { type: "object", additionalProperties: false, required: ["operationId", "items"], properties: {
    operationId: { type: "string", pattern: "^[a-zA-Z0-9-]{8,120}$" }, timezone: { type: "string" },
    items: { type: "array", minItems: 1, maxItems: 100, items: { oneOf: [
      { allOf: [ref("RecordMeasurementItem")] },
      { type: "object", required: ["key", "kind", "date", "period", "metric"], properties: { key: { type: "string" }, kind: { const: "estimate_cell" }, date: { type: "string", format: "date" }, period: { enum: ["daytime", "evening"] }, metric: { enum: ["weightKg", "bodyFatPercent"] } } },
      { allOf: [ref("RecordMealSave")] },
      ref("RecordEnergyItem"),
      { allOf: [ref("RecordFoodSave")] },
      { type: "object", required: ["key", "kind", "id", "version"], properties: { key: { type: "string" }, kind: { enum: ["delete_food", "restore_food", "delete_meal", "restore_meal"] }, id: { type: "string", format: "uuid" }, version: { type: "integer" } } },
    ] } },
  } },
};
export const recordPaths = {
  "/record-operations": { post: { operationId: "submitRecordOperation", summary: "一次提交身体、摄入、食材、消耗与活动审核", description: recordAiInstructions, requestBody: { required: true, content: { "application/json": { schema: ref("RecordInput") } } }, responses: { "200": { description: "待网页统一确认的混合预览；status=confirmed 才已保存" }, "400": { description: "输入无效" }, "401": { description: "授权无效" }, "403": { description: "缺少对应记录权限" }, "409": { description: "请求标识冲突" } } } },
  "/record-operations/{id}": { get: { operationId: "getRecordOperation", summary: "查询统一审核结果", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "本账号批次及逐项结果" }, "404": { description: "操作不存在或不属于本账号" } } } },
};
