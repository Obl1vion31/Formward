"use server";
import { headers } from "next/headers";
import { getDatabase } from "@/db/client";
import { accountRequestSource, withCurrentSession } from "@/features/auth/server";
import { accountFailure, changePersonalPassword, loadPersonalAccount, revokePersonalAccess, revokePersonalSession } from "@/features/auth/account-management";
import { ApiError } from "@/features/auth/ai-identity";
import { isAccountRequestOrigin } from "@/features/auth/site-url";

async function perform<T>(work: (proof: import("@/features/auth/account-security").SessionProof, requestHeaders: Headers) => Promise<T>) {
  try {
    const requestHeaders = await headers();
    if (!isAccountRequestOrigin(requestHeaders)) throw new ApiError(403, "forbidden", "请求来源无效，请刷新页面重试。");
    return await withCurrentSession(requestHeaders, async (_user, proof) => ({ ok: true as const, data: await work(proof, requestHeaders) }));
  } catch (error) { return accountFailure(error); }
}
export async function loadPersonalAccountAction() { return perform(proof => loadPersonalAccount(getDatabase(), proof)); }
export async function changePersonalPasswordAction(currentPassword: string, newPassword: string) { return perform(async (proof, requestHeaders) => { await changePersonalPassword(getDatabase(), proof, currentPassword, newPassword, accountRequestSource(requestHeaders)); return null; }); }
export async function revokePersonalAccessAction(password: string) { return perform(async (proof, requestHeaders) => { await revokePersonalAccess(getDatabase(), proof, password, accountRequestSource(requestHeaders)); return null; }); }
export async function revokePersonalSessionAction(id: string) { return perform(async proof => { await revokePersonalSession(getDatabase(), proof, id); return { signedOut: id === proof.sessionId }; }); }
