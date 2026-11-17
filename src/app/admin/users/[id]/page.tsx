import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requirePageUser, currentSessionIdentity } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { loadAdminConsole } from "@/features/admin/queries";
import { AdminConsole } from "@/features/admin/console";
import type { AdminFilter } from "@/features/admin/model";
import { ConfirmationProvider } from "@/components/confirmation";
import { ApiError } from "@/features/auth/ai-identity";
export const metadata = {title:"Formward · 用户详情",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function UserAdminPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}){
  const actor=await requirePageUser();if(actor.role!=="owner")notFound();
  const {id}=await params, query=await searchParams,{proof}=await currentSessionIdentity(await headers());
  const filter:AdminFilter={userId:id,from:query.from,to:query.to,provider:query.provider as AdminFilter["provider"],purpose:query.purpose as AdminFilter["purpose"],page:1};
  let initial=null;try{initial=await loadAdminConsole(getDatabase(),proof,filter);}catch(error){if(error instanceof ApiError&&error.code==="not_found")notFound();if(!(error instanceof ApiError&&error.code==="verification_required"))throw error;}
  const returnTo=query.returnTo?.startsWith("/admin?")&&!query.returnTo.includes("\\")?query.returnTo:undefined;
  return <ConfirmationProvider><AdminConsole key={"user:"+id+":"+JSON.stringify(filter)} email={actor.email} totpRequired={!!actor.twoFactorEnabled} initial={initial} initialFilter={filter} fixedUserId={id} returnTo={returnTo}/></ConfirmationProvider>;
}
