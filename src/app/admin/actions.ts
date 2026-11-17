"use server";
import { headers } from "next/headers";
import {revalidatePath} from "next/cache";
import { getDatabase } from "@/db/client";
import { accountRequestSource, withCurrentSession } from "@/features/auth/server";
import { accountFailure, createAccountInvitation, loadAccountAdmin, manageAccount, changeAccountTier, recordAdminRejection, revokeAccountInvitation, unlockAccountAdmin, type AccountCommand, type AdminFilter } from "@/features/auth/account-management";
import { siteOrigin, isAccountRequestOrigin } from "@/features/auth/site-url";
import { ApiError } from "@/features/auth/ai-identity";
import { loadAdminConsole, loadAdminDay } from "@/features/admin/queries";
import type { AdminFilter as ConsoleFilter } from "@/features/admin/model";
import { changeUserAiPolicy, type AiPolicyInput } from "@/features/admin/policy";
import { saveMembership, archiveMembership, type MembershipInput, type MembershipArchiveInput } from "@/features/admin/memberships";
import { verifySecurityAction } from "@/app/account/security/actions";

async function perform<T>(work: (proof: import("@/features/auth/account-security").SessionProof, requestHeaders: Headers) => Promise<T>, audit?: { action: string; userId?: string; email?: string },mode:"read"|"write"="write") {
  try {
    const requestHeaders = await headers();
    if (!isAccountRequestOrigin(requestHeaders)) throw new ApiError(403, "forbidden", "请求来源无效，请刷新页面重试。");
    return await withCurrentSession(requestHeaders, async (_user, proof) => {
      try { return { ok: true as const, data: await work(proof, requestHeaders) }; }
      catch (error) { if (audit) await recordAdminRejection(getDatabase(), proof, audit.action, audit, error); throw error; }
    },mode);
  } catch (error) { return accountFailure(error); }
}
async function linkResult(result: { rawToken: string | null; expiresAt: string; repeated: boolean } | null) {
  if (!result) return null;
  const base = process.env.BETTER_AUTH_URL!;
  return { url: result.rawToken ? `${new URL("/account/claim", siteOrigin(new Request(base, { headers: await headers() }), base)).href}#token=${result.rawToken}` : null, expiresAt: result.expiresAt, repeated: result.repeated };
}
export async function unlockAdminAction(password: string, code?: string) {
  const verified = await verifySecurityAction(password, code);
  if (!verified.ok) return { ok: false as const, code: "verification_required", error: verified.error };
  const result=await perform((proof, requestHeaders) => unlockAccountAdmin(getDatabase(), proof, password, accountRequestSource(requestHeaders)));
  if(result.ok)revalidatePath("/admin","layout");
  return result;
}
export async function loadAdminConsoleAction(filter: ConsoleFilter) { return perform(proof => loadAdminConsole(getDatabase(), proof, filter),undefined,"read"); }
export async function loadAdminDayAction(filter:ConsoleFilter,options:{dimension:"users"|"models";page:number}) { return perform(proof=>loadAdminDay(getDatabase(),proof,filter,options),undefined,"read"); }
export async function changeUserAiPolicyAction(input: AiPolicyInput) { return perform(proof => changeUserAiPolicy(getDatabase(), proof, input)); }
export async function saveMembershipAction(input: MembershipInput) { return perform(proof => saveMembership(getDatabase(), proof, input)); }
export async function archiveMembershipAction(input: MembershipArchiveInput) { return perform(proof => archiveMembership(getDatabase(), proof, input)); }
export async function loadAdminAction(filter: AdminFilter) { return perform(proof => loadAccountAdmin(getDatabase(), proof, filter),undefined,"read"); }
export async function inviteAccountAction(email: string, requestId: string) { return perform(async proof => linkResult(await createAccountInvitation(getDatabase(), proof, email, requestId)), { action: "invite_created", email }); }
export async function revokeInvitationAction(id: string, requestId: string) { return perform(async proof => { await revokeAccountInvitation(getDatabase(), proof, id, requestId); return null; }); }
export async function manageAccountAction(id: string, command: AccountCommand, reason: string, requestId: string) { return perform(async proof => linkResult(await manageAccount(getDatabase(), proof, id, command, reason, requestId)), { action: ["suspend", "restore", "revoke_access", "reset_password"].includes(command) ? command : "invalid_operation", userId: id }); }
export async function changeAccountTierAction(id: string, tier: string, version: number, requestId: string) { return perform(proof => changeAccountTier(getDatabase(), proof, id, tier, version, requestId), { action: "membership_changed", userId: id }); }
