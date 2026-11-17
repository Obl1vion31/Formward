"use client";
import { useEffect,useRef,useState,type FormEvent } from "react";
import { saveMembershipAction,archiveMembershipAction } from "@/app/admin/actions";
import { useDraftGuard } from "@/components/draft-guard";
import { confirmAction } from "@/components/confirmation-state";
import { tierAllowance,type Tier } from "./membership-form";
import type { MembershipInput } from "./memberships";
import styles from "./console.module.css";

export function TierManager({tiers,onDirty,onVerificationRequired,refresh}:{tiers:Tier[];onDirty:(dirty:boolean)=>void;onVerificationRequired:()=>void;refresh:()=>Promise<void>}) {
  const [editing,setEditing]=useState<string|null>(null),[notice,setNotice]=useState("");
  return <section data-tier-manager><div className={styles.tierIntro}><p className={styles.caption}>档位决定默认AI额度与权限。修改会统一影响对应用户，个人覆盖继续保留；全站每天仍共用¥10。</p><button onClick={()=>{setEditing("new");setNotice("");}} disabled={editing!==null}>新增档位</button></div>
    {notice&&<p role="status">{notice}</p>}
    <div className={styles.tierList}><div className={styles.tierListHead}><span>档位</span><span>默认额度与功能</span><span>用户</span><span/></div>{tiers.map(p=><div className={styles.tierRow} key={p.id} data-active={p.active}><div><strong>{p.name}</strong><small>{p.systemOnly?"管理员专用":p.isDefault?"新用户默认":p.active?"已启用":"已停用"}</small></div><p>{tierAllowance(p)}</p><div className={styles.tierUsers}>{p.users}人<small>{p.overrides?`${p.overrides}人有个人覆盖`:"均继承默认"}</small></div><button className={styles.secondary} aria-label={`编辑${p.name}`} disabled={editing!==null} onClick={()=>{setEditing(p.id);setNotice("");}}>编辑</button></div>)}</div>
    {editing!==null&&<TierEditor key={editing} plan={tiers.find(p=>p.id===editing)} tiers={tiers} onDirty={onDirty} onVerificationRequired={onVerificationRequired} refresh={refresh} close={()=>{setEditing(null);onDirty(false);}} complete={message=>{setEditing(null);onDirty(false);setNotice(message);}}/>}

  </section>;
}
function TierEditor({plan:livePlan,tiers,onDirty,onVerificationRequired,refresh,close,complete}:{plan?:Tier;tiers:Tier[];onDirty:(dirty:boolean)=>void;onVerificationRequired:()=>void;refresh:()=>Promise<void>;close:()=>void;complete:(message:string)=>void}) {
  const [openedPlan]=useState(livePlan),plan=livePlan??openedPlan,missing=!!openedPlan&&!livePlan;
  const [name,setName]=useState(plan?.name??""),[active,setActive]=useState(plan?.active??true),[isDefault,setDefault]=useState(plan?.isDefault??false),[chat,setChat]=useState(plan?.chatEnabled??false),[meal,setMeal]=useState(plan?.mealRecognitionEnabled??true);
  const [noBudget,setNoBudget]=useState(plan?plan.dailyBudgetCents===null:false),[budget,setBudget]=useState(String((plan?.dailyBudgetCents??100)/100)),[noCount,setNoCount]=useState(plan?plan.dailyRecognitionLimit===null:true),[count,setCount]=useState(String(plan?.dailyRecognitionLimit??4)),[reason,setReason]=useState("");
  const [version,setVersion]=useState(plan?.version??0),stale=!!livePlan&&version!==livePlan.version;
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[deleting,setDeleting]=useState(false),[replacement,setReplacement]=useState("");
  const request=useRef<string|null>(null),archiveRequest=useRef<string|null>(null);
  const [baseline]=useState(()=>JSON.stringify([name,active,isDefault,chat,meal,noBudget,budget,noCount,count,reason]));
  const dirty=baseline!==JSON.stringify([name,active,isDefault,chat,meal,noBudget,budget,noCount,count,reason]);
  useDraftGuard(dirty,busy);useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
  const form=useRef<HTMLElement>(null);useEffect(()=>{form.current?.querySelector<HTMLInputElement>("input")?.focus();},[]);
  async function failed(result:{code:string;error:string}){setError(result.error);if(["verification_required","invalid_session","mfa_required"].includes(result.code))onVerificationRequired();if(result.code==="version_conflict"){request.current=null;archiveRequest.current=null;await refresh();setError("档位已被其他操作更新。当前输入保留，请核对最新列表后再次保存。");}}
  async function save(e:FormEvent){
    e.preventDefault();if(busy||stale||missing)return;setError("");
    if(!noBudget&&(!/^\d+(\.\d{1,2})?$/.test(budget)||Number(budget)>10)||!noCount&&(!/^\d+$/.test(count)||Number(count)>100)){setError("每日金额填0–10元，最多两位小数；每日识图次数填0–100。");return;}
    const input:MembershipInput={id:plan?.id,name:name.trim(),active,isDefault,dailyBudgetCents:noBudget?null:Math.round(Number(budget)*100),dailyRecognitionLimit:noCount?null:Number(count),chatEnabled:chat,mealRecognitionEnabled:meal,version:plan?version:undefined,requestId:request.current??crypto.randomUUID(),reason};
    if(!await confirmAction({title:plan?`保存「${input.name}」？`:"新增档位？",message:plan?`将影响该档位的${plan.users}位用户，${plan.overrides}人的个人额度覆盖继续保留。${!active?"该档位的站内AI将暂停。":"后续AI请求读取新设置。"}`:"保存后即可为用户分配此档位。",confirmLabel:"保存档位",danger:!active}))return;
    request.current=input.requestId;setBusy(true);try{const result=await saveMembershipAction(input);if(!result.ok){await failed(result);return;}await refresh();complete(plan?"档位已更新，对应用户后续请求按新设置执行。":"档位已新增，可以在用户详情中分配。");}catch{setError("保存结果暂未确认，输入保留。请重试确认结果。");}finally{setBusy(false);}
  }
  async function remove(){
    if(!plan||busy||stale||missing)return;setError("");if((plan.users||plan.isDefault)&&!replacement){setError("请选择接替档位。");return;}
    const target=tiers.find(p=>p.id===replacement);
    if(!await confirmAction({title:`删除「${plan.name}」？`,message:`${plan.users?`${plan.users}位用户将转到「${target?.name}」，个人覆盖保留。`:"此档位当前没有用户。"}${plan.isDefault?"新用户默认档位也将切换。":""}健康记录、历史费用与审计保留。`,confirmLabel:"删除档位",danger:true}))return;
    archiveRequest.current??=crypto.randomUUID();setBusy(true);try{const result=await archiveMembershipAction({id:plan.id,replacementId:replacement||undefined,version,requestId:archiveRequest.current,reason});if(!result.ok){await failed(result);return;}await refresh();complete("档位已删除，现有用户已按所选档位接替。");}catch{setError("删除结果暂未确认，请重试确认结果。");}finally{setBusy(false);}
  }
  return <section className={styles.tierEditor} ref={form} aria-label={plan?`编辑${plan.name}`:"新增档位"}><h2>{plan?`编辑${plan.name}`:"新增档位"}</h2><form onSubmit={save} onChange={()=>{request.current=null;archiveRequest.current=null;setError("");}}><fieldset disabled={busy||missing}><div className={styles.tierFields}><label>档位名称<input value={name} onChange={e=>setName(e.target.value)} required maxLength={40}/></label><div><label>每日AI金额上限（元）<input aria-label="每日AI金额上限（元）" inputMode="decimal" value={noBudget?"":budget} onChange={e=>setBudget(e.target.value)} disabled={noBudget} placeholder={noBudget?"不单独限制":"0–10"}/></label><label className={styles.check}><input type="checkbox" checked={noBudget} disabled={chat} onChange={e=>setNoBudget(e.target.checked)}/>不单独限制金额</label></div><div><label>每日识图次数<input inputMode="numeric" value={noCount?"":count} onChange={e=>setCount(e.target.value)} disabled={noCount} placeholder={noCount?"不单独限制":"0–100"}/></label><label className={styles.check}><input type="checkbox" checked={noCount} onChange={e=>setNoCount(e.target.checked)}/>不单独限制次数</label></div></div>
    <div className={styles.tierChecks}><label className={styles.check}><input type="checkbox" checked={chat} onChange={e=>{setChat(e.target.checked);if(e.target.checked)setNoBudget(false);}}/>开放聊天</label><label className={styles.check}><input type="checkbox" checked={meal} onChange={e=>setMeal(e.target.checked)}/>开放识图录入</label><label className={styles.check}><input type="checkbox" checked={active} disabled={isDefault} onChange={e=>setActive(e.target.checked)}/>启用档位</label>{!plan?.systemOnly&&<label className={styles.check}><input type="checkbox" checked={isDefault} disabled={plan?.isDefault&&isDefault} onChange={e=>{setDefault(e.target.checked);if(e.target.checked)setActive(true);}}/>新用户默认档位</label>}</div><p className={styles.caption}>聊天和识图共用每日金额；0表示禁用对应额度。不单独限制时仍受全站¥10／日约束。{plan?.isDefault&&"要停用当前默认档位，请先把其他档位设为默认。"}</p><label>调整原因（选填）<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label></fieldset><div className={styles.formActions}><button type="button" className={styles.secondary} disabled={busy} onClick={async()=>{if(!dirty||await confirmAction({title:"放弃未保存的档位修改？",message:"当前填写内容尚未保存。",confirmLabel:"放弃修改",danger:true}))close();}}>取消编辑</button><button disabled={busy||stale||missing||!!plan&&!dirty}>{busy?"正在保存…":"保存档位"}</button></div></form>
    {missing&&<p className={styles.error} role="alert">此档位已被删除，当前填写保留。请取消编辑后重新选择档位；当前填写不会另建档位。</p>}
    {stale&&plan&&<div role="alert"><p className={styles.error}>档位有新版本，当前填写已保留。最新配置：{plan.name} · {plan.active?"启用":"停用"} · {plan.isDefault?"新用户默认":"非默认"} · {tierAllowance(plan)}。请与上方填写核对后再保存。</p><button className={styles.secondary} disabled={busy} onClick={()=>{setVersion(plan.version);request.current=null;archiveRequest.current=null;setError("");}}>已核对，保留当前填写</button></div>}
    {plan&&!plan.systemOnly&&<div className={styles.tierDelete}><button className={styles.secondary} disabled={busy} aria-expanded={deleting} onClick={()=>setDeleting(!deleting)}>{deleting?"取消删除":"删除档位"}</button>{deleting&&<div><p className={styles.caption}>删除后不能再分配此档位。{plan.users}位用户的历史费用和记录会保留。</p>{(plan.users>0||plan.isDefault)&&<label>接替档位<select value={replacement} onChange={e=>{setReplacement(e.target.value);archiveRequest.current=null;}} disabled={busy}><option value="">请选择接替档位</option>{tiers.filter(t=>t.id!==plan.id&&!t.systemOnly&&t.active).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}<button className={styles.dangerButton} disabled={busy||stale||missing} onClick={()=>void remove()}>确认删除档位</button></div>}</div>}{error&&<p className={styles.error} role="alert">{error}</p>}
  </section>;
}
