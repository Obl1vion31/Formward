import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentPageUser, currentSessionIdentity } from "@/features/auth/server";
import { loadPersonalAccount } from "@/features/auth/account-management";
import { getDatabase } from "@/db/client";
import { AccountPanel } from "@/features/auth/account-panel";
import { DashboardHeader } from "../header";

export const metadata: Metadata = { title: "Formward · 账号设置", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function AccountPage() {
  const user = await currentPageUser(); if (!user) redirect("/");
  const { proof } = await currentSessionIdentity(await headers());
  const data = await loadPersonalAccount(getDatabase(), proof);
  return <main className="dashboard-page"><DashboardHeader email={user.email} owner={user.role === "owner"} /><AccountPanel initial={data} /></main>;
}
