import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requirePageUser, currentSessionIdentity } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { ApiError } from "@/features/auth/ai-identity";
import { ConfirmationProvider } from "@/components/confirmation";
import { AdminConsole } from "@/features/admin/console";
import { loadAdminConsole } from "@/features/admin/queries";
import type { AdminFilter } from "@/features/admin/model";

export const metadata: Metadata = { title: "Formward · 管理后台", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const user = await requirePageUser();
  if (!user) redirect("/");
  if (user.role !== "owner") notFound();
  const { proof } = await currentSessionIdentity(await headers());
  let data = null;
  const query = await searchParams;
  const filter: AdminFilter = {from:query.from,to:query.to,userId:query.userId,provider:query.provider as AdminFilter["provider"],purpose:query.purpose as AdminFilter["purpose"],search:query.search,sort:query.sort as AdminFilter["sort"],page:query.page?Number(query.page):1};
  try { data = await loadAdminConsole(getDatabase(), proof,filter); }
  catch (error) { if(error instanceof ApiError&&["invalid_filter","not_found"].includes(error.code))redirect("/admin?tab=overview");if (!(error instanceof ApiError && error.code === "verification_required")) throw error; }
  const tab = ["overview","users","invitations","security"].includes(query.tab??"") ? query.tab as "overview"|"users"|"invitations"|"security" : "overview";
  return <ConfirmationProvider><AdminConsole key={"admin:"+JSON.stringify(filter)} email={user.email} initial={data} initialFilter={filter} initialTab={tab}/></ConfirmationProvider>;
}
