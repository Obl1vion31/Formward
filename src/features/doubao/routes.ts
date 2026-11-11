import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "../../db/client";
import type { createAuth } from "../auth/auth";
import { ApiError } from "../auth/ai-identity";
import { limitAccountAttempt } from "../auth/account-security";
import { publicRequestOrigin, regionConfig } from "../auth/regions";
import type { DoubaoConfig } from "./config";
import { limitedJson, privateJson } from "./http";
import { createDoubaoMcpEndpoint } from "./mcp";
import { authorizeDoubao, exchangeDoubaoToken, refreshDoubaoToken, startDoubaoLogin } from "./oauth";

const loginInput = z.object({ app_id: z.string(), login_code: z.string().min(1).max(4096) }).strict();
const tokenInput = z.object({ app_id: z.string(), code: z.string().min(1).max(16000) }).strict();
const refreshInput = z.object({ app_id: z.string(), refresh_token: z.string().min(1).max(16000) }).strict();
const clientEventsInput = z.object({
  app_id: z.string(), trace: z.string().regex(/^native_[a-z0-9]{6,12}_[a-z0-9]{6,12}$/),
  build: z.literal("login-recovery-3"),
  events: z.array(z.object({
    stage: z.enum(["app_launch", "app_error", "login_page_created", "login_page_destroyed", "connection_mounted", "connection_unmounted", "host_phone_entry", "host_login_refused", "privacy_refused", "identity_check", "login_code_requested", "login_code_received", "login_exchange_requested", "authorization_ready", "login_failed", "webview_loaded", "webview_failed", "result_received", "result_reported", "result_failed", "connection_cancelled"]),
    elapsedMs: z.number().int().min(0).max(3_600_000),
    errorKind: z.enum(["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "Unknown"]).optional(),
    errorNo: z.number().int().min(0).max(1_000_000_000).optional(),
  }).strict()).min(1).max(12),
}).strict();
const deleteInput = z.object({
  request_id: z.string().min(1).max(200), open_id: z.string().min(1).max(512),
  event_time: z.union([z.string(), z.number()]),
  fields: z.array(z.object({ field_name: z.enum(["PHONE", "NICKNAME", "AVATAR"]), hard_delete: z.boolean() })).max(20),
  third_party_user_id: z.string().optional(), reason: z.number().optional(), data_source: z.number().optional(),
}).strict();

export async function handleDoubaoRequest(db: Database, auth: ReturnType<typeof createAuth>, config: DoubaoConfig, operation: string, request: Request) {
  const requestId = randomUUID(), started = Date.now();
  let status = 503;
  let errorCode: string | undefined;
  try {
    const origin = regionConfig().enabled ? publicRequestOrigin(request.headers) : new URL(request.url).origin;
    if (origin !== config.origin) throw new ApiError(404, "not_found", "入口不存在。");
    let response: Response;
    if (operation === "mcp") response = await createDoubaoMcpEndpoint(db, auth, config)(request);
    else if (operation === "authorize" && request.method === "GET") response = await authorizeDoubao(db, auth, config, request);
    else if (request.method !== "POST") response = privateJson({ code: 405, msg: "请求方式不支持。" }, 405);
    else if (operation === "delete-userinfo") {
      deleteInput.parse(await limitedJson(request));
      // 本接入不获取或保存宿主手机号、昵称、头像；重复通知始终是同一无副作用结果。
      // 此通知不删除 Formward 资料、健康记录或账号绑定，也不撤销 MCP 连接。
      response = privateJson({ success: true, error_code: 0, error_message: "" });
    } else {
      const input = await limitedJson(request, operation === "client-events" ? 3072 : 24576);
      if (operation === "client-events") {
        const body = clientEventsInput.parse(input);
        if (body.app_id !== config.appId) throw new ApiError(401, "invalid_app", "应用不匹配。");
        const source = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        await limitAccountAttempt(db, "doubao-client-events", source);
        // 未认证的客户端自报仅用于排错，不能作为登录、账号或授权成功的证据。
        console.info(JSON.stringify({ event: "doubao_client_events", requestId, source: "untrusted_client", trace: body.trace, build: body.build, events: body.events }));
        response = privateJson({ code: 0, msg: "success" });
      } else if (operation === "login") {
        const body = loginInput.parse(input);
        if (body.app_id !== config.appId) throw new ApiError(401, "invalid_app", "应用不匹配。");
        const source = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        await limitAccountAttempt(db, "doubao-login", source);
        response = privateJson(await startDoubaoLogin(db, auth, config, body.login_code));
      } else if (operation === "fetch-token") {
        const body = tokenInput.parse(input);
        if (body.app_id !== config.appId) throw new ApiError(401, "invalid_app", "应用不匹配。");
        response = privateJson(await exchangeDoubaoToken(db, auth, config, body.code));
      } else if (operation === "refresh-token") {
        const body = refreshInput.parse(input);
        if (body.app_id !== config.appId) throw new ApiError(401, "invalid_app", "应用不匹配。");
        response = privateJson(await refreshDoubaoToken(db, auth, config, body.refresh_token));
      } else response = privateJson({ code: 404, msg: "入口不存在。" }, 404);
    }
    status = response.status;
    return response;
  } catch (error) {
    status = error instanceof ApiError ? error.status : error instanceof z.ZodError ? 400 : 503;
    errorCode = error instanceof ApiError ? error.code : error instanceof z.ZodError ? "invalid_input" : "unavailable";
    // 刷新失效须用宿主约定的业务码触发重新登录；不签发凭据、不恢复旧授权。
    // 官方协议：https://open.doubao.com/apps-plugin/docs/backend-development/login
    if (operation === "refresh-token" && error instanceof ApiError && status === 401 && ["invalid_doubao_credential", "invalid_doubao_connection", "invalid_token"].includes(error.code)) {
      status = 200;
      return privateJson({ code: 50401, msg: "token expired" }, status);
    }
    const message = error instanceof ApiError ? error.message : status === 400 ? "请求内容无效，请核对后重试。" : "豆包接入暂时不可用，请稍后重试。";
    return privateJson({ code: status, msg: message }, status);
  } finally {
    console.info(JSON.stringify({ event: "doubao_request", requestId, endpoint: ["mcp", "authorize", "login", "fetch-token", "refresh-token", "delete-userinfo", "client-events"].includes(operation) ? operation : "unknown", appId: config.appId, stage: status < 400 && !errorCode ? "complete" : "failed", durationMs: Date.now() - started, status, ...(errorCode ? { errorCode } : {}) }));
  }
}
