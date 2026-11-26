import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { ConfirmationProvider } from "@/components/confirmation";
import { TaskGuideProvider } from "@/components/task-guide";
import { currentPageUser,currentSessionIdentity } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { loadPersonalProfile,requireOnboardingOwner } from "@/features/onboarding/records";
import { emptyProfile,profileToday } from "@/features/onboarding/model";
import { OnboardingFlow } from "@/features/onboarding/flow";
import { loginDestination,loginPageUrl } from "@/features/auth/login-return";
export const metadata:Metadata={title:"Formward · 首次使用",robots:{index:false,follow:false}};
export default async function OnboardingPage({searchParams}:{searchParams:Promise<{mode?:string|string[];next?:string|string[]}>}) {
  const params=await searchParams,test=params.mode==="test",requested=loginDestination(params.next);
  const destination=!test&&requested.startsWith("/dashboard")?requested:"/dashboard";
  const user=await currentPageUser();if(!user)redirect(loginPageUrl(test?"/onboarding?mode=test":destination));
  const {proof}=await currentSessionIdentity(await headers());
  if(test){try{await requireOnboardingOwner(getDatabase(),proof);}catch{notFound();}}
  const profile=test?{...emptyProfile,onboardingStep:"profile" as const}:await loadPersonalProfile(getDatabase(),proof);
  if(!test&&profile.onboardingStep==="complete")redirect(destination);
  return <TaskGuideProvider accountId={user.id+(test?":test":"")}><ConfirmationProvider><OnboardingFlow initial={profile} today={profileToday()} test={test} destination={destination}/></ConfirmationProvider></TaskGuideProvider>;
}
