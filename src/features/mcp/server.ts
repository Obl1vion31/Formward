import nutritionGuidance from "../meals/ai-nutrition-guidance.json";
import { assertBodyEstimateRemoved } from "../measurements/retirement";
import { exerciseCatalog, searchExercises } from '../training/catalog';
import { queryTraining, queryTrainingPage } from '../training/ai-api';
import { isTraining, trainingAiInstructions } from '../training/ai-model';
import { requireActiveAiToken } from '../auth/ai-tokens';
import { aiPreviewCreateNames, aiPreviewSchemas, aiPreviewResponse, createAiPreview, getAiPreview, updateAiPreview, updatePreviewSchema, type AiPreviewCreateName } from "../records/ai-previews";
import catalog from "../records/ai-tool-catalog.json";
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
import { queryMeals, queryFoods } from "../meals/ai-api";
import { mealAiInstructions } from "../meals/ai-openapi";
import { aiConfirmationUrl, queryAiMeasurements, queryAiMeasurementPage, safeAiError } from "../measurements/ai-api";

import { queryEnergy } from "../activities/ai-api";
import { isEnergy } from "../activities/model";
import { energyAiInstructions } from "../activities/ai-openapi";

import { queryOptions, queryParameters } from "../records/ai-query";
import { aiFieldHint, aiFieldDefinitionsDescription, aiInterpretationRules, withAiFieldDefinitions, retiredAiToolNames, type AiToolName } from "../records/ai-field-definitions";
import { aiRecovery } from "../records/ai-response";

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
const outputSchema = z.object({ fieldDefinitions: z.record(z.string(), z.string()).optional().describe(aiFieldDefinitionsDescription) }).catchall(z.unknown());

function toolPolicy(scopes: string[], readOnly: boolean, profile = false) {
  return { outputSchema, annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes }], ...(profile ? { "openai/profile": true } : {}) } };
}

