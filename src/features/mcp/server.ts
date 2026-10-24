import { publicRecordInputSchema } from "../records/model";
import { submitRecordOperation, getRecordOperation } from "../records/operations";
import { recordAiInstructions } from "../records/ai-openapi";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { requireMcpAuth } from "@better-auth/mcp";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { oauthConnection, user } from "../../db/schema";
import type { createAuth } from "../auth/auth";
import { siteOrigin } from "../auth/site-url";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { CONNECTION_CLAIM, READ_SCOPE, WRITE_SCOPE, MEALS_READ_SCOPE, MEALS_WRITE_SCOPE, ENERGY_READ_SCOPE, ENERGY_WRITE_SCOPE, requireOauthConnection } from "../auth/oauth-connections";
import { imageImportSchema, importMealImages } from "../meals/images";
import { operationSchema } from "../meals/model";
import { submitMealOperation, getMealOperation, displayMealOperation } from "../meals/records";
import { queryMeals, queryFoods } from "../meals/ai-api";
import { mealAiInstructions } from "../meals/ai-openapi";
import { aiConfirmationUrl, queryAiMeasurements, safeAiError } from "../measurements/ai-api";
import { getAiMeasurementOperation, submitAiMeasurementOperation } from "../measurements/ai-operations";
import { systemMeasurementTimezone, validateMeasurementTimezone } from "../measurements/timezone";

import { queryEnergy } from "../activities/ai-api";
import { isEnergy } from "../activities/model";
import { energyAiInstructions } from "../activities/ai-openapi";

const recordReadScopes = [READ_SCOPE, MEALS_READ_SCOPE, ENERGY_READ_SCOPE];
const recordWriteScopes = [WRITE_SCOPE, MEALS_WRITE_SCOPE, ENERGY_WRITE_SCOPE];
const completeRecordScopes = [...recordReadScopes, ...recordWriteScopes];
/** 补授权按完整记录能力合并申请；仅查询连接保持只读，既有授权由客户端保留。 */
function authorizationScopes(required: string[], granted: string[]) {
  const records = !required.length || required.some(scope => completeRecordScopes.includes(scope));
  const write = [...required, ...granted].some(scope => recordWriteScopes.includes(scope));
  return [...new Set([...granted, ...required, ...(records ? [...recordReadScopes, ...(write ? recordWriteScopes : [])] : [])])];
}

function recordScopes(items: { kind: string }[], write: boolean) {
  return [...new Set(items.map(item => isEnergy(item) ? write ? ENERGY_WRITE_SCOPE : ENERGY_READ_SCOPE : item.kind === "save_record" || item.kind === "estimate_cell" ? write ? WRITE_SCOPE : READ_SCOPE : write ? MEALS_WRITE_SCOPE : MEALS_READ_SCOPE))];
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("记录日期 YYYY-MM-DD，包含边界日期");
const period = z.enum(["daytime", "evening"]).describe("daytime 为晨间空腹；evening 为晚间非空腹");
const nullableText = z.string().nullable().optional();
const saveRecord = z.object({ kind: z.literal("save_record"), date, period, recordId: z.string().optional(), version: z.string().optional(), weightKg: nullableText.describe("kg 十进制字符串；未知为 null"), bodyFatPercent: nullableText.describe("百分比十进制字符串；未知为 null"), sourceUnspecifiedConfirmed: z.boolean().optional().describe("仅在用户明确同意不填写来源时为 true，同时 deviceLabel 为 null；未回答不能代确认"), deviceLabel: nullableText.describe("用户提供并确认的真实设备／应用来源名称。未提供时先询问，不能用 ChatGPT 手动提供、设备未注明等描述代填。用户明确不填时传 null 和 sourceUnspecifiedConfirmed=true"), fasting: z.boolean().nullable().optional(), timezone: nullableText.describe("当次 +08:00 等偏移或 IANA 时区；省略新记录采用默认时区，旧记录保留原值") }).strict();
const estimateCell = z.object({ kind: z.literal("estimate_cell"), date, period, metric: z.enum(["weightKg", "bodyFatPercent"]) }).strict();
const outputSchema = z.object({}).catchall(z.unknown());

function toolPolicy(scopes: string[], readOnly: boolean, profile = false) {
  return { outputSchema, annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes }], ...(profile ? { "openai/profile": true } : {}) } };
}

