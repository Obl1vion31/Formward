import nutritionGuidance from "../meals/ai-nutrition-guidance.json";
import { assertBodyEstimateRemoved } from "../measurements/retirement";
import { exerciseCatalog, searchExercises } from '../training/catalog';
import { queryTraining, queryTrainingPage } from '../training/ai-api';
import { isTraining, trainingActionSchemas, trainingAiInstructions } from '../training/ai-model';
import { requireActiveAiToken } from '../auth/ai-tokens';
import { publicRecordInputSchema } from "../records/model";
import { appendPendingImagesSchema, appendPendingImages, submitRecordOperation, getRecordOperation } from "../records/operations";
import { recordAiInstructions } from "../records/ai-openapi";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { requireMcpAuth } from "@better-auth/mcp";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { oauthConnection, user } from "../../db/schema";
import type { createAuth } from "../auth/auth";
import { processingRegion,regionConfig } from "../auth/regions";
import { siteOrigin } from "../auth/site-url";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { CONNECTION_CLAIM, READ_SCOPE, WRITE_SCOPE, MEALS_READ_SCOPE, MEALS_WRITE_SCOPE, ENERGY_READ_SCOPE, ENERGY_WRITE_SCOPE, TRAINING_READ_SCOPE, TRAINING_WRITE_SCOPE, requireOauthConnection } from "../auth/oauth-connections";
import { imageImportSchema, importMealImages } from "../meals/images";
import { publicMealInputSchema } from "../meals/model";
import { submitMealOperation, getMealOperation, displayMealOperation } from "../meals/records";
import { queryMeals, queryFoods } from "../meals/ai-api";
import { mealAiInstructions } from "../meals/ai-openapi";
import { aiConfirmationUrl, queryAiMeasurements, queryAiMeasurementPage, safeAiError } from "../measurements/ai-api";
import { getAiMeasurementOperation, submitAiMeasurementOperation } from "../measurements/ai-operations";
import { systemMeasurementTimezone, validateMeasurementTimezone } from "../measurements/timezone";

import { queryEnergy } from "../activities/ai-api";
import { isEnergy } from "../activities/model";
import { energyAiInstructions } from "../activities/ai-openapi";

import { mealPreviewSchema, previewMeal } from "../meals/ai-preview";
import { mealChangesSchema, previewMealChanges } from "../meals/ai-changes";
import { energyPreviewSchema, previewEnergy } from "../activities/ai-preview";
import { queryOptions, queryParameters } from "../records/ai-query";
import { aiFieldHint, aiFieldDefinitionsDescription, aiInterpretationRules, withAiFieldDefinitions, type AiToolName } from "../records/ai-field-definitions";
import { aiRecovery, mealAiResponse, recordAiResponse } from "../records/ai-response";

const recordReadScopes = [READ_SCOPE, MEALS_READ_SCOPE, ENERGY_READ_SCOPE, TRAINING_READ_SCOPE];
const recordWriteScopes = [WRITE_SCOPE, MEALS_WRITE_SCOPE, ENERGY_WRITE_SCOPE, TRAINING_WRITE_SCOPE];
const completeRecordScopes = [...recordReadScopes, ...recordWriteScopes];
/** 补授权按完整记录能力合并申请；仅查询连接保持只读，既有授权由客户端保留。 */
function authorizationScopes(required: string[], granted: string[]) {
  const records = !required.length || required.some(scope => completeRecordScopes.includes(scope));
  const write = [...required, ...granted].some(scope => recordWriteScopes.includes(scope));
  return [...new Set([...granted, ...required, ...(records ? [...recordReadScopes, ...(write ? recordWriteScopes : [])] : [])])];
}

