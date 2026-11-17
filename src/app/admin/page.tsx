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
import {adminLocation} from "@/features/admin/navigation";
import {loadAccountAdmin} from "@/features/auth/account-management";

export const metadata: Metadata = { title: "Formward · 管理后台", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const user = await requirePageUser();
  if (!user) redirect("/");
  if (user.role !== "owner") notFound();
  const { proof } = await currentSessionIdentity(await headers());
  let data = null;
  const query = await searchParams;
  const {tab,section}=adminLocation(query),accountSearch=(query.search??"").trim().slice(0,254),accountStatus=query.status==="active"||query.status==="banned"?query.status:"all",accountPage=Math.max(1,Math.min(100000,Math.floor(Number(query.page)||1)));
  const filter: AdminFilter = tab==="usage"?{from:query.from,to:query.to,userId:query.userId,model:query.model,provider:query.provider as AdminFilter["provider"],purpose:query.purpose as AdminFilter["purpose"],search:query.search,sort:query.sort as AdminFilter["sort"],page:query.page?Number(query.page):1}:{};
  let accounts=null;
  try { data = await loadAdminConsole(getDatabase(), proof,filter);if(tab==="users"||tab==="security")accounts=await loadAccountAdmin(getDatabase(),proof,{tab:tab==="security"?"events":section,search:accountSearch,status:accountStatus,page:accountPage}); }
  catch (error) { if(error instanceof ApiError&&["invalid_filter","not_found"].includes(error.code))redirect("/admin?tab=usage");if (!(error instanceof ApiError && error.code === "verification_required")) throw error;data=null; }
  return <ConfirmationProvider><AdminConsole key={JSON.stringify([tab,section,filter,accountSearch,accountStatus,accountPage])} email={user.email} totpRequired={!!user.twoFactorEnabled} initial={data} initialAccounts={accounts} initialFilter={filter} initialTab={tab} accountSection={section} accountSearch={accountSearch} accountStatus={accountStatus} accountPage={accountPage}/></ConfirmationProvider>;
}
