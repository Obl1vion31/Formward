import { headers } from "next/headers";
import { notFound,redirect } from "next/navigation";
import { requirePageUser, currentSessionIdentity } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { loadAdminConsole } from "@/features/admin/queries";
import { AdminConsole } from "@/features/admin/console";
import type { AdminFilter } from "@/features/admin/model";
import { ConfirmationProvider } from "@/components/confirmation";
import { ApiError } from "@/features/auth/ai-identity";
import {adminLocation,safeAdminReturn,personHref} from "@/features/admin/navigation";
export const metadata = {title:"Formward · 用户详情",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function UserAdminPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}){
  const actor=await requirePageUser();if(actor.role!=="owner")notFound();
  const {id}=await params, query=await searchParams,{proof}=await currentSessionIdentity(await headers());
  const filter:AdminFilter={userId:id,from:query.from,to:query.to,model:query.model,provider:query.provider as AdminFilter["provider"],purpose:query.purpose as AdminFilter["purpose"],page:1};
  const {userView}=adminLocation(query),returnTo=safeAdminReturn(query.returnTo);
  let initial=null;try{initial=await loadAdminConsole(getDatabase(),proof,filter);}catch(error){if(error instanceof ApiError&&error.code==="not_found")notFound();if(error instanceof ApiError&&error.code==="invalid_filter")redirect(personHref(id,userView,returnTo));if(!(error instanceof ApiError&&error.code==="verification_required"))throw error;}
  return <ConfirmationProvider><AdminConsole key={JSON.stringify([id,userView,filter,returnTo])} email={actor.email} totpRequired={!!actor.twoFactorEnabled} initial={initial} initialFilter={filter} fixedUserId={id} userView={userView} returnTo={returnTo}/></ConfirmationProvider>;
}
