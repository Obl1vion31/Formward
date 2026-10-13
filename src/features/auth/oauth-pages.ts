import { and, eq } from "drizzle-orm";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import type { Database } from "../../db/client";
import { oauthClient } from "../../db/schema";
import type { createAuth } from "./auth";
import { OAUTH_SCOPES, READ_SCOPE, WRITE_SCOPE, MEALS_READ_SCOPE, MEALS_WRITE_SCOPE } from "./oauth-connections";

export const oauthScopeLabels: Record<string, string> = { openid: "识别你的账号", profile: "读取账号显示名称", email: "读取账号邮箱", offline_access: "自动续期这次连接", [READ_SCOPE]: "查询身体记录和审核状态", [WRITE_SCOPE]: "提交身体记录预览（保存仍需网页确认）", [MEALS_READ_SCOPE]: "查询饮食、食材和审核状态", [MEALS_WRITE_SCOPE]: "提交饮食与食材预览（保存仍需网页确认）" };

export async function oauthPageRequest(db: Database, auth: ReturnType<typeof createAuth>, query: string) {
  if (query.length > 16384 || !await verifyOAuthQueryParams(query, (await auth.$context).secret)) return null;
  const params = new URLSearchParams(query), clientId = params.get("client_id"), scopes = (params.get("scope") ?? "").split(" ").filter(Boolean);
  if (!clientId || scopes.some(scope => !OAUTH_SCOPES.includes(scope))) return null;
  const [client] = await db.select({ name: oauthClient.name }).from(oauthClient).where(and(eq(oauthClient.clientId, clientId), eq(oauthClient.disabled, false)));
  // 签名 query 来自已完成官方回调校验的 authorize，保留 native loopback 的可变端口规则。
  if (!client) return null;
  return { name: client.name || "MCP 客户端", scopes: scopes.map(scope => ({ scope, label: oauthScopeLabels[scope] })) };
}

export function oauthSearchQuery(search: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  return params.toString();
}
