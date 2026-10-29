"use server";
import { headers } from "next/headers";
import { getDatabase } from "@/db/client";
import { accountRequestSource, withCurrentSession } from "@/features/auth/server";
import { accountFailure, createAccountInvitation, loadAccountAdmin, manageAccount, recordAdminRejection, revokeAccountInvitation, unlockAccountAdmin, type AccountCommand, type AdminFilter } from "@/features/auth/account-management";
import { siteOrigin, isAccountRequestOrigin } from "@/features/auth/site-url";
import { ApiError } from "@/features/auth/ai-identity";

async function perform<T>(work: (proof: import("@/features/auth/account-security").SessionProof, requestHeaders: Headers) => Promise<T>, audit?: { action: string; userId?: string; email?: string }) {
  try {
    const requestHeaders = await headers();
    if (!isAccountRequestOrigin(requestHeaders)) throw new ApiError(403, "forbidden", "请求来源无效，请刷新页面重试。");
    return await withCurrentSession(requestHeaders, async (_user, proof) => {
      try { return { ok: true as const, data: await work(proof, requestHeaders) }; }
      catch (error) { if (audit) await recordAdminRejection(getDatabase(), proof, audit.action, audit, error); throw error; }
    });
  } catch (error) { return accountFailure(error); }
}
function linkResult(result: { rawToken: string | null; expiresAt: string; repeated: boolean } | null) {
  if (!result) return null;
  const base = process.env.BETTER_AUTH_URL!;
  return { url: result.rawToken ? `${new URL("/account/claim", siteOrigin(new Request(base), base)).href}#token=${result.rawToken}` : null, expiresAt: result.expiresAt, repeated: result.repeated };
}
export async function unlockAdminAction(password: string) { return perform((proof, requestHeaders) => unlockAccountAdmin(getDatabase(), proof, password, accountRequestSource(requestHeaders))); }
export async function loadAdminAction(filter: AdminFilter) { return perform(proof => loadAccountAdmin(getDatabase(), proof, filter)); }
export async function inviteAccountAction(email: string, requestId: string) { return perform(async proof => linkResult(await createAccountInvitation(getDatabase(), proof, email, requestId)), { action: "invite_created", email }); }
export async function revokeInvitationAction(id: string, requestId: string) { return perform(async proof => { await revokeAccountInvitation(getDatabase(), proof, id, requestId); return null; }); }
export async function manageAccountAction(id: string, command: AccountCommand, reason: string, requestId: string) { return perform(async proof => linkResult(await manageAccount(getDatabase(), proof, id, command, reason, requestId)), { action: ["suspend", "restore", "revoke_access", "reset_password"].includes(command) ? command : "invalid_operation", userId: id }); }