export function createFormwardMcp(db: Database, identity: AiIdentity, grantedScopes: string[], request: Request) {
  const resource = new URL("/api/mcp", regionConfig().enabled ? regionConfig().canonical : siteOrigin(request)).href;
  const server = new McpServer({ name: "Formward", version: "2.0.0" }, { instructions: "18项工具按职责分开：新增餐次preview_meals，修改已保存餐次preview_meal_changes，食材库preview_foods；身体preview_measurements、消耗preview_energy、训练preview_training。至少两类功能动作才用preview_record_bundle，一个任务一个顶层预览。已有待审草稿一律update_preview局部修改或补照片，get_preview查询最新版本与实际保存状态。旧工具名已停用，旧会话须刷新目录；不得另找创建入口重复建餐。查询可用range及view=summary，需修改再用details取得版本；只有status为confirmed/completed且逐项已保存，才可声称保存成功。过期、未知与明确0分别处理。用户明确要求完整接入或补齐授权时，先调用authorize_formward一次请求身体、饮食、消耗和训练的查询与提交预览权限；此工具不生成健康预览，仍需用户OAuth同意。查询自己的身体记录时使用 query_measurements。身体记录的新录入、历史修改通过 preview_measurements 生成预览，将 confirmationUrl 完整提供给用户，等待用户在 Formward 网页确认。不要声称预览已经保存。未知值为 null，只接收实测，不把体重差解释为确定的热量或因果。重复提交沿用相同 operationId。用户未提供测量来源时，先询问实际设备／应用来源或是否确认不填写；可以列出查询返回的历史 sources 供选择，不能擅自沿用，也不能把 ChatGPT／手动提供当作测量来源。用户明确留空时传 deviceLabel:null 和 sourceUnspecifiedConfirmed:true。响应 needsUserInput 非空时说明待补信息，询问用户或让其在网页补填，不能把有问题的预览说成可直接保存。" + mealAiInstructions + recordAiInstructions + energyAiInstructions + trainingAiInstructions + "\n" + aiInterpretationRules });
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
    return { ...profile, grantedScopes, availableCapabilities: Object.keys(catalog).filter(name => name.startsWith("query_") || name.startsWith("preview_")).filter(name => { const domain = name.includes("measurement") ? "measurements" : name.includes("training") ? "training" : name.includes("energy") ? "energy" : name.includes("food") || name.includes("meal") ? "meals" : null; return domain !== null && grantedScopes.includes(domain + (name.startsWith("query_") ? ":read" : ":write")); }), missingScopes: completeRecordScopes.filter(scope => !grantedScopes.includes(scope)) };
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


  server.registerTool("search_foods", { title: "查找食材规格", description: "搜索当前账号的食物名称、品牌和做法，返回稳定id、version、基准数量、单位、营养、来源及食材说明规则。查询后再引用，估算保留成分分量与计算，不写个人餐次背景。" + aiFieldHint("search_foods"), inputSchema: z.object({ q: z.string().max(200).optional() }).strict(), ...toolPolicy([MEALS_READ_SCOPE], true) }, args => execute("search_foods", [MEALS_READ_SCOPE], () => queryFoods(db, identity.userId, args.q)));
  server.registerTool("import_meal_images", { title:"保存饮食原图", description: "接收用户上传的1–8张JPEG／PNG／WebP原图（每张最大20 MiB），私有保存后返回稳定附件ID；不保存正式餐次。使用返回id作为餐次或食材的imageIds。仅图片先问日期、餐次、身份、实际食用量与额外油酱。" + aiFieldHint("import_meal_images"), inputSchema:imageImportSchema, ...toolPolicy([MEALS_WRITE_SCOPE],false), _meta:{...toolPolicy([MEALS_WRITE_SCOPE],false)._meta,"openai/fileParams":["files"]} }, args=>execute("import_meal_images", [MEALS_WRITE_SCOPE],async()=>importMealImages(db,identity,{...args,processingRegion:args.processingRegion??processingRegion(request.headers)})));
  server.registerTool('search_exercises', { title: '查找训练动作', description: '查询Formward统一动作库，含中文、英文、别名、类型、主要部位、器械、动作模式和记录方式。创建训练模板前先查询稳定catalogId；reps记录次数和可选重量，duration记录秒，cardio记录秒或米。' + aiFieldHint("search_exercises"), inputSchema: z.object({ q: z.string().max(200).optional(), category: z.enum(['strength','cardio','mobility']).optional(), bodyPart: z.string().max(40).optional(), equipment: z.string().max(40).optional() }).strict(), ...toolPolicy([TRAINING_READ_SCOPE], true) }, args => execute("search_exercises", [TRAINING_READ_SCOPE], async () => {
    await requireActiveAiToken(db as unknown as Parameters<typeof requireActiveAiToken>[0], identity, false, 'training');
    return { exercises: searchExercises(args.q, args.category, args.bodyPart, args.equipment), total: exerciseCatalog.length, units: { weightKg: 'kg', durationSeconds: 's', distanceMeters: 'm' } };
  }));
  server.registerTool('query_training', { title: '查询训练模板和日历计划', description: trainingAiInstructions + '查询默认覆盖过去30天至未来90天，模板全部返回；可指定from/to。返回id/version供修改，计划与已完成训练分别返回。' + aiFieldHint("query_training"), inputSchema: z.object(queryOptions).strict(), ...toolPolicy([TRAINING_READ_SCOPE], true) }, args => execute("query_training", [TRAINING_READ_SCOPE], () => args.view || args.range ? queryTrainingPage(db, identity, queryParameters(args)) : queryTraining(db, identity, args)));


  server.registerTool("query_energy", { title: "查询热量消耗", description: energyAiInstructions + aiFieldHint("query_energy"), inputSchema: z.object({ ...queryOptions, includeMeals: z.boolean().optional().describe("热量盈余／赤字分析设true：服务器联合计算完整日摄入、消耗与净差及合计均值，排除累计与未记全日；额外需要meals:read") }).strict(), ...toolPolicy([ENERGY_READ_SCOPE], true) }, args => execute("query_energy", [ENERGY_READ_SCOPE, ...(args.includeMeals ? [MEALS_READ_SCOPE] : [])], () => queryEnergy(db, identity.userId, queryParameters(args), identity)));
  server.registerTool("query_meals", { title: "查询饮食记录", description: "查询本账号餐次、营养明细及每日已记录摄入合计。未知null，缺项标不完整，没有记录不代表零摄入。返回餐次均为已保存，day.status仅表示全天是否记全，不能当作本餐待保存；预览状态另用get_preview。" + aiFieldHint("query_meals"), inputSchema: z.object(queryOptions).strict(), ...toolPolicy([MEALS_READ_SCOPE], true) }, args => execute("query_meals", [MEALS_READ_SCOPE], async () => queryMeals(db, identity.userId, queryParameters(args))));








  const previewScopes: Record<AiPreviewCreateName, string[]> = { preview_measurements: [WRITE_SCOPE], preview_meals: [MEALS_WRITE_SCOPE], preview_foods: [MEALS_WRITE_SCOPE], preview_meal_changes: [MEALS_WRITE_SCOPE], preview_energy: [ENERGY_WRITE_SCOPE], preview_training: [TRAINING_WRITE_SCOPE], preview_record_bundle: recordWriteScopes.filter(scope => grantedScopes.includes(scope)) };
  const previewDescriptions = {
  "preview_measurements": [
    "身体记录待确认预览",
    "仅身体实测新增及历史修改，items可多条，每项kind=save_record及稳定key。晨间空腹fasting=true；来源未提供先询问，用户未回答则先询问真实来源或是否明确留空，不沿用历史设备。历史修改带recordId/version。未知null，不估算身体。"
  ],
  "preview_meals": [
    "新增餐次待确认预览",
    "仅新增一餐或多餐，meals数组，每餐date、mealType、foods数组；每餐可选key。foods引用食材填foodId/foodVersion/quantity/unit，不另填营养或sourceKind；自由项营养平铺，按本次总量或每份/参考量由服务器换算。未提供实际食量先追问，已给个数不强求克重。不是已有餐追加，不自动入库。"
  ],
  "preview_foods": [
    "维护食材库待确认预览",
    "只在用户明确要求维护食材库时使用，foods数组，每项规格baseQuantity/unit及nutrition四项（未知null）。修改带正式id/version。描述食材规格，不写用户今天吃过。不会创建餐次；和记餐同时做才用组合入口。"
  ],
  "preview_training": [
    "训练模板与排期预览",
    "仅训练模板和日历计划，items数组；模板save_training_template、排期schedule_training，稳定key，新模板可用templateRef引用同批key。历史修改带id/version；不记录实际完成训练，不估算消耗。"
  ],
  "preview_energy": [
    "消耗与实际运动预览",
    "仅消耗与实际完成运动，days数组可一天或多天，每日date及totalKcal或restingKcal/activeKcal，activities可多项；不混填总数和分项。修改带dayId/dayVersion或运动id/version；省略保留、null清空、0已知。inclusion只按用户明确表达；计划用训练工具。"
  ],
  "preview_meal_changes": [
    "修改已保存餐次的预览",
    "仅修改已保存餐次，changes数组，每项mealId/version及局部字段；先query_meals取details定位。addFoods追加，updateFoods按itemId或index修改，removeFoods不清空整餐；未提供字段由服务器保留，clearNotes/clearFields明确清空。自由本次总量改份量需quantityEffect=keep_total/scale_total；库项自动换算。imageIds替换或addImageIds追加。待审草稿只能update_preview；新增餐只能preview_meals。"
  ],
  "preview_record_bundle": [
    "组合任务待确认预览",
    "仅至少两类功能动作组合，items带唯一key；食材不倒推或编造精确克数，不写个人进食背景；如身体+新餐、食材入库+新餐、新餐+历史餐次修改。单独多餐仍用preview_meals；模板+排期用preview_training，消耗+实际运动用preview_energy。餐项save_meal的items沿正式完整格式；save_food可由foodRef引用同批key。已有草稿不走本工具。"
  ]
} as const;
  for (const name of aiPreviewCreateNames) {
    const [title, hint] = previewDescriptions[name];
    server.registerTool(name, { title, description: (["preview_meals","preview_meal_changes","preview_record_bundle"].includes(name) ? nutritionGuidance.toolHint : "") + hint + "同一任务创建只用一个operationId，重试沿用；内容改变须update_preview修正原id/revision，不另建批次。只生成预览，完整提供confirmationUrl等待网页登录确认。" + aiFieldHint(name), inputSchema: aiPreviewSchemas[name], ...toolPolicy(previewScopes[name], false) }, (args: Record<string, unknown>) => execute(name, name === "preview_record_bundle" ? recordScopes((args as {items:{kind:string}[]}).items, true) : previewScopes[name], async () => {
      const operation = await createAiPreview(db, identity, name, args);
      if (recordScopes(operation.rows.map(row => row.action),true).some(scope => !grantedScopes.includes(scope))) throw new ApiError(403,"insufficient_scope","缺少原预览实际领域的提交权限。");
      return { ...aiPreviewResponse(operation), confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
    }));
  }
  server.registerTool("get_preview", { title: "查询预览及实际保存状态", description: "统一查询本人任意身体、餐次、食材、消耗、训练或组合预览，传工具返回的id。旧预览编号仍可查。summary含稳定key和当前内容，status只查阶段。pending未保存；只有confirmed/completed且逐项已保存才可声称正式保存。不需要为凑流程在创建后立即再查。" + aiFieldHint("get_preview"), inputSchema: z.object({ id: z.string().uuid(), view: z.enum(["summary","status"]).optional() }).strict(), ...toolPolicy(recordReadScopes.filter(scope => grantedScopes.includes(scope)), true) }, args => execute("get_preview", [], async () => {
    const operation = await getAiPreview(db,identity,args.id);
    if (recordScopes(operation.rows.map(row => row.action),false).some(scope => !grantedScopes.includes(scope))) throw new ApiError(403,"insufficient_scope","缺少该预览实际领域的读取权限。");
    return { ...aiPreviewResponse(operation,args.view), confirmationUrl: aiConfirmationUrl(request,operation.confirmationPath) };
  }));
  server.registerTool("update_preview", { title: "局部修改原待审草稿", description: nutritionGuidance.toolHint + "仅原授权且未过期未保存的草稿，传原id、最新revision及新的修改operationId；重试同ID同内容。changes按原key只传变化：餐次kind=save_meal，updateFoods按index/itemId修改；其他kind沿原save_record/save_food/save_energy_day/save_activity/save_training_template/schedule_training。省略保留，允许的null或clearFields才清空。补照片用addImageIds，先import_meal_images得到本人附件。确实漏项用appendItems新key追加；不重复列原项目、不替换已有历史对象。自由总量改数量须quantityEffect，库项自动换算。不创建第二份预览、不确认保存。" + aiFieldHint("update_preview"), inputSchema: updatePreviewSchema, ...toolPolicy(recordWriteScopes.filter(scope => grantedScopes.includes(scope)), false) }, args => execute("update_preview", [], async () => {
    const operation=await updateAiPreview(db,identity,args,new Date(),grantedScopes);
    return { ...aiPreviewResponse(operation), confirmationUrl: aiConfirmationUrl(request,operation.confirmationPath) };
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
    const identity: AiIdentity = { userId: claims.sub, oauthConnectionId: id, permission: [WRITE_SCOPE, MEALS_WRITE_SCOPE, ENERGY_WRITE_SCOPE, TRAINING_WRITE_SCOPE].some(scope => scopes.includes(scope) && connection.scopes.includes(scope)) ? "write" : "read" };
    await db.update(oauthConnection).set({ lastUsedAt: new Date() }).where(and(eq(oauthConnection.id, id), eq(oauthConnection.userId, identity.userId)));
    const handler = createMcpHandler(() => createFormwardMcp(db, identity, scopes.filter(scope => connection.scopes.includes(scope)), request), { legacy: "stateless", maxRequestBodySize: 131072 });
    await traceMcpRequest(request);
    const retired = retiredToolFailure(await request.clone().json().catch(() => null));
    if (retired) return Response.json(retired);
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


/** 退役名只返回刷新提示，不注册隐藏工具，也不转接或执行业务。 */
export function retiredToolFailure(input: unknown) {
  const value=input as {id?:unknown;method?:string;params?:{name?:string}}|null;
  if(value?.method!=="tools/call" || !value.params?.name || !retiredAiToolNames.includes(value.params.name)) return null;
  return {jsonrpc:"2.0",id:value.id??null,error:{code:-32602,message:"此工具已在Formward MCP 2.0停用，请刷新工具目录或重新开启对话。创建用对应preview工具，查状态用get_preview，修改原草稿用update_preview；本次没有执行操作。"}};
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
    const known = Object.keys(catalog);
    if (["preview_measurements", "preview_record_bundle", "update_preview"].includes(name)) assertBodyEstimateRemoved(input?.params?.arguments);
    if (known.includes(name)) {
      const files=input?.params?.arguments?.files, first=Array.isArray(files)?files[0]:null;
      console.info(JSON.stringify({event:"mcp_tool_call",tool:name,...(name==="import_meal_images"?{fileCount:Array.isArray(files)?files.length:null,fileShape:typeof first,hasDownloadUrl:typeof first?.download_url==="string",hasFileId:typeof first?.file_id==="string"}:{})}));
    }
  } catch(error) { if(error instanceof ApiError)throw error; }
  finally { void reader.cancel().catch(()=>{}); }
}