function recordScopes(items: { kind: string }[], write: boolean) {
  return [...new Set(items.map(item => isTraining(item) ? write ? TRAINING_WRITE_SCOPE : TRAINING_READ_SCOPE : isEnergy(item) ? write ? ENERGY_WRITE_SCOPE : ENERGY_READ_SCOPE : item.kind === "save_record" ? write ? WRITE_SCOPE : READ_SCOPE : write ? MEALS_WRITE_SCOPE : MEALS_READ_SCOPE))];
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("记录日期 YYYY-MM-DD，包含边界日期");
const period = z.enum(["daytime", "evening"]).describe("daytime 为晨间空腹；evening 为晚间非空腹");
const nullableText = z.string().nullable().optional();
const saveRecord = z.object({ kind: z.literal("save_record"), date, period, recordId: z.string().optional(), version: z.string().optional(), weightKg: nullableText.describe("kg 十进制字符串；未知为 null"), bodyFatPercent: nullableText.describe("百分比十进制字符串；未知为 null"), sourceUnspecifiedConfirmed: z.boolean().optional().describe("仅在用户明确同意不填写来源时为 true，同时 deviceLabel 为 null；未回答不能代确认"), deviceLabel: nullableText.describe("用户提供并确认的真实设备／应用来源名称。未提供时先询问，不能用 ChatGPT 手动提供、设备未注明等描述代填。用户明确不填时传 null 和 sourceUnspecifiedConfirmed=true"), fasting: z.boolean().nullable().optional(), timezone: nullableText.describe("当次 +08:00 等偏移或 IANA 时区；省略新记录采用默认时区，旧记录保留原值") }).strict();
const outputSchema = z.object({ fieldDefinitions: z.record(z.string(), z.string()).optional().describe(aiFieldDefinitionsDescription) }).catchall(z.unknown());

function toolPolicy(scopes: string[], readOnly: boolean, profile = false) {
  return { outputSchema, annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes }], ...(profile ? { "openai/profile": true } : {}) } };
}

