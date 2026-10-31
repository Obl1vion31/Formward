import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "../../db/client";
import { currentSessionIdentity } from "../auth/server";
import { loadPersonalProfile } from "./records";

/** 仅在四个普通主页面检查，不拦截AI确认、OAuth或账号设置。 */
export async function requireCompletedOnboarding() {
  const {proof}=await currentSessionIdentity(await headers());
  const profile=await loadPersonalProfile(getDatabase(),proof);
  if (profile.onboardingStep!=="complete") redirect("/onboarding");
}
