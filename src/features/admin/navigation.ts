import type { AdminFilter } from "./model";

export type AdminTab="users"|"usage"|"rules"|"security";
export type UserView="summary"|"account"|"policy";
export type AccountSection="accounts"|"invitations";
export const adminSections=[['users','用户管理'],['usage','用量分析'],['rules','规则设置']] as const;
export function adminLocation(query:{tab?:string;section?:string;view?:string}) {
  const tab:AdminTab=query.tab==="overview"||query.tab==="usage"?"usage":query.tab==="tiers"||query.tab==="rules"?"rules":query.tab==="security"?"security":"users";
  return {tab,section:(query.tab==="invitations"||query.section==="invitations"?"invitations":"accounts") as AccountSection,userView:(["account","policy"].includes(query.view??"")?query.view:"summary") as UserView};
}
export function adminQuery(filter:AdminFilter={},tab:AdminTab="users") { const query=new URLSearchParams({tab});for(const[key,value]of Object.entries(filter))if(value!==undefined&&value!=="")query.set(key,String(value));return query.toString(); }
export function safeAdminReturn(value:string|undefined|null) {return value&&(/^\/admin(?:\?|$)/.test(value))&&!/[\\\u0000-\u001f\u007f]/.test(value)?value:undefined;}
export function personHref(id:string,view:UserView="summary",returnTo?:string,filter:AdminFilter={}) {
  const query=new URLSearchParams();if(view!=="summary")query.set("view",view);
  for(const key of["from","to","provider","model","purpose"]as const)if(filter[key])query.set(key,filter[key]!);
  const back=safeAdminReturn(returnTo);if(back)query.set("returnTo",back);return `/admin/users/${encodeURIComponent(id)}${query.size?"?"+query:""}`;
}
