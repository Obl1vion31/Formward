"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { changeAccountTierAction } from "@/app/admin/actions";
import { useDraftGuard } from "@/components/draft-guard";
import { LoadingLink as Link } from "@/components/loading-link";
import type { AdminConsoleData } from "./queries";
import styles from "./console.module.css";

type Person=AdminConsoleData["users"][number];
export type Tier=AdminConsoleData["memberships"][number];
export function tierAllowance(plan:Pick<Tier,"dailyBudgetCents"|"dailyRecognitionLimit"|"chatEnabled"|"mealRecognitionEnabled">) {
  return [plan.dailyBudgetCents===null?"不单独限金额":`¥${plan.dailyBudgetCents/100}／日`,plan.mealRecognitionEnabled?(plan.dailyRecognitionLimit===null?"识图不限次数":`识图${plan.dailyRecognitionLimit}次／日`):"识图关闭",plan.chatEnabled?"聊天开放":"聊天关闭"].join(" · ");
}
export function MembershipForm({person,tiers,onDirty,onVerificationRequired,refresh}:{person:Person;tiers:Tier[];onDirty:(dirty:boolean)=>void;onVerificationRequired:()=>void;refresh:()=>Promise<void>}) {
  const [selection,setSelection]=useState<string|null>(null),[saved,setSaved]=useState<{tier:string;version:number}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const baseline=saved&&saved.version>person.entitlementVersion?saved.tier:person.membershipId;
  const tier=selection??baseline,version=Math.max(saved?.version??0,person.entitlementVersion),plan=tiers.find(p=>p.id===tier);
  const requestId=useRef<string|null>(null),dirty=tier!==baseline;
  useDraftGuard(dirty,busy);useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
  async function save(event:FormEvent) {
    event.preventDefault();if(busy||!dirty||person.role==="owner")return;
    setBusy(true);setError("");setNotice("");requestId.current??=crypto.randomUUID();
    try {
      const result=await changeAccountTierAction(person.id,tier,version,requestId.current);
      if(!result.ok){setError(result.error);if(["verification_required","invalid_session","mfa_required"].includes(result.code))onVerificationRequired();if(result.code==="version_conflict"){requestId.current=null;await refresh();setError("设置已被更新，已读取最新版本。你的选择保留，请核对后保存。");}return;}
      setSaved(result.data);setSelection(null);requestId.current=null;setNotice("档位已保存，后续AI请求按新档位执行。");onDirty(false);await refresh();
    }catch{setError("保存结果暂未确认，请保留选择后重试。");}finally{setBusy(false);}
  }
  const override=person.aiPaused||person.aiDailyBudgetCents!==null||person.aiDailyRecognitionLimit!==null;
  return <section className={styles.membership} data-membership-form><h2>会员档位</h2><form onSubmit={save}><label>选择档位<select aria-label="选择档位" value={tier} disabled={busy||person.role==="owner"} onChange={e=>{setSelection(e.target.value);requestId.current=null;setNotice("");}}>{tiers.filter(p=>person.role==="owner"?p.id===person.membershipId:!p.systemOnly).map(p=><option key={p.id} value={p.id} disabled={!p.active}>{p.name}{p.active?"":"（已停用）"}{p.dailyBudgetCents===null?"":` · ¥${p.dailyBudgetCents/100}／日`}</option>)}</select></label><button disabled={busy||!dirty||person.role==="owner"}>{busy?"正在保存…":"保存档位"}</button></form>
    <p className={styles.tierHint}>{plan?tierAllowance(plan):"正在读取档位规则"}。全站共用每天¥10。</p><p className={styles.tierHint}>{override?"已设置个人限制；切换档位会保留，可在个人额度页查看或恢复默认。":"未设置个人限制，按档位默认额度执行。"} <Link prefetch={false} href="/admin?tab=rules">管理档位</Link></p>
    {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>;
}
export function MembershipPlaceholder(){return <><section className={styles.membership} data-membership-form><h2>会员档位</h2><form><label>选择档位<select aria-label="选择档位" disabled defaultValue=""><option value="">正在读取档位…</option></select></label><button disabled>保存档位</button></form><p className={styles.tierHint}><span className={styles.placeholder} aria-label="正在读取档位规则"/></p><p className={styles.tierHint}><span className={styles.placeholder} aria-label="正在读取个人限制"/> <Link prefetch={false} href="/admin?tab=rules">管理档位</Link></p></section></>;}
