"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadEnergySupplementAction } from "@/app/dashboard/energy/actions";
import { loadProfileAction } from "@/app/onboarding/actions";
import { saveDayAction, removeSourceAction } from "@/app/dashboard/actions";
import { ProfileForm } from "../onboarding/profile-form";
import type { PersonalProfile } from "../onboarding/model";
import { MeasurementEntry } from "../measurements/measurement-entry";
import { BodyFatContext } from "../measurements/visibility";
import { confirmAction } from "@/components/confirmation-state";
import { LocalLoading } from "@/components/local-loading";
import { activityLevels, formulaLabel, type CalculationMethod, type CalculationSnapshot, type RestingMethod } from "./calculation-model";
import styles from "./energy.module.css";

export function RestingMethodControl({value,change}:{value:RestingMethod;change:(value:RestingMethod)=>void}) {
 return <label className={styles.restingMethod}><span>静息填写方式</span><select aria-label="静息填写方式" value={value} onChange={event=>change(event.target.value as RestingMethod)}><option value="manual">手动填写</option><option value="device">设备录入</option><option value="estimate">系统估算</option></select></label>;
}
export function ActivityMethodControl({quick,change}:{quick:boolean;change:(quick:boolean)=>void}) {
 return <div className={styles.activityMethod} role="group" aria-label="活动记录方式"><button type="button" aria-pressed={quick} onClick={()=>change(true)}>活动估算</button><button type="button" aria-pressed={!quick} onClick={()=>change(false)}>运动明细</button></div>;
}
export function FormulaControl({value,change,snapshot,recalculate,loading,message,missing,supplement}:{value:CalculationMethod;change:(value:CalculationMethod)=>void;snapshot:CalculationSnapshot|null;recalculate:()=>void;loading:boolean;message:string;missing:readonly string[];supplement:(kind:"profile"|"body")=>void}) {
 return <div className={styles.calculationControls}>
  <div className={styles.formulaRow}><label><span className="sr-only">计算方式</span><select aria-label="计算方式" value={value} onChange={event=>change(event.target.value as CalculationMethod)}><option value="auto">自动选择</option><option value="cunningham">体脂公式</option><option value="mifflin-st-jeor">常规公式</option></select></label><CalculationDetails snapshot={snapshot}/><button type="button" className={styles.recalculate} disabled={loading} onClick={recalculate}><span className={styles.calculationLoading}><LocalLoading active={loading} iconOnly label="正在读取计算依据…"/></span>重新计算</button></div>
  {message&&<div className={styles.calculationStatus}><p role="status">{message}</p>
   {missing.includes("profile")&&<button type="button" onClick={()=>supplement("profile")}>补填个人资料</button>}{(missing.includes("weight")||missing.includes("bodyFat"))&&<button type="button" onClick={()=>supplement("body")}>补填身体记录</button>}
  </div>}
 </div>;
}
export function ActivityLevelControl({value,change}:{value:string|null;change:(value:typeof activityLevels[number]["id"])=>void}) {
 return <section className={styles.activityLevels}><h3>今天的活动量</h3><div role="radiogroup" aria-label="全天活动量">{activityLevels.map(level=><label key={level.id} className={styles.activityLevel}><input type="radio" name="energy-activity-level" value={level.id} checked={value===level.id} onChange={()=>change(level.id)}/><span><strong>{level.label}</strong><small>{level.example}</small></span><b>×{level.factor.toFixed(1)}</b></label>)}</div><p className={styles.hint}>粗略估算全天消耗，已包含日常活动和训练，不再叠加运动明细。</p></section>;
}
export function CalculationDetails({snapshot}:{snapshot:CalculationSnapshot|null}) {
 const id=useId(),anchor=useRef<HTMLButtonElement>(null),bubble=useRef<HTMLDivElement>(null);
 const [host,setHost]=useState<HTMLElement|null>(null),[open,setOpen]=useState(false);
 useLayoutEffect(()=>{setHost(anchor.current?.closest("dialog")??document.body);},[]);
 useLayoutEffect(()=>{
  if(!open||!host)return;
  const node=bubble.current!,button=anchor.current!;
  const place=()=>{const a=button.getBoundingClientRect(),h=host===document.body?{left:0,right:innerWidth,top:0,bottom:innerHeight}:host.getBoundingClientRect(),v=window.visualViewport;const left=Math.max(h.left,v?.offsetLeft??0)+12,right=Math.min(h.right,(v?.offsetLeft??0)+(v?.width??innerWidth))-12,top=Math.max(h.top,v?.offsetTop??0)+12,bottom=Math.min(h.bottom,(v?.offsetTop??0)+(v?.height??innerHeight))-12;node.style.width=Math.min(340,right-left)+"px";node.style.maxHeight=Math.max(80,bottom-top)+"px";const height=node.getBoundingClientRect().height;node.style.left=Math.max(left,Math.min(a.right-node.getBoundingClientRect().width,right-node.getBoundingClientRect().width))+"px";node.style.top=Math.max(top,Math.min(a.bottom+8+height<=bottom?a.bottom+8:a.top-height-8,bottom-height))+"px";};
  const outside=(event:PointerEvent)=>{if(!event.composedPath().includes(node)&&!event.composedPath().includes(button))node.hidePopover();};
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();node.hidePopover();button.focus();}};
  place();const observer=new ResizeObserver(place);observer.observe(node);observer.observe(host);document.addEventListener("pointerdown",outside,true);document.addEventListener("keydown",escape,true);document.addEventListener("scroll",place,true);window.addEventListener("resize",place);window.visualViewport?.addEventListener("resize",place);
  return()=>{observer.disconnect();document.removeEventListener("pointerdown",outside,true);document.removeEventListener("keydown",escape,true);document.removeEventListener("scroll",place,true);window.removeEventListener("resize",place);window.visualViewport?.removeEventListener("resize",place);};
 },[open,host]);
 const reference=(label:string,ref:CalculationSnapshot["weight"],unit:string)=><p>{label} {Number(ref.value)} {unit}<small>{ref.date} · {ref.period==="daytime"?"晨间":"晚间"} · {ref.source??"来源未填写"}</small></p>;
 return <><button ref={anchor} type="button" className={styles.calculationInfo} popoverTarget={id} aria-label="查看计算说明" aria-expanded={open}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6.5v7M12 16v1"/></svg></button>{host&&createPortal(<div id={id} ref={bubble} className={styles.calculationBubble} popover="manual" role="dialog" aria-label="计算说明" onToggle={event=>setOpen(event.newState==="open")}><h4>{snapshot?formulaLabel(snapshot.method):"静息估算逻辑"}</h4>{snapshot?<><p className={styles.formulaText}>{snapshot.method==="cunningham"?"500 + 22 × 体重 × (1 − 体脂率 ÷ 100)":"10 × 体重 + 6.25 × 身高 − 5 × 年龄 + 性别项"}</p>{reference("体重",snapshot.weight,"kg")}{snapshot.bodyFat&&reference("体脂率",snapshot.bodyFat,"%")}{snapshot.profile&&<p>身高 {Number(snapshot.profile.heightCm)} cm · {snapshot.profile.age} 岁 · {snapshot.profile.sexForCalculation==="male"?"男性项 +5":"女性项 −161"}<small>个人资料版本 {snapshot.profile.version} · 年龄按 {snapshot.date} 计算</small></p>}{snapshot.factor&&<p>全天 = 系统静息 × {snapshot.factor}<small>{activityLevels.find(level=>level.id===snapshot.activityLevel)?.label}，不拆分虚假的活动消耗。</small></p>}<p>保存后结果固定，资料变化需主动重新计算。</p></>:<p>自动选择优先用体脂公式；没有近期体脂时，在资料齐全后用常规公式。实测窗口为目标日期及此前30天，各项独立取最近实测，同日晨间优先。</p>}<p>公式和活动系数用于粗略估算，不能替代个体测量。</p></div>,host)}</>;
}
export function EnergySupplement({kind,date,today,close}:{kind:"profile"|"body";date:string;today:string;close:()=>void}) {
 const [profile,setProfile]=useState<PersonalProfile|null>(null),[body,setBody]=useState<Extract<Awaited<ReturnType<typeof loadEnergySupplementAction>>,{ok:true}>["data"]|null>(null),[error,setError]=useState("");
 const [changed,setChanged]=useState(false);
 useEffect(()=>{let active=true;void(async()=>{try{if(kind==="profile"){const result=await loadProfileAction();if(active){if(result.ok)setProfile(result.data);else setError(result.error);}}else{const result=await loadEnergySupplementAction(date);if(active){if(result.ok)setBody(result.data);else setError(result.error);}}}catch{if(active)setError("暂时无法读取，返回后可重试。");}})();return()=>{active=false;};},[kind,date]);
 async function back(){const forms=document.querySelectorAll('[data-energy-supplement] [aria-busy="true"]');if(forms.length)return;if(!changed||await confirmAction({title:"返回消耗记录？",message:"已保存的补填资料会保留，尚未保存的补填输入将放弃。消耗日期与草稿保持。",confirmLabel:"返回消耗"}))close();}
 return <section className={styles.energySupplement} data-energy-supplement onChangeCapture={()=>setChanged(true)}><button type="button" className={styles.calculationBack} onClick={()=>void back()}>返回消耗记录</button><h3>{kind==="profile"?"补填个人资料":"补填身体记录"}</h3>{error&&<p role="alert">{error}</p>}{!profile&&!body&&!error&&<LocalLoading active label="正在读取资料…"/>}{profile&&<ProfileForm initial={profile} today={today} embedded initialEditing onSaved={close}/>} {body&&<BodyFatContext value={true}><MeasurementEntry date={date} timezone="Asia/Shanghai" records={body.records} sources={body.sources} choices={{}} actions={{save:saveDayAction,removeSource:removeSourceAction}} onUpdated={close} onChoose={()=>{}}/></BodyFatContext>}</section>;
}