export function createFormwardMcp(db: Database, identity: AiIdentity, grantedScopes: string[], request: Request) {
  const resource = new URL("/api/mcp", siteOrigin(request)).href;
  const server = new McpServer({ name: "Formward", version: "1.9.0" }, { instructions: "用户明确要求完整接入或补齐授权时，先调用authorize_formward一次请求身体、饮食和消耗的查询与提交预览权限；此工具不生成健康预览，仍需用户OAuth同意。查询自己的身体记录时使用 query_measurements。身体记录的新录入、历史修改、估算通过 submit_measurement_operation 生成预览，将 confirmationUrl 完整提供给用户，等待用户在 Formward 网页确认。不要声称预览已经保存。未知值为 null，实测与估计必须区分，不把体重差解释为确定的热量或因果。重复提交沿用相同 operationId。用户未提供测量来源时，先询问实际设备／应用来源或是否确认不填写；可以列出查询返回的历史 sources 供选择，不能擅自沿用，也不能把 ChatGPT／手动提供当作测量来源。用户明确留空时传 deviceLabel:null 和 sourceUnspecifiedConfirmed:true。响应 needsUserInput 非空时说明待补信息，询问用户或让其在网页补填，不能把有问题的预览说成可直接保存。" + mealAiInstructions + recordAiInstructions + energyAiInstructions });
  async function execute(scopes: string[], work: () => Promise<Record<string, unknown>>) {
    try {
      if (scopes.some(scope => !grantedScopes.includes(scope))) throw new ApiError(403, "insufficient_scope", "当前账号连接缺少权限，请重新授权。");
      const data = await work();
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data, ...(data.status === "failed" ? { isError: true } : {}) };
    } catch (error) {
      const failure = safeAiError(error);
      const challenge = `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/api/mcp", resource).href}", error="${failure.status === 403 ? "insufficient_scope" : "invalid_token"}", error_description="Please authorize Formward record access together", scope="${authorizationScopes(scopes, grantedScopes).join(" ")}"`;
      return { content: [{ type: "text" as const, text: failure.error.message }], structuredContent: { error: failure.error }, isError: true,
        ...([401, 403].includes(failure.status) ? { _meta: { "mcp/www_authenticate": [challenge] } } : {}) };
    }
  }
  server.registerTool("authorize_formward", { title: "统一授权 Formward 记录能力", description: "用户要求连接Formward、补齐授权或统一开启身体、饮食／食材、消耗的查询与提交预览时使用。一次请求三类记录的读写权限，由用户在OAuth网页同意；仅检查连接，不读取健康内容、不创建预览或保存记录。只读使用者的日常查询继续使用原查询工具；用户未要求完整接入时不主动请求提交权限。成功后所有正式保存仍需用户网页登录确认。", inputSchema: z.object({}).strict(), ...toolPolicy(completeRecordScopes, true) }, () => execute(completeRecordScopes, async () => ({ connected: true, access: "read_and_submit_previews", domains: ["measurements", "meals", "energy"], requiresWebConfirmation: true })));
  server.registerTool("get_profile", { title: "查看已连接账号", description: "查看本次 OAuth 连接对应的 Formward 账号，返回稳定标识和显示名称。", inputSchema: z.object({}).strict(), ...toolPolicy(["profile"], true, true) }, () => execute(["profile"], async () => {
    const [profile] = await db.select({ id: user.id, displayName: user.name }).from(user).where(eq(user.id, identity.userId));
    if (!profile) throw new ApiError(401, "invalid_token", "账号不存在。");
    return profile;
  }));
  server.registerTool("query_measurements", { title: "查询身体记录", description: "查询授权账号的体重、体脂、来源、时区、候选与趋势。实测和估计分别标记，摘要仅统计实测；体脂变化单位为百分点，未知值为 null。from/to 为记录日期。需要分析之前先查询数据。", inputSchema: z.object({ from: date.optional(), to: date.optional(), choices: z.record(z.string(), z.string()).optional().describe("本次查询选择的候选：日期:时段 → recordId，不修改持久记录"), timezone: z.string().optional().describe("本次用户所在地时区；未知时省略") }).strict(), ...toolPolicy([READ_SCOPE], true) }, args => execute([READ_SCOPE], async () => {
    const params = new URLSearchParams();
    if (args.from) params.set("from", args.from); if (args.to) params.set("to", args.to); if (args.choices) params.set("choices", JSON.stringify(args.choices));
    return queryAiMeasurements(db, identity.userId, params, args.timezone ?? systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE));
  }));
  server.registerTool("submit_measurement_operation", { title: "提交身体记录审核", description: "将用户提供的录入、带 recordId+version 的历史修改或显式估算提交为待审核预览，最多 100 条、64 KiB。数值使用十进制字符串，晨间须 fasting=true。提交前先确认来源：用户提供实际名称，或明确同意不填写，使用 deviceLabel:null 和 sourceUnspecifiedConfirmed:true；用户未回答则先询问，不能创造占位来源。重复请求必须沿用同一 operationId，不能用同一 ID 改内容。返回 confirmationUrl 后要求用户登录网页确认；此工具不会保存健康记录。", inputSchema: z.object({ operationId: z.string().regex(/^[a-zA-Z0-9-]{8,120}$/).describe("为本次请求生成唯一标识，重试保持不变"), items: z.array(z.discriminatedUnion("kind", [saveRecord, estimateCell])).min(1).max(100), timezone: z.string().optional().describe("新记录默认使用的用户时区，未提供时采用服务器配置") }).strict(), ...toolPolicy([WRITE_SCOPE], false) }, args => execute([WRITE_SCOPE], async () => {
    const input = { kind: "batch", operationId: args.operationId, items: args.items };
    if (Buffer.byteLength(JSON.stringify(input)) > 65536) throw new ApiError(413, "invalid_input", "单次操作内容超过 64 KiB。");
    const timezone = args.timezone ?? systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE); validateMeasurementTimezone(timezone);
    const result = await submitAiMeasurementOperation(db, identity, input, timezone);
    return { ...result, confirmationUrl: aiConfirmationUrl(request, result.confirmationPath) };
  }));
  server.registerTool("get_measurement_operation", { title: "查询审核结果", description: "按提交返回的 id 查询当前账号的审核状态、逐行结果与数量。confirmed/completed 中的 counts 才表示已保存或已取消；pending 表示仍等待网页确认。", inputSchema: z.object({ id: z.string() }).strict(), ...toolPolicy([READ_SCOPE], true) }, args => execute([READ_SCOPE], async () => getAiMeasurementOperation(db, identity.userId, args.id)));
  server.registerTool("search_foods", { title: "查找食材规格", description: "搜索当前账号的食物名称、品牌和做法，返回稳定id、version、基准数量、单位、营养、来源及食材说明规则。查询后再引用，估算保留成分分量与计算，不写个人餐次背景。", inputSchema: z.object({ q: z.string().max(200).optional() }).strict(), ...toolPolicy([MEALS_READ_SCOPE], true) }, args => execute([MEALS_READ_SCOPE], () => queryFoods(db, identity.userId, args.q)));
  server.registerTool("import_meal_images", { title:"保存饮食原图", description:"接收用户上传的1–8张JPEG／PNG／WebP原图（每张最大20 MiB），私有保存后返回稳定附件ID；不保存正式餐次。使用返回id作为餐次或食材的imageIds。仅图片先问日期、餐次、身份、实际食用量与额外油酱。", inputSchema:imageImportSchema, ...toolPolicy([MEALS_WRITE_SCOPE],false), _meta:{...toolPolicy([MEALS_WRITE_SCOPE],false)._meta,"openai/fileParams":["files"]} }, args=>execute([MEALS_WRITE_SCOPE],async()=>importMealImages(db,identity,args)));
  server.registerTool("query_energy", { title: "查询热量消耗", description: energyAiInstructions, inputSchema: z.object({ from: date.optional(), to: date.optional(), timezone: z.string().optional() }).strict(), ...toolPolicy([ENERGY_READ_SCOPE], true) }, args => execute([ENERGY_READ_SCOPE], () => queryEnergy(db, identity.userId, new URLSearchParams(Object.entries(args)))));
  server.registerTool("query_meals", { title: "查询饮食记录", description: "查询本账号餐次、营养明细及每日已记录摄入合计。未知null，缺项标不完整，没有记录不代表零摄入。", inputSchema: z.object({ from: date.optional(), to: date.optional(), timezone:z.string().optional().describe("用户所在地时区，用于返回今天的日期") }).strict(), ...toolPolicy([MEALS_READ_SCOPE], true) }, args => execute([MEALS_READ_SCOPE], async () => queryMeals(db, identity.userId, new URLSearchParams(Object.entries(args)))));
  server.registerTool("submit_meal_operation", { title: "提交饮食审核", description: mealAiInstructions, inputSchema: operationSchema, ...toolPolicy([MEALS_WRITE_SCOPE], false) }, args => execute([MEALS_WRITE_SCOPE], async () => { const operation = await submitMealOperation(db, { userId: identity.userId, origin: "ai", identity }, args); return { ...operation, confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) }; }));
  server.registerTool("get_meal_operation", { title: "查询饮食审核结果", description: "pending为待确认，confirmed才已保存；只查询本账号操作。", inputSchema: z.object({ id: z.string().uuid() }).strict(), ...toolPolicy([MEALS_READ_SCOPE], true) }, args => execute([MEALS_READ_SCOPE], async () => { const operation = displayMealOperation(await getMealOperation(db, identity.userId, args.id)); return { ...operation, confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) }; }));
  server.registerTool("submit_record_operation", { title: "提交统一记录审核", description: recordAiInstructions, inputSchema: publicRecordInputSchema, ...toolPolicy([WRITE_SCOPE, MEALS_WRITE_SCOPE, ENERGY_WRITE_SCOPE].filter(scope => grantedScopes.includes(scope)), false) }, args => execute(recordScopes(args.items, true), async () => {
    const operation = await submitRecordOperation(db, identity, args);
    return { ...operation, confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
  }));
  server.registerTool("get_record_operation", { title: "查询统一审核结果", description: "查询本账号混合批次，pending 尚未保存，confirmed 表示所选内容已保存。", inputSchema: z.object({ id: z.string().uuid() }).strict(), ...toolPolicy([READ_SCOPE, MEALS_READ_SCOPE, ENERGY_READ_SCOPE].filter(scope => grantedScopes.includes(scope)), true) }, args => execute([], async () => {
    const operation = await getRecordOperation(db, identity, args.id);
    if (recordScopes(operation.rows.map(row => row.action), false).some(scope => !grantedScopes.includes(scope))) throw new ApiError(403, "insufficient_scope", "当前连接缺少该批次读取权限，请重新授权。");
    return { ...operation, confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
  }));
  return server;
}

export function createMcpEndpoint(db: Database, auth: ReturnType<typeof createAuth>) {
  const resource = new URL("/api/mcp", auth.options.baseURL as string).href;
  const protectedHandler = requireMcpAuth(auth, async (request, claims) => {
    const id = claims[CONNECTION_CLAIM];
    if (typeof claims.sub !== "string" || typeof id !== "string") throw new ApiError(401, "invalid_token", "缺少有效的账号连接。");
    const connection = await requireOauthConnection(db, claims.sub, id, null);
    if (connection.clientId !== claims.client_id) throw new ApiError(401, "invalid_token", "账号连接不匹配。");
    const scopes = typeof claims.scope === "string" ? claims.scope.split(" ") : [];
    const identity: AiIdentity = { userId: claims.sub, oauthConnectionId: id, permission: [WRITE_SCOPE, MEALS_WRITE_SCOPE, ENERGY_WRITE_SCOPE].some(scope => scopes.includes(scope) && connection.scopes.includes(scope)) ? "write" : "read" };
    await db.update(oauthConnection).set({ lastUsedAt: new Date() }).where(and(eq(oauthConnection.id, id), eq(oauthConnection.userId, identity.userId)));
    const handler = createMcpHandler(() => createFormwardMcp(db, identity, scopes.filter(scope => connection.scopes.includes(scope)), request), { legacy: "stateless", maxRequestBodySize: 131072 });
    await traceMcpRequest(request);
    return handler.fetch(request);
  }, { resource, challengeScopes: ["openid", "profile", "offline_access", READ_SCOPE, WRITE_SCOPE, MEALS_READ_SCOPE, MEALS_WRITE_SCOPE, ENERGY_READ_SCOPE, ENERGY_WRITE_SCOPE] });
  return async (request: Request) => {
    try {
      const response = await protectedHandler(request);
      response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    } catch (error) {
      const failure = safeAiError(error);
      return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: failure.error.message } }, { status: failure.status, headers: { "Cache-Control": "no-store", ...(failure.status === 401 ? { "WWW-Authenticate": `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/api/mcp", resource).href}", error="invalid_token"` } : {}) } });
    }
  };
}


// 只记录工具名和文件参数结构，不记录用户内容、下载地址或凭据。
async function traceMcpRequest(request: Request) {
  const reader = request.clone().body?.getReader();
  if (!reader) return;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>131072) throw new ApiError(413,"invalid_input","MCP请求过大。"); chunks.push(value); }
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const name = input?.method === "tools/call" ? input?.params?.name : null;
    const known = ["authorize_formward","get_profile","query_energy","query_measurements","submit_measurement_operation","get_measurement_operation","search_foods","query_meals","submit_meal_operation","get_meal_operation","import_meal_images","submit_record_operation","get_record_operation"];
    if (known.includes(name)) {
      const files=input?.params?.arguments?.files, first=Array.isArray(files)?files[0]:null;
      console.info(JSON.stringify({event:"mcp_tool_call",tool:name,...(name==="import_meal_images"?{fileCount:Array.isArray(files)?files.length:null,fileShape:typeof first,hasDownloadUrl:typeof first?.download_url==="string",hasFileId:typeof first?.file_id==="string"}:{})}));
    }
  } catch(error) { if(error instanceof ApiError)throw error; }
  finally { void reader.cancel().catch(()=>{}); }
}
