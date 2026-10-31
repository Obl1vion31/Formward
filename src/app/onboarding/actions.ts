"use server";
import { headers } from "next/headers";
import { getDatabase } from "@/db/client";
import { withCurrentSession } from "@/features/auth/server";
import { accountFailure } from "@/features/auth/account-management";
import { isAccountRequestOrigin } from "@/features/auth/site-url";
import { ApiError } from "@/features/auth/ai-identity";
import { savePersonalProfile, advanceOnboarding, loadPersonalProfile } from "@/features/onboarding/records";
async function perform(work: (proof: import("@/features/auth/account-security").SessionProof) => Promise<import("@/features/onboarding/model").PersonalProfile>) {
  try {
    const requestHeaders=await headers();
    if (!isAccountRequestOrigin(requestHeaders)) throw new ApiError(403,"forbidden","请求来源无效，请刷新重试。");
    return await withCurrentSession(requestHeaders,async (_user,proof)=>({ok:true as const,data:await work(proof)}));
  } catch(error) { return accountFailure(error); }
}
export async function saveProfileAction(input:unknown) { return perform(proof=>savePersonalProfile(getDatabase(),proof,input)); }
export async function advanceOnboardingAction(input:unknown) { return perform(proof=>advanceOnboarding(getDatabase(),proof,input)); }
export async function loadProfileAction() { return perform(proof=>loadPersonalProfile(getDatabase(),proof)); }
