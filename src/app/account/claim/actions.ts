"use server";
import { headers } from "next/headers";
import { getDatabase } from "@/db/client";
import { accountRequestSource, currentUser } from "@/features/auth/server";
import { accountFailure, claimAccountLink, inspectAccountLink } from "@/features/auth/account-management";
import { isAccountRequestOrigin } from "@/features/auth/site-url";
import { ApiError } from "@/features/auth/ai-identity";

async function requestContext() {
  const requestHeaders = await headers();
  if (!isAccountRequestOrigin(requestHeaders)) throw new ApiError(403, "forbidden", "请求来源无效，请重新打开邀请链接。");
  if (await currentUser(requestHeaders)) throw new ApiError(409, "already_signed_in", "请先退出当前账号，再使用链接。");
  return requestHeaders;
}
export async function inspectClaimAction(raw: string) {
  try { await requestContext(); return { ok: true as const, data: await inspectAccountLink(getDatabase(), raw) }; }
  catch (error) { return accountFailure(error); }
}
export async function submitClaimAction(raw: string, password: string) {
  try { const requestHeaders = await requestContext(); return { ok: true as const, data: await claimAccountLink(getDatabase(), raw, password, accountRequestSource(requestHeaders)) }; }
  catch (error) { return accountFailure(error); }
}
