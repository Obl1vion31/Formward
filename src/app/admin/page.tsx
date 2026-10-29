import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentPageUser, currentSessionIdentity } from "@/features/auth/server";
import { loadAccountAdmin } from "@/features/auth/account-management";
import { getDatabase } from "@/db/client";
import { ApiError } from "@/features/auth/ai-identity";
import { ConfirmationProvider } from "@/components/confirmation";
import { AdminPanel } from "@/features/auth/admin-panel";

export const metadata: Metadata = { title: "Formward · 账号管理", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function AdminPage() {
  const user = await currentPageUser();
  if (!user) redirect("/");
  if (user.role !== "owner") notFound();
  const { proof } = await currentSessionIdentity(await headers());
  let data = null;
  try { data = await loadAccountAdmin(getDatabase(), proof); }
  catch (error) { if (!(error instanceof ApiError && error.code === "verification_required")) throw error; }
  return <ConfirmationProvider><AdminPanel email={user.email} initial={data} /></ConfirmationProvider>;
}
