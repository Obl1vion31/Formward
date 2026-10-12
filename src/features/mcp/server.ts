import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { requireMcpAuth } from "@better-auth/mcp";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { oauthConnection, user } from "../../db/schema";
import type { createAuth } from "../auth/auth";
import { siteOrigin } from "../auth/site-url";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { CONNECTION_CLAIM, READ_SCOPE, WRITE_SCOPE, requireOauthConnection } from "../auth/oauth-connections";
import { aiConfirmationUrl, queryAiMeasurements, safeAiError } from "../measurements/ai-api";
import { getAiMeasurementOperation, submitAiMeasurementOperation } from "../measurements/ai-operations";
import { systemMeasurementTimezone, validateMeasurementTimezone } from "../measurements/timezone";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("记录日期 YYYY-MM-DD，包含边界日期");
const period = z.enum(["daytime", "evening"]).describe("daytime 为晨间空腹；evening 为晚间非空腹");
const nullableText = z.string().nullable().optional();
const saveRecord = z.object({ kind: z.literal("save_record"), date, period, recordId: z.string().optional(), version: z.string().optional(), weightKg: nullableText.describe("kg 十进制字符串；未知为 null"), bodyFatPercent: nullableText.describe("百分比十进制字符串；未知为 null"), deviceLabel: nullableText.describe("用户提供的真实设备／应用来源名称"), fasting: z.boolean().nullable().optional(), timezone: nullableText.describe("当次 +08:00 等偏移或 IANA 时区；省略新记录采用默认时区，旧记录保留原值") }).strict();
const estimateCell = z.object({ kind: z.literal("estimate_cell"), date, period, metric: z.enum(["weightKg", "bodyFatPercent"]) }).strict();
const outputSchema = z.object({}).catchall(z.unknown());

function toolPolicy(scopes: string[], readOnly: boolean, profile = false) {
  return { outputSchema, annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes }], ...(profile ? { "openai/profile": true } : {}) } };
}

export function createFormwardMcp(db: Database, identity: AiIdentity, grantedScopes: string[], request: Request) {
  const resource = new URL("/api/mcp", siteOrigin(request)).href;
  const server = new McpServer({ name: "Formward", version: "1.0.0" }, { instructions: "查询自己的身体记录时使用 query_measurements。新录入、历史修改、估算都只通过 submit_measurement_operation 生成预览，将 confirmationUrl 完整提供给用户，等待用户在 Formward 网页确认。不要声称预览已经保存。未知值为 null，实测与估计必须区分，不把体重差解释为确定的热量或因果。重复提交沿用相同 operationId。" });
  async function execute(scopes: string[], work: () => Promise<Record<string, unknown>>) {
    try {
      if (scopes.some(scope => !grantedScopes.includes(scope))) throw new ApiError(403, "insufficient_scope", "当前账号连接缺少权限，请重新授权。");
      const data = await work();
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data };
    } catch (error) {
      const failure = safeAiError(error);
      const challenge = `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/api/mcp", resource).href}", error="${failure.status === 403 ? "insufficient_scope" : "invalid_token"}", error_description="Please reconnect Formward", scope="${scopes.join(" ")}"`;
      return { content: [{ type: "text" as const, text: failure.error.message }], structuredContent: { error: failure.error }, isError: true,
        ...([401, 403].includes(failure.status) ? { _meta: { "mcp/www_authenticate": [challenge] } } : {}) };
    }
  }
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
  server.registerTool("submit_measurement_operation", { title: "提交身体记录审核", description: "将用户提供的录入、带 recordId+version 的历史修改或显式估算提交为待审核预览，最多 100 条、64 KiB。数值使用十进制字符串，来源必填，晨间须 fasting=true。重复请求必须沿用同一 operationId，不能用同一 ID 改内容。返回 confirmationUrl 后要求用户登录网页确认；此工具不会保存健康记录。", inputSchema: z.object({ operationId: z.string().regex(/^[a-zA-Z0-9-]{8,120}$/).describe("为本次请求生成唯一标识，重试保持不变"), items: z.array(z.discriminatedUnion("kind", [saveRecord, estimateCell])).min(1).max(100), timezone: z.string().optional().describe("新记录默认使用的用户时区，未提供时采用服务器配置") }).strict(), ...toolPolicy([WRITE_SCOPE], false) }, args => execute([WRITE_SCOPE], async () => {
    const input = { kind: "batch", operationId: args.operationId, items: args.items };
    if (Buffer.byteLength(JSON.stringify(input)) > 65536) throw new ApiError(413, "invalid_input", "单次操作内容超过 64 KiB。");
    const timezone = args.timezone ?? systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE); validateMeasurementTimezone(timezone);
    const result = await submitAiMeasurementOperation(db, identity, input, timezone);
    return { ...result, confirmationUrl: aiConfirmationUrl(request, result.confirmationPath) };
  }));
  server.registerTool("get_measurement_operation", { title: "查询审核结果", description: "按提交返回的 id 查询当前账号的审核状态、逐行结果与数量。confirmed/completed 中的 counts 才表示已保存或已取消；pending 表示仍等待网页确认。", inputSchema: z.object({ id: z.string() }).strict(), ...toolPolicy([READ_SCOPE], true) }, args => execute([READ_SCOPE], async () => getAiMeasurementOperation(db, identity.userId, args.id)));
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
    const identity: AiIdentity = { userId: claims.sub, oauthConnectionId: id, permission: scopes.includes(WRITE_SCOPE) && connection.scopes.includes(WRITE_SCOPE) ? "write" : "read" };
    await db.update(oauthConnection).set({ lastUsedAt: new Date() }).where(and(eq(oauthConnection.id, id), eq(oauthConnection.userId, identity.userId)));
    const handler = createMcpHandler(() => createFormwardMcp(db, identity, scopes.filter(scope => connection.scopes.includes(scope)), request), { legacy: "stateless", maxRequestBodySize: 131072 });
    return handler.fetch(request);
  }, { resource, challengeScopes: ["openid", "profile", "offline_access", READ_SCOPE, WRITE_SCOPE] });
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
