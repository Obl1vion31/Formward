import { createHash, randomUUID } from "node:crypto";
import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { oauthConnection } from "../../db/schema";
import type { createAuth } from "../auth/auth";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { CONNECTION_CLAIM, requireOauthConnection } from "../auth/oauth-connections";
import { createFormwardMcp } from "../mcp/server";
import { openIdDigest, type DoubaoConfig } from "./config";
import { canonicalResource, doubaoScopes, requireDoubaoClient } from "./oauth";
import { limitedJson, privateJson } from "./http";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => !!value && typeof value === "object" && !Array.isArray(value);
const publicMethods = new Set(["initialize", "notifications/initialized", "tools/list", "ping"]);
const queryKinds: Record<string, string> = { get_profile: "account", query_measurements: "measurements", query_meals: "meals", query_energy: "energy", query_training: "training", search_foods: "foods", search_exercises: "exercises" };
const knownTools = new Set([...Object.keys(queryKinds), "authorize_formward", "submit_measurement_operation", "get_measurement_operation", "import_meal_images", "submit_meal_operation", "get_meal_operation", "submit_training_operation", "get_training_operation", "submit_record_operation", "get_record_operation", "append_pending_images"]);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (object(value)) return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}

/** 2025 与新版 SDK 的业务结果采用同一 JSON 响应，保留 JSON-RPC id 和实际工具事实。 */
async function sdkResponseBody(response: Response): Promise<unknown> {
  if (!response.body) return null;
  if (response.headers.get("content-type")?.includes("application/json")) return limitedJson(response, 4 * 1024 * 1024);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 4 * 1024 * 1024) throw new ApiError(413, "response_too_large", "查询结果较多，请缩小日期区间。");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const frames = Buffer.concat(chunks).toString("utf8").split(/\r?\n\r?\n/);
  for (let index = frames.length - 1; index >= 0; index--) {
    const data = frames[index].split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data) continue;
    const parsed: unknown = JSON.parse(data);
    if (object(parsed) && parsed.jsonrpc === "2.0" && ("result" in parsed || "error" in parsed)) return parsed;
  }
  throw new ApiError(502, "invalid_mcp_response", "工具响应暂时不可用，请稍后重试。");
}

function presentResult(body: JsonObject, input: JsonObject, userId: string) {
  if (input.method === "tools/list" && object(body.result) && Array.isArray(body.result.tools)) {
    body.result.tools = body.result.tools.map(tool => {
      if (!object(tool)) return tool;
      const result = { ...tool };
      if (object(result._meta)) {
        const meta = Object.fromEntries(Object.entries(result._meta).filter(([key]) => key !== "securitySchemes" && !key.startsWith("openai/")));
        if (Object.keys(meta).length) result._meta = meta; else delete result._meta;
      }
      return result;
    });
  }
  if (input.method !== "tools/call" || !object(body.result)) return { body, status: 200 };
  const result = body.result, structured = object(result.structuredContent) ? result.structuredContent : {};
  if (result.isError === true) {
    const error = object(structured.error) ? structured.error : null;
    const authentication = error && ["invalid_token", "read_only", "insufficient_scope", "forbidden"].includes(String(error.code));
    const message = error && typeof error.message === "string" ? error.message : "输入未通过校验，请核对字段后重试。";
    body.result = { content: [{ type: "text", text: message }], structuredContent: { code: authentication ? 401 : 400, message }, isError: true };
    return { body, status: authentication ? 401 : 200 };
  }
  const params = object(input.params) ? input.params : {}, kind = queryKinds[String(params.name)];
  if (kind) {
    const id = createHash("sha256").update(userId + "\0" + String(params.name) + "\0" + stableJson(params.arguments ?? {})).digest("hex");
    result.structuredContent = { entities: [{ entity_type: "formward_query_result", entity_id: id, domain: kind, result_json: JSON.stringify(structured) }] };
  }
  return { body, status: 200 };
}

