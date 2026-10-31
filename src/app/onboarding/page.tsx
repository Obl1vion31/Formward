import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { ConfirmationProvider } from "@/components/confirmation";
import { currentPageUser,currentSessionIdentity } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { loadPersonalProfile,requireOnboardingOwner } from "@/features/onboarding/records";
import { emptyProfile,profileToday } from "@/features/onboarding/model";
import { OnboardingFlow } from "@/features/onboarding/flow";
export const metadata:Metadata={title:"Formward · 首次使用",robots:{index:false,follow:false}};
export default async function OnboardingPage({searchParams}:{searchParams:Promise<{mode?:string|string[]}>}) {
  const user=await currentPageUser();if(!user)redirect("/");
  const {proof}=await currentSessionIdentity(await headers()),test=(await searchParams).mode==="test";
  if(test){try{await requireOnboardingOwner(getDatabase(),proof);}catch{notFound();}}
  const profile=test?{...emptyProfile,onboardingStep:"profile" as const}:await loadPersonalProfile(getDatabase(),proof);
  if(!test&&profile.onboardingStep==="complete")redirect("/dashboard");
  return <ConfirmationProvider><OnboardingFlow initial={profile} today={profileToday()} test={test}/></ConfirmationProvider>;
}
