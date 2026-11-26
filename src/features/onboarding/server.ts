import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "../../db/client";
import { currentSessionIdentity } from "../auth/server";
import { loadPersonalProfile } from "./records";
import { loginDestination } from "../auth/login-return";

/** 仅在四个普通主页面检查，不拦截AI确认、OAuth或账号设置。 */
export async function requireCompletedOnboarding() {
  const request=await headers(),{proof}=await currentSessionIdentity(request);
  const profile=await loadPersonalProfile(getDatabase(),proof);
  if (profile.onboardingStep!=="complete") {
    const target=loginDestination(request.get("x-formward-web-path"));
    redirect(target==="/dashboard"?"/onboarding":"/onboarding?next="+encodeURIComponent(target));
  }
}