export function createDoubaoMcpEndpoint(db: Database, auth: ReturnType<typeof createAuth>, config: DoubaoConfig) {
  async function serve(request: Request, input: JsonObject, identity: AiIdentity, scopes: string[]) {
    const handler = createMcpHandler(() => createFormwardMcp(db, identity, scopes, request), { legacy: "stateless", maxRequestBodySize: 131072 });
    const started = Date.now(), params = object(input.params) ? input.params : {};
    let status = 503, successful = false;
    try {
      const response = await handler.fetch(request);
      if (response.status === 202 || response.status === 204) return new Response(null, { status: response.status, headers: { "Cache-Control": "private, no-store" } });
      const body = await sdkResponseBody(response);
      if (!object(body)) throw new ApiError(502, "invalid_mcp_response", "工具响应暂时不可用。");
      const presented = presentResult(body, input, identity.userId);
      status = response.ok ? presented.status : response.status;
      successful = status < 400 && !object(body.error) && !(object(body.result) && body.result.isError);
      return privateJson(presented.body, response.ok ? presented.status : response.status);
    } finally {
      if (input.method === "tools/call") console.info(JSON.stringify({ event: "doubao_tool", requestId: randomUUID(), endpoint: "mcp", appId: config.appId, tool: knownTools.has(String(params.name)) ? params.name : "unknown", stage: successful ? "complete" : "failed", durationMs: Date.now() - started, status }));
      await handler.close();
    }
  }
  return async (request: Request) => {
    if (request.method !== "POST") return privateJson({ error: "Method not allowed" }, 405);
    let rpcId: string | number | null = null;
    try {
      const input = await limitedJson(request.clone(), 131072);
      if (!object(input) || input.jsonrpc !== "2.0" || typeof input.method !== "string") throw new ApiError(400, "invalid_input", "MCP 请求无效。");
      if (typeof input.id === "string" || typeof input.id === "number") rpcId = input.id;
      if (publicMethods.has(input.method)) {
        return await serve(request, input, { userId: "public-tool-discovery", tokenId: "public-tool-discovery", permission: "read" }, doubaoScopes);
      }
      const openId = request.headers.get("x-db-openid"), accessToken = request.headers.get("x-db-access-token");
      if (!openId || openId.length > 512 || !accessToken || accessToken.length > 32768) throw new ApiError(401, "invalid_token", "请先在豆包连接并授权 Formward。");
      const headers = new Headers(request.headers);
      headers.set("Authorization", "Bearer " + accessToken);
      const protectedHandler = requireMcpAuth(auth, async (authenticated, claims) => {
        if (typeof claims.sub !== "string" || typeof claims.client_id !== "string" || typeof claims[CONNECTION_CLAIM] !== "string") throw new ApiError(401, "invalid_token", "账号连接无效。");
        const client = await requireDoubaoClient(db, config, claims.client_id, openIdDigest(config, openId));
        if (client.userId !== claims.sub) throw new ApiError(401, "invalid_token", "豆包账号绑定已变化，请重新连接。");
        const connection = await requireOauthConnection(db, claims.sub, claims[CONNECTION_CLAIM] as string, null);
        if (connection.clientId !== client.clientId) throw new ApiError(401, "invalid_token", "账号连接不匹配。");
        const granted = (typeof claims.scope === "string" ? claims.scope.split(" ") : []).filter(scope => connection.scopes.includes(scope));
        const identity: AiIdentity = { userId: claims.sub, oauthConnectionId: connection.id, permission: granted.some(scope => scope.endsWith(":write")) ? "write" : "read" };
        await db.update(oauthConnection).set({ lastUsedAt: new Date() }).where(and(eq(oauthConnection.id, connection.id), eq(oauthConnection.userId, claims.sub)));
        return serve(authenticated, input, identity, granted);
      }, { resource: canonicalResource(auth), issuer: new URL("/api/auth", auth.options.baseURL as string).href, ...(process.env.FORMWARD_INTERNAL_JWKS_URL ? { jwksUrl: process.env.FORMWARD_INTERNAL_JWKS_URL } : {}) });
      const response = await protectedHandler(new Request(request, { headers }));
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Cache-Control", "private, no-store"); responseHeaders.set("Referrer-Policy", "no-referrer");
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 503;
      const message = error instanceof ApiError ? error.message : "豆包工具暂时不可用，请稍后重试。";
      return privateJson({ jsonrpc: "2.0", id: rpcId, error: { code: -32000, message } }, status);
    }
  };
}
