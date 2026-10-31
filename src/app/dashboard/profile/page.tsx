import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentPageUser,currentSessionIdentity } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { loadPersonalProfile } from "@/features/onboarding/records";
import { profileToday } from "@/features/onboarding/model";
import { ProfileForm } from "@/features/onboarding/profile-form";
import styles from "@/features/onboarding/profile.module.css";
import { DashboardHeader } from "../header";
export const metadata:Metadata={title:"Formward · 个人资料",robots:{index:false,follow:false}};
export default async function ProfilePage(){
  const user=await currentPageUser();if(!user)redirect("/");
  const {proof}=await currentSessionIdentity(await headers()),profile=await loadPersonalProfile(getDatabase(),proof);
  return <div className={"dashboard-page profile-page "+styles.profilePage}><DashboardHeader email={user.email} owner={user.role==="owner"}/><ProfileForm initial={profile} today={profileToday()}/></div>;
}