export function createFormwardMcp(db: Database, identity: AiIdentity, grantedScopes: string[], request: Request) {
  const resource = new URL("/api/mcp", regionConfig().enabled ? regionConfig().canonical : siteOrigin(request)).href;
  const server = new McpServer({ name: "Formward", version: "1.18.1" }, { instructions: "常见单餐、消耗和餐内局部修改新增preview_meal、preview_energy、preview_meal_changes；旧通用提交仍兼容，跨域混合请求仍使用submit_record_operation保持一个确认链接。查询可用range及view=summary，需修改再用details取得版本；只有status为confirmed/completed且逐项已保存，才可声称保存成功。过期、未知与明确0分别处理。用户明确要求完整接入或补齐授权时，先调用authorize_formward一次请求身体、饮食、消耗和训练的查询与提交预览权限；此工具不生成健康预览，仍需用户OAuth同意。查询自己的身体记录时使用 query_measurements。身体记录的新录入、历史修改通过 submit_measurement_operation 生成预览，将 confirmationUrl 完整提供给用户，等待用户在 Formward 网页确认。不要声称预览已经保存。未知值为 null，只接收实测，不把体重差解释为确定的热量或因果。重复提交沿用相同 operationId。用户未提供测量来源时，先询问实际设备／应用来源或是否确认不填写；可以列出查询返回的历史 sources 供选择，不能擅自沿用，也不能把 ChatGPT／手动提供当作测量来源。用户明确留空时传 deviceLabel:null 和 sourceUnspecifiedConfirmed:true。响应 needsUserInput 非空时说明待补信息，询问用户或让其在网页补填，不能把有问题的预览说成可直接保存。" + mealAiInstructions + recordAiInstructions + energyAiInstructions + trainingAiInstructions + "\n" + aiInterpretationRules });
  async function execute(tool: AiToolName, scopes: string[], work: () => Promise<Record<string, unknown>>) {
    try {
      if (scopes.some(scope => !grantedScopes.includes(scope))) throw new ApiError(403, "insufficient_scope", "当前账号连接缺少权限，请重新授权。");
      const data = withAiFieldDefinitions(tool, await work());
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data, ...(data.status === "failed" ? { isError: true } : {}) };
    } catch (error) {
      const failure = safeAiError(error);
      const challenge = `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/api/mcp", resource).href}", error="${failure.status === 403 ? "insufficient_scope" : "invalid_token"}", error_description="Please authorize Formward record access together", scope="${authorizationScopes(scopes, grantedScopes).join(" ")}"`;
      const data = { error: failure.error, ...aiRecovery(failure.error.code, failure.status) };
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data, isError: true,
        ...([401, 403].includes(failure.status) ? { _meta: { "mcp/www_authenticate": [challenge] } } : {}) };
    }
  }
  server.registerTool("authorize_formward", { title: "统一授权 Formward 记录能力", description: "用户要求连接Formward、补齐授权或统一开启身体、饮食／食材、消耗、训练计划的查询与提交预览时使用。一次请求四类记录的读写权限，由用户在OAuth网页同意；仅检查连接，不读取健康内容、不创建预览或保存记录。只读使用者的日常查询继续使用原查询工具；用户未要求完整接入时不主动请求提交权限。成功后所有正式保存仍需用户网页登录确认。" + aiFieldHint("authorize_formward"), inputSchema: z.object({}).strict(), ...toolPolicy(completeRecordScopes, true) }, () => execute("authorize_formward", completeRecordScopes, async () => ({ connected: true, access: "read_and_submit_previews", domains: ["measurements", "meals", "energy", "training"], requiresWebConfirmation: true })));
  server.registerTool("get_profile", { title: "查看已连接账号", description: "查看本次 OAuth 连接对应的 Formward 账号，返回稳定标识和显示名称。" + aiFieldHint("get_profile"), inputSchema: z.object({}).strict(), ...toolPolicy(["profile"], true, true) }, () => execute("get_profile", ["profile"], async () => {
    const [profile] = await db.select({ id: user.id, displayName: user.name }).from(user).where(eq(user.id, identity.userId));
    if (!profile) throw new ApiError(401, "invalid_token", "账号不存在。");
    return profile;
  }));
  server.registerTool("query_measurements", { title: "查询身体记录", description: "查询本人实测体重、体脂。常见分析用range=last7/last30和view=summary；details返回编辑所需id/updatedAt。未知null，体脂变化为百分点。同日时段采用最后保存值，无需选择候选；新摘要七日统计锚定所查日期，旧完整返回的summary仍是当前最新七日，scope明确标识。分页须读到hasMore=false。" + aiFieldHint("query_measurements"), inputSchema: z.object({ ...queryOptions, choices: z.record(z.string(), z.string()).optional().meta({ deprecated: true, description: "旧参数仅兼容校验；采用规则始终为同日时段最后保存实测，不再要求选择候选" }) }).strict(), ...toolPolicy([READ_SCOPE], true) }, args => execute("query_measurements", [READ_SCOPE], async () => {
    const params = queryParameters(args), timezone = params.get("timezone")!;
    if (params.has("view")) {
      if (args.choices !== undefined) throw new ApiError(400, "invalid_input", "新摘要不接收已退役的choices参数。");
      return queryAiMeasurementPage(db, identity.userId, params, timezone);
    }
    params.delete("timezone");
    if (args.choices) params.set("choices", JSON.stringify(args.choices));
    return queryAiMeasurements(db, identity.userId, params, timezone);
  }));
  server.registerTool("submit_measurement_operation", { title: "提交身体记录审核", description: "将用户提供的录入、带 recordId+version 的历史修改提交为待审核预览，最多 100 条、64 KiB。数值使用十进制字符串，晨间须 fasting=true。提交前先确认来源：用户提供实际名称，或明确同意不填写，使用 deviceLabel:null 和 sourceUnspecifiedConfirmed:true；用户未回答则先询问，不能创造占位来源。重复请求必须沿用同一 operationId，不能用同一 ID 改内容。返回 confirmationUrl 后要求用户登录网页确认；此工具不会保存健康记录。" + aiFieldHint("submit_measurement_operation"), inputSchema: z.object({ operationId: z.string().regex(/^[a-zA-Z0-9-]{8,120}$/).describe("为本次请求生成唯一标识，重试保持不变"), items: z.array(z.discriminatedUnion("kind", [saveRecord])).min(1).max(100), timezone: z.string().optional().describe("新记录默认使用的用户时区，未提供时采用服务器配置") }).strict(), ...toolPolicy([WRITE_SCOPE], false) }, args => execute("submit_measurement_operation", [WRITE_SCOPE], async () => {
    const input = { kind: "batch", operationId: args.operationId, items: args.items };
    if (Buffer.byteLength(JSON.stringify(input)) > 65536) throw new ApiError(413, "invalid_input", "单次操作内容超过 64 KiB。");
    const timezone = args.timezone ?? systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE); validateMeasurementTimezone(timezone);
    const result = await submitAiMeasurementOperation(db, identity, input, timezone);
    return { ...result, confirmationUrl: aiConfirmationUrl(request, result.confirmationPath) };
  }));
  server.registerTool("get_measurement_operation", { title: "查询审核结果", description: "按提交返回的 id 查询当前账号的审核状态、逐行结果与数量。confirmed/completed 中的 counts 才表示已保存或已取消；pending 表示仍等待网页确认。" + aiFieldHint("get_measurement_operation"), inputSchema: z.object({ id: z.string(), view: z.enum(["status"]).optional() }).strict(), ...toolPolicy([READ_SCOPE], true) }, args => execute("get_measurement_operation", [READ_SCOPE], async () => {
    const operation = await getAiMeasurementOperation(db, identity.userId, args.id);
    return args.view ? { id: operation.id, revision: operation.revision, status: operation.status, counts: operation.counts, expiresAt: operation.expiresAt, requiresWebConfirmation: operation.status === "pending" } : operation;
  }));
  server.registerTool("search_foods", { title: "查找食材规格", description: "搜索当前账号的食物名称、品牌和做法，返回稳定id、version、基准数量、单位、营养、来源及食材说明规则。查询后再引用，估算保留成分分量与计算，不写个人餐次背景。" + aiFieldHint("search_foods"), inputSchema: z.object({ q: z.string().max(200).optional() }).strict(), ...toolPolicy([MEALS_READ_SCOPE], true) }, args => execute("search_foods", [MEALS_READ_SCOPE], () => queryFoods(db, identity.userId, args.q)));
  server.registerTool("import_meal_images", { title:"保存饮食原图", description: "接收用户上传的1–8张JPEG／PNG／WebP原图（每张最大20 MiB），私有保存后返回稳定附件ID；不保存正式餐次。使用返回id作为餐次或食材的imageIds。仅图片先问日期、餐次、身份、实际食用量与额外油酱。" + aiFieldHint("import_meal_images"), inputSchema:imageImportSchema, ...toolPolicy([MEALS_WRITE_SCOPE],false), _meta:{...toolPolicy([MEALS_WRITE_SCOPE],false)._meta,"openai/fileParams":["files"]} }, args=>execute("import_meal_images", [MEALS_WRITE_SCOPE],async()=>importMealImages(db,identity,{...args,processingRegion:args.processingRegion??processingRegion(request.headers)})));
  server.registerTool('search_exercises', { title: '查找训练动作', description: '查询Formward统一动作库，含中文、英文、别名、类型、主要部位、器械、动作模式和记录方式。创建训练模板前先查询稳定catalogId；reps记录次数和可选重量，duration记录秒，cardio记录秒或米。' + aiFieldHint("search_exercises"), inputSchema: z.object({ q: z.string().max(200).optional(), category: z.enum(['strength','cardio','mobility']).optional(), bodyPart: z.string().max(40).optional(), equipment: z.string().max(40).optional() }).strict(), ...toolPolicy([TRAINING_READ_SCOPE], true) }, args => execute("search_exercises", [TRAINING_READ_SCOPE], async () => {
    await requireActiveAiToken(db as unknown as Parameters<typeof requireActiveAiToken>[0], identity, false, 'training');
    return { exercises: searchExercises(args.q, args.category, args.bodyPart, args.equipment), total: exerciseCatalog.length, units: { weightKg: 'kg', durationSeconds: 's', distanceMeters: 'm' } };
  }));
  server.registerTool('query_training', { title: '查询训练模板和日历计划', description: trainingAiInstructions + '查询默认覆盖过去30天至未来90天，模板全部返回；可指定from/to。返回id/version供修改，计划与已完成训练分别返回。' + aiFieldHint("query_training"), inputSchema: z.object(queryOptions).strict(), ...toolPolicy([TRAINING_READ_SCOPE], true) }, args => execute("query_training", [TRAINING_READ_SCOPE], () => args.view || args.range ? queryTrainingPage(db, identity, queryParameters(args)) : queryTraining(db, identity, args)));
  server.registerTool('submit_training_operation', { title: '提交训练模板与排期预览', description: trainingAiInstructions + 'items每项key唯一；可同时创建新模板和多日排期。此工具不保存正式计划，不支持代用户确认或结束训练。' + aiFieldHint("submit_training_operation"), inputSchema: z.object({ operationId: z.string().regex(/^[a-zA-Z0-9-]{8,120}$/), items: z.array(z.union(trainingActionSchemas.map(schema => schema.extend({ key: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/) })))).min(1).max(100) }).strict(), ...toolPolicy([TRAINING_WRITE_SCOPE], false) }, args => execute("submit_training_operation", [TRAINING_WRITE_SCOPE], async () => {
    const operation = await submitRecordOperation(db, identity, args);
    return { ...operation, confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
  }));
  server.registerTool('get_training_operation', { title: '查询训练排期确认结果', description: '查询本账号训练提交的预览与确认状态。pending仍未保存，confirmed才已同步到训练日历。' + aiFieldHint("get_training_operation"), inputSchema: z.object({ id: z.string().uuid(), view: z.enum(['summary', 'status']).optional() }).strict(), ...toolPolicy([TRAINING_READ_SCOPE], true) }, args => execute("get_training_operation", [TRAINING_READ_SCOPE], async () => {
    const operation = await getRecordOperation(db, identity, args.id);
    if (recordScopes(operation.rows.map(row => row.action), false).some(scope => !grantedScopes.includes(scope))) throw new ApiError(403, 'insufficient_scope', '当前连接缺少该批次读取权限。');
    return { ...(args.view ? recordAiResponse(operation, args.view) : operation), confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
  }));
  server.registerTool("query_energy", { title: "查询热量消耗", description: energyAiInstructions + aiFieldHint("query_energy"), inputSchema: z.object({ ...queryOptions, includeMeals: z.boolean().optional().describe("热量盈余／赤字分析设true：服务器联合计算完整日摄入、消耗与净差及合计均值，排除累计与未记全日；额外需要meals:read") }).strict(), ...toolPolicy([ENERGY_READ_SCOPE], true) }, args => execute("query_energy", [ENERGY_READ_SCOPE, ...(args.includeMeals ? [MEALS_READ_SCOPE] : [])], () => queryEnergy(db, identity.userId, queryParameters(args), identity)));
  server.registerTool("query_meals", { title: "查询饮食记录", description: "查询本账号餐次、营养明细及每日已记录摄入合计。未知null，缺项标不完整，没有记录不代表零摄入。返回餐次均为已保存，day.status仅表示全天是否记全，不能当作本餐待保存；预览状态另用get_meal_operation。" + aiFieldHint("query_meals"), inputSchema: z.object(queryOptions).strict(), ...toolPolicy([MEALS_READ_SCOPE], true) }, args => execute("query_meals", [MEALS_READ_SCOPE], async () => queryMeals(db, identity.userId, queryParameters(args))));
  server.registerTool("preview_meal", { title: "新增一餐预览", description: nutritionGuidance.toolHint + "常见单餐入口。提供date、mealType、foods，营养字段平铺；默认本次总量，per_portion每份、per_reference每参考量由服务器换算。未知省略，明确0填字符串0；来源未知用unknown，估算须basis。引用食材填搜索得到的foodId、foodVersion、实际quantity和unit，不另填营养或sourceKind；foods为数组。新增一餐用本工具；向已有餐追加才用preview_meal_changes。不自动入库；多领域一次提交仍用submit_record_operation。同请求重试保持operationId和内容，只生成预览，完整提供confirmationUrl让用户网页登录确认。" + aiFieldHint("preview_meal"), inputSchema: mealPreviewSchema, ...toolPolicy([MEALS_WRITE_SCOPE], false) }, args => execute("preview_meal", [MEALS_WRITE_SCOPE], async () => {
    const operation = await previewMeal(db, identity, args);
    return { ...mealAiResponse(operation), confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
  }));
  server.registerTool("preview_energy", { title: "消耗与已完成运动预览", description: "只记录消耗或实际运动时的常用入口；全天总数用totalKcal，分项用restingKcal/activeKcal，不能混填。只有运动时只传activities，不代表全天完整。修改带dayId/dayVersion或运动id/version，省略字段保留，null清空，0是已知。inclusion只按用户明确说明，未知留空由网页核对，不按大小猜。服务器沿用正式计算与重复保护；返回operationType=record，用get_record_operation查结果，须网页登录确认。跨领域仍用统一提交。" + aiFieldHint("preview_energy"), inputSchema: energyPreviewSchema, ...toolPolicy([ENERGY_WRITE_SCOPE], false) }, args => execute("preview_energy", [ENERGY_WRITE_SCOPE], async () => {
    const operation = await previewEnergy(db, identity, args);
    return { ...recordAiResponse(operation), confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
  }));
  server.registerTool("preview_meal_changes", { title: "局部修改餐次预览", description: nutritionGuidance.toolHint + "新增食物沿用默认估算；其余历史数值不自动补估。只提供要改的字段，服务器保留其余食物、照片、历史食材快照与精度。已保存餐次用mealId/version；待确认用previewId/revision及必要的key，仅限原授权。updateFoods定位用保存项itemId或本次index，addFoods添加，removeFoods移除餐内项，不能清空整餐。自由项本次总量只改份量须明确quantityEffect=keep_total或scale_total；库项及每份项自动换算。updateFoods营养是新的本次总量，clearFields明确清空，省略保留。新operationId标识一次修改，重试不重复增加；不正式保存，完整返回确认链接。不要把addFoods移到preview_meal；后者用foods。" + aiFieldHint("preview_meal_changes"), inputSchema: mealChangesSchema, ...toolPolicy([MEALS_WRITE_SCOPE], false) }, args => execute("preview_meal_changes", [MEALS_WRITE_SCOPE], async () => {
    const operation = await previewMealChanges(db, identity, args);
    const result = operation.operationType === "meal" ? mealAiResponse(operation) : recordAiResponse(operation);
    return { ...result, confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
  }));
  server.registerTool("submit_meal_operation", { title: "提交饮食审核", description: mealAiInstructions + aiFieldHint("submit_meal_operation"), inputSchema: publicMealInputSchema, ...toolPolicy([MEALS_WRITE_SCOPE], false) }, args => execute("submit_meal_operation", [MEALS_WRITE_SCOPE], async () => { const operation = await submitMealOperation(db, { userId: identity.userId, origin: "ai", identity }, args); return { ...operation, confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) }; }));
  server.registerTool("get_meal_operation", { title: "查询饮食审核结果", description: "pending为待确认，confirmed才已保存；只查询本账号操作。" + aiFieldHint("get_meal_operation"), inputSchema: z.object({ id: z.string().uuid(), view: z.enum(["summary", "status"]).optional() }).strict(), ...toolPolicy([MEALS_READ_SCOPE], true) }, args => execute("get_meal_operation", [MEALS_READ_SCOPE], async () => { const operation = displayMealOperation(await getMealOperation(db, identity.userId, args.id)); return { ...(args.view ? mealAiResponse(operation, args.view) : operation), confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) }; }));
  server.registerTool("submit_record_operation", { title: "提交统一记录审核", description: nutritionGuidance.toolHint + recordAiInstructions + aiFieldHint("submit_record_operation"), inputSchema: publicRecordInputSchema, ...toolPolicy([WRITE_SCOPE, MEALS_WRITE_SCOPE, ENERGY_WRITE_SCOPE, TRAINING_WRITE_SCOPE].filter(scope => grantedScopes.includes(scope)), false) }, args => execute("submit_record_operation", recordScopes(args.items, true), async () => {
    const operation = await submitRecordOperation(db, identity, args);
    return { ...operation, confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
  }));
  server.registerTool("get_record_operation", { title: "查询统一审核结果", description: "查询本账号混合批次，pending 尚未保存，confirmed 表示所选内容已保存。" + aiFieldHint("get_record_operation"), inputSchema: z.object({ id: z.string().uuid(), view: z.enum(["summary", "status"]).optional() }).strict(), ...toolPolicy([READ_SCOPE, MEALS_READ_SCOPE, ENERGY_READ_SCOPE, TRAINING_READ_SCOPE].filter(scope => grantedScopes.includes(scope)), true) }, args => execute("get_record_operation", [], async () => {
    const operation = await getRecordOperation(db, identity, args.id);
    if (recordScopes(operation.rows.map(row => row.action), false).some(scope => !grantedScopes.includes(scope))) throw new ApiError(403, "insufficient_scope", "当前连接缺少该批次读取权限，请重新授权。");
    return { ...(args.view ? recordAiResponse(operation, args.view) : operation), confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
  }));
  server.registerTool("append_pending_images",{title:"补齐待审照片",description: "经用户确认重试照片后，向原授权仍有效的待审餐次或食材追加附件；提供统一审核的key或独立饮食审核的index，revision采用刚查询的值。保留原文字、成功附件和operationId；不正式保存，仍需网页登录确认。" + aiFieldHint("append_pending_images"), inputSchema:appendPendingImagesSchema,...toolPolicy([MEALS_WRITE_SCOPE],false)},args=>execute("append_pending_images", [MEALS_WRITE_SCOPE],async()=>appendPendingImages(db,identity,args)));
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
    const identity: AiIdentity = { userId: claims.sub, oauthConnectionId: id, permission: [WRITE_SCOPE, MEALS_WRITE_SCOPE, ENERGY_WRITE_SCOPE, TRAINING_WRITE_SCOPE].some(scope => scopes.includes(scope) && connection.scopes.includes(scope)) ? "write" : "read" };
    await db.update(oauthConnection).set({ lastUsedAt: new Date() }).where(and(eq(oauthConnection.id, id), eq(oauthConnection.userId, identity.userId)));
    const handler = createMcpHandler(() => createFormwardMcp(db, identity, scopes.filter(scope => connection.scopes.includes(scope)), request), { legacy: "stateless", maxRequestBodySize: 131072 });
    await traceMcpRequest(request);
    return handler.fetch(request);
  }, { resource, issuer: new URL("/api/auth", auth.options.baseURL as string).href, ...(process.env.FORMWARD_INTERNAL_JWKS_URL ? { jwksUrl: process.env.FORMWARD_INTERNAL_JWKS_URL } : {}), challengeScopes: ["openid", "profile", "offline_access", READ_SCOPE, WRITE_SCOPE, MEALS_READ_SCOPE, MEALS_WRITE_SCOPE, ENERGY_READ_SCOPE, ENERGY_WRITE_SCOPE, TRAINING_READ_SCOPE, TRAINING_WRITE_SCOPE] });
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
    const known = ["search_exercises","query_training","submit_training_operation","get_training_operation","authorize_formward","get_profile","query_energy","query_measurements","submit_measurement_operation","get_measurement_operation","search_foods","query_meals","submit_meal_operation","get_meal_operation","import_meal_images","submit_record_operation","get_record_operation"];
    if (["submit_measurement_operation", "submit_record_operation"].includes(name)) assertBodyEstimateRemoved(input?.params?.arguments);
    if (known.includes(name)) {
      const files=input?.params?.arguments?.files, first=Array.isArray(files)?files[0]:null;
      console.info(JSON.stringify({event:"mcp_tool_call",tool:name,...(name==="import_meal_images"?{fileCount:Array.isArray(files)?files.length:null,fileShape:typeof first,hasDownloadUrl:typeof first?.download_url==="string",hasFileId:typeof first?.file_id==="string"}:{})}));
    }
  } catch(error) { if(error instanceof ApiError)throw error; }
  finally { void reader.cancel().catch(()=>{}); }
}
