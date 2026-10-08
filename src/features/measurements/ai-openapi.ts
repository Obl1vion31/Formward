const json = (schema: unknown) => ({ "application/json": { schema } });
const reference = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nullableString = { type: ["string", "null"] };
const decimal = { type: ["string", "null"], pattern: "^\\d+(\\.\\d{1,2})?$", description: "十进制字符串，最多两位小数；显式 null 清空，省略保留。体重 >0 且 <=99999.99，体脂 0–100。" };
const date = { type: "string", format: "date" };
const operationId = { type: "string", pattern: "^[a-zA-Z0-9-]{8,120}$", description: "每次新操作唯一；同请求重试复用，不同内容或令牌不能复用。" };
const period = { type: "string", enum: ["daytime", "evening"] };
const responses = {
  "200": { description: "本账号结果；操作返回预览，只有 status=confirmed 才已保存。", content: json(reference("Operation")) },
  "400": { description: "无效字段、日期、数值、空腹条件或已有不可估算项。", content: json(reference("Error")) },
  "401": { description: "令牌无效、过期或撤销。", content: json(reference("Error")) },
  "403": { description: "只读令牌不能提交操作。", content: json(reference("Error")) },
  "404": { description: "操作不存在或属于其他账号。", content: json(reference("Error")) },
  "409": { description: "operationId 已用于不同内容或令牌。", content: json(reference("Error")) },
  "500": { description: "服务暂不可用；不返回数据库内部信息。", content: json(reference("Error")) },
};
export const measurementOpenApi = {
  openapi: "3.1.0", info: { title: "Formward 身体记录 API", version: "1.0.0", description: "当前身体记录界面的查询、历史修改和单项估算。令牌有效期 30 天；所有写入先生成 15 分钟预览，由用户登录网页确认。无 API 确认入口。" },
  servers: [{ url: "/api/v1" }], security: [{ bearerAuth: [] }],
  paths: {
    "/measurements": { get: { operationId: "queryMeasurements", summary: "查询本账号记录、来源、摘要、趋势与逐日分析", parameters: [
      { name: "from", in: "query", schema: date }, { name: "to", in: "query", schema: date },
      { name: "choices", in: "query", schema: { type: "string" }, description: "URL 编码 JSON：{\"YYYY-MM-DD:daytime\":\"recordId\"}。必须是本账号对应时段实测，仅影响本次分析。" },
    ], responses: { ...responses, "200": { description: "记录与逐日／趋势按区间筛选；摘要读取全历史，与网页一致。未知为 null，估计不进入实测摘要。体重单位 kg、体脂 %、体脂差值为百分点。", content: json({ type: "object", required: ["records", "sources", "analyses", "units", "dates"], properties: { records: { type: "array", items: reference("Measurement") }, sources: { type: "array", items: { type: "string" } }, dates: { type: "array", items: { type: "object" } }, analyses: { type: "object", description: "weightKg 和 bodyFatPercent 各含 summary、trend、days；同用网页业务函数。" }, units: { type: "object" }, range: { type: "object" }, rules: { type: "string" } } }) } } } },
    "/measurement-operations": { post: { operationId: "submitMeasurementOperation", summary: "提交单日部分字段或单项估算预览", description: "新实测来源必填，晨间明确 fasting:true。不同已知值需要显式 recordId+version；完全重复跳过，缺项补充，冲突阻止整次保存。timezone 可省略。未知时间不虚构。", requestBody: { required: true, content: { "application/json": { schema: { oneOf: [reference("SaveDay"), reference("EstimateCell")] }, examples: { fictionalBodyRecord: { summary: "虚构格式示例，不代表用户数据", value: { kind: "save_day", operationId: "fictional-example-0001", date: "2024-04-04", periods: { daytime: { weightKg: "70.20", bodyFatPercent: "20.10", fasting: true, deviceLabel: "虚构体重秤" }, evening: { bodyFatPercent: "20.30", deviceLabel: "虚构体重秤" } } } } } } } }, responses: { ...responses, "413": { description: "请求超过 16 KiB。" }, "415": { description: "需要 application/json。" } } } },
    "/measurement-operations/{id}": { get: { operationId: "getMeasurementOperation", summary: "查询本账号操作预览与最终状态", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses } },
  },
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "在网页 AI 接入创建的可撤销令牌，不是模型 API Key。" } }, schemas: {
    PeriodEdit: { type: "object", additionalProperties: false, properties: { recordId: { type: "string", description: "修改已有字段或来源时明确指定；须与 version 同时提供。" }, version: { type: "string", format: "date-time", description: "GET 返回的 updatedAt，原样提交。" }, weightKg: decimal, bodyFatPercent: decimal, fasting: { type: ["boolean", "null"], description: "晨间仅 true；旧非空腹／未知晨间只读，晚间固定 false。" }, deviceLabel: { ...nullableString, minLength: 1, maxLength: 300, description: "用户提供的合并来源名称，新实测必填；既有记录省略保留。" } } },
    SaveDay: { type: "object", additionalProperties: false, required: ["kind", "date", "operationId", "periods"], properties: { kind: { const: "save_day" }, date, operationId, timezone: { ...nullableString, description: "可省略的 IANA 时区；不改变旧记录准确时间或时区。" }, periods: { type: "object", minProperties: 1, additionalProperties: false, properties: { daytime: reference("PeriodEdit"), evening: reference("PeriodEdit") } } } },
    EstimateCell: { type: "object", additionalProperties: false, required: ["kind", "date", "operationId", "period", "metric"], properties: { kind: { const: "estimate_cell" }, date, operationId, period, metric: { type: "string", enum: ["weightKg", "bodyFatPercent"] } } },
    Measurement: { type: "object", properties: { id: { type: "string" }, recordDate: date, period, weightKg: decimal, bodyFatPercent: decimal, deviceLabel: nullableString, fasting: { type: ["boolean", "null"] }, recordKind: { enum: ["observed", "estimated"] }, updatedAt: { type: "string", format: "date-time" }, entryChannel: nullableString, sourceLocalTime: { type: "string" }, timezone: nullableString, timePrecision: { type: "string" }, estimation: { type: ["object", "null"] }, estimateExplanation: { type: ["object", "null"] } } },
    Operation: { type: "object", required: ["id", "status", "preview", "confirmationUrl", "expiresAt"], properties: { id: { type: "string" }, operationId: { type: "string" }, status: { enum: ["pending", "confirmed", "cancelled", "expired"] }, confirmationUrl: { type: "string", format: "uri" }, confirmationPath: { type: "string" }, expiresAt: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" }, confirmedAt: { type: ["string", "null"] }, repeated: { type: "boolean" }, preview: { type: "object", description: "date、kind、canConfirm、message、rows；rows 含 period、state(new/edit/supplement/duplicate/conflict/estimate)、before、after、message、replacedEstimates。估算另含 explanation。" }, result: { type: ["object", "null"], properties: { message: { type: "string" }, saved: { type: "integer" } } } } },
    Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } } },
  } },
};
