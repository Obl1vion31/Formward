"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {useDocumentInputViewport} from "@/components/input-viewport";
import {useDraftGuard} from "@/components/draft-guard";
import {loadAdminConsoleAction,loadAdminSectionAction,unlockAdminAction,loadAdminAction} from "@/app/admin/actions";
import {AdminHeading,AdminLink as Link} from "./navigation-view";
import {adminQuery,personHref,type AdminTab,type UserView,type AccountSection} from "./navigation";
import {MembershipForm} from "./membership-form";
import {PolicyForm} from "./policy-form";
import {UsagePanel} from "./usage";
import {TierManager} from "./tiers";
import {AdminListPlaceholder} from "../auth/admin-placeholder";
import {AdminPanel} from "../auth/admin-panel";
import type {AdminData,AdminFilter as AccountFilter} from "../auth/account-management";
import type {AdminConsoleData,loadAdminSection} from "./queries";
import type {AdminFilter} from "./model";
import {PersonSummary,PersonHeading} from "./person-summary";
import styles from "./console.module.css";

type AdminRead = AdminConsoleData | AdminData | Awaited<ReturnType<typeof loadAdminSection>>;
type ReloadAccounts = () => ReturnType<typeof loadAdminAction>;
function isOverview(snapshot:AdminRead):snapshot is AdminConsoleData{return "filter" in snapshot;}
const scrollPositions=new Map<string,number>();
function Moment({value}:{value:string|null}){return <>{value?new Date(value).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false}):"无"}</>;}
export function AdminConsole({email,initial,initialAccounts=null,initialFilter={},initialTab="users",fixedUserId,userView="summary",returnTo,accountSection="accounts",accountStatus="all",accountPage=1,accountSearch="",totpRequired=true}:{email:string;initial:AdminRead|null;initialAccounts?:AdminData|null;initialFilter?:AdminFilter;initialTab?:AdminTab;fixedUserId?:string;userView?:UserView;returnTo?:string;accountSection?:AccountSection;accountStatus?:AccountFilter["status"];accountPage?:number;accountSearch?:string;totpRequired?:boolean}){
 const viewportOwner=useDocumentInputViewport<HTMLDivElement>();
 const tab=fixedUserId?"users":initialTab;
 const [data,setData]=useState(initial),[draft,setDraft]=useState<AdminFilter>(initial&&isOverview(initial)?initial.filter:initialFilter),[busy,setBusy]=useState(false),[locked,setLocked]=useState(!initial),[error,setError]=useState(""),[password,setPassword]=useState(""),[code,setCode]=useState("");
 const [policyDirty,setPolicyDirty]=useState(false),[tierDirty,setTierDirty]=useState(false);useDraftGuard(policyDirty||tierDirty,busy);
 const sequence=useRef(0),active=useRef(true),legacyReload=useRef<ReloadAccounts|null>(null);
 const registerReload=useCallback((reload:ReloadAccounts|null)=>{legacyReload.current=reload;},[]),lock=useCallback(()=>setLocked(true),[]);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{if(!data||locked)return;const timer=setTimeout(()=>{setLocked(true);setError("管理验证已到期，请重新验证。筛选和输入已保留。");},Math.max(0,Date.parse(data.verifiedUntil)-Date.now()));return()=>clearTimeout(timer);},[data,locked]);
 useEffect(()=>{
  const key=()=>email+window.location.pathname+window.location.search;
  const y=scrollPositions.get(key()),frame=y===undefined?0:requestAnimationFrame(()=>window.scrollTo(0,y));
  const rememberScroll=(event:MouseEvent)=>{
   if(event.target instanceof Element&&event.target.closest("[data-admin-workspace]"))scrollPositions.set(key(),window.scrollY);
  };
  document.addEventListener("click",rememberScroll,true);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener("click",rememberScroll,true);};
 },[email]);
 async function load(next:AdminFilter){
  const request=++sequence.current;setBusy(true);setError("");
  try{
   const result=fixedUserId||tab==="usage"?await loadAdminConsoleAction({...next,...(fixedUserId?{userId:fixedUserId,page:1}:{})}):
    tab==="users"?await (legacyReload.current?.()??loadAdminAction({tab:accountSection,search:accountSearch,status:accountStatus,page:accountPage})):
    await loadAdminSectionAction(tab);
   if(!active.current||request!==sequence.current)return;
   if(result.ok){
    setData(result.data);setLocked(false);
    if(isOverview(result.data)){
     setDraft(result.data.filter);
     if(!fixedUserId)window.history.replaceState(null,"","/admin?"+adminQuery(result.data.filter,"usage"));
    }
    if(tab==="security")await legacyReload.current?.();
   }
   else{setError(result.error);if(["verification_required","invalid_session","mfa_required"].includes(result.code))lock();}
  }catch{if(active.current&&request===sequence.current)setError("暂时无法读取管理数据，请重试。已有筛选和输入保留。");}finally{if(active.current&&request===sequence.current)setBusy(false);}
 }
 async function unlock(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError("");try{const result=await unlockAdminAction(password,code);if(!result.ok){setError(result.error);return;}setPassword("");setCode("");await load(draft);}catch{setError("验证未完成，请重试。");}finally{setBusy(false);}}
 const snapshot=data&&isOverview(data)?data:null;
 const security=data&&"events" in data?data:null;
 const selected=fixedUserId?snapshot?.users.find(person=>person.id===fixedUserId):undefined,back=returnTo??"/admin?tab=users";
 const title=fixedUserId?({summary:"用户概况",account:"账号设置",policy:"个人额度"}[userView]):({users:"用户管理",usage:"用量分析",rules:"规则设置",security:"安全与操作记录"}[tab]);
 const backHref=fixedUserId&&userView!=="summary"?personHref(fixedUserId,"summary",back,draft):back;
 return <div ref={viewportOwner} data-admin-content data-document-input-viewport>
  {fixedUserId&&<Link prefetch={false} className={styles.back} href={backHref}>{userView!=="summary"?"← 返回用户概况":/[?&]tab=(usage|overview)(?:&|$)/.test(back)?"← 返回用量分析":"← 返回用户列表"}</Link>}
  <AdminHeading title={title} refreshing={!locked&&busy} onRefresh={locked?undefined:()=>void load(draft)}/>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {locked&&<form className={styles.unlock} onSubmit={unlock}><h2>验证管理身份</h2><p>{totpRequired?"输入当前密码和动态码，验证在本设备有效5分钟。":"输入当前密码，验证在本设备有效5分钟。"}</p><label>当前密码<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required maxLength={128} disabled={busy}/></label>{totpRequired&&<label>动态码<input value={code} onChange={e=>setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={6} required disabled={busy}/></label>}<button disabled={busy}>{busy?"正在验证…":"验证并进入"}</button><Link prefetch={false} href="/account/security?returnTo=%2Fadmin">{totpRequired?"管理验证器与恢复方式":"账号安全"}</Link></form>}
  {data&&<div hidden={locked} inert={locked||undefined}>
   {selected&&snapshot?<><PersonHeading person={selected}/>{userView==="summary"?<PersonSummary person={selected} id={selected.id} filter={snapshot.filter} returnTo={back}/>:userView==="account"?<><MembershipForm person={selected} tiers={snapshot.memberships} onDirty={setTierDirty} onVerificationRequired={lock} refresh={()=>load(draft)}/><section className={styles.accountOperations}><h2>账号访问</h2><AdminPanel embedded focusedUser={selected} email={email} initial={null} onRefresh={()=>load(draft)} onVerificationRequired={lock}/></section></>:<PolicyForm person={selected} onDirty={setPolicyDirty} onVerificationRequired={lock} refresh={()=>load(draft)}/>}</>:
    fixedUserId?<p className={styles.empty}>用户暂不可用，请返回用户列表重试。</p>:<>
     {tab==="users"&&<><nav className={styles.subNavigation} aria-label="用户管理分类"><Link prefetch={false} href="/admin?tab=users" aria-current={accountSection==="accounts"?"page":undefined}>账号</Link><Link prefetch={false} href="/admin?tab=users&section=invitations" aria-current={accountSection==="invitations"?"page":undefined}>邀请</Link></nav><LegacyAdmin initial={"rows" in data?data:initialAccounts} email={email} tab={accountSection} search={accountSearch} status={accountStatus} page={accountPage} registerReload={registerReload} onVerificationRequired={lock}/></>}
     {tab==="usage"&&snapshot&&<UsagePanel data={snapshot} draft={draft} setDraft={setDraft} busy={busy} load={load} onVerificationRequired={lock}/>}
     {tab==="rules"&&"memberships" in data&&<><h2>会员档位</h2><TierManager tiers={data.memberships} onDirty={setTierDirty} onVerificationRequired={lock} refresh={()=>load(draft)}/></>}
     {tab==="security"&&security&&<><section className={styles.section}><h2>近期安全事件</h2>{security.failures.length>0&&<p className={styles.error} role="status">重复验证失败提醒：最近10分钟有{security.failures.length}组账号／来源至少失败3次。</p>}{security.events.length?security.events.map(event=><div className={styles.event} key={event.id}><strong>{({authentication_failed:"登录验证失败",verification_failed:"动态码验证失败",reservation_overflow:"模型费用超出预占",rate_limited:"接口限流",mfa_verified:"动态码验证",mfa_bound:"绑定验证器",mfa_recovery:"使用恢复码",global_budget:"全站预算提醒",global_budget_blocked:"剩余额度不足以开始请求",csp_violation:"浏览器安全报告"}as Record<string,string>)[event.category]??event.category}</strong><span>{security.userOptions.find(person=>person.id===event.userId)?.email??"入口事件"}</span><time><Moment value={event.createdAt}/></time></div>):<p>尚无安全事件。</p>}<p className={styles.caption}>运行安全事件保留30天；账号和业务审计按原规则保留。</p></section><h2>账号操作记录</h2><LegacyAdmin initial={initialAccounts} email={email} tab="events" search={accountSearch} page={accountPage} registerReload={registerReload} onVerificationRequired={lock}/></>}
    </>}
  </div>}
 </div>;
}
function LegacyAdmin({initial,email,tab,search="",status="all",page=1,registerReload,onVerificationRequired}:{initial:AdminData|null;email:string;tab:"accounts"|"invitations"|"events";search?:string;status?:AccountFilter["status"];page?:number;registerReload:(reload:ReloadAccounts|null)=>void;onVerificationRequired:()=>void}){
 const [data,setData]=useState<AdminData|null>(initial),[error,setError]=useState("");
 useEffect(()=>{if(initial)return;let live=true;void loadAdminAction({tab,search,status,page}).then(result=>{if(!live)return;if(result.ok)setData(result.data);else{setError(result.error);if(["verification_required","invalid_session","mfa_required"].includes(result.code))onVerificationRequired();}}).catch(()=>{if(live)setError("暂时无法读取，请刷新重试。");});return()=>{live=false;};},[initial,tab,search,status,page,onVerificationRequired]);
 function changed(filter:AccountFilter){const query=new URLSearchParams({tab:tab==="events"?"security":"users"});if(tab==="invitations")query.set("section","invitations");if(filter.search)query.set("search",filter.search);if(filter.status&&filter.status!=="all")query.set("status",filter.status);if((filter.page??1)>1)query.set("page",String(filter.page));window.history.replaceState(null,"","/admin?"+query);}
 function userHref(id:string,filter:AccountFilter){const query=new URLSearchParams({tab:"users"});if(filter.search)query.set("search",filter.search);if(filter.status&&filter.status!=="all")query.set("status",filter.status);if((filter.page??1)>1)query.set("page",String(filter.page));return personHref(id,"summary","/admin?"+query);}
 return <div className={styles.legacy}>{error?<p role="alert">{error}</p>:data?<AdminPanel embedded email={email} initial={data} initialTab={tab} initialSearch={search} initialStatus={status} initialPage={page} registerReload={registerReload} onFilterChange={changed} userHref={userHref} onVerificationRequired={onVerificationRequired}/>:<AdminListPlaceholder tab={tab} search={search} status={status} page={page}/>}</div>;
}
