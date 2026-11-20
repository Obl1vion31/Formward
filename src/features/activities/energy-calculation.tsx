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
import { trackPopoverPosition } from "@/components/anchored-popover";
import { confirmAction } from "@/components/confirmation-state";
import { LocalLoading } from "@/components/local-loading";
import { calculateEnergy, activityLevels, formulaLabel, type CalculationContext, type CalculationMethod, type CalculationSnapshot, type RestingMethod } from "./calculation-model";
import styles from "./energy.module.css";
import {CalculationPopover} from "./calculation-popover";
import {energyValue} from "./model";

export function RestingMethodControl({value,change}:{value:RestingMethod;change:(value:RestingMethod)=>void}) {
 return <div className={styles.recordMethod}><span>记录方式</span><div className={styles.recordMethodButtons} role="group" aria-label="记录方式">{([["estimate","帮我估算"],["manual","手动输入"],["device","从设备同步"]] as const).map(([method,label])=><button key={method} type="button" aria-pressed={value===method} onClick={()=>change(method)}>{label}</button>)}</div></div>;
}
export function ActivityMethodControl({quick,change}:{quick:boolean;change:(quick:boolean)=>void}) {
 return <div className={styles.activityMethod} role="group" aria-label="活动记录方式"><button type="button" aria-pressed={quick} onClick={()=>change(true)}>活动估算</button><button type="button" aria-pressed={!quick} onClick={()=>change(false)}>运动明细</button></div>;
}
export function RestingEstimate({value,change,snapshot,recalculate,loading,message,missing,supplement,label="静息消耗",disabled=false}:{value:CalculationMethod;change:(value:CalculationMethod)=>void;snapshot:CalculationSnapshot|null;recalculate:()=>void;loading:boolean;message:string;missing:readonly string[];supplement:(kind:"profile"|"body")=>void;label?:string;disabled?:boolean}) {
 const [settings,setSettings]=useState(false),settingsId=useId();
 const controls=<div className={styles.calculationControls}><label className={styles.formulaLabel} htmlFor={settingsId+"-formula"}>静息计算公式</label><div className={styles.formulaRow}><label><span className="sr-only">静息计算公式</span><select id={settingsId+"-formula"} aria-label="静息计算公式" value={value} onChange={event=>change(event.target.value as CalculationMethod)}><option value="auto">自动选择</option><option value="cunningham">体脂公式</option><option value="mifflin-st-jeor">常规公式</option></select></label><button type="button" className={styles.recalculate} disabled={loading} onClick={recalculate}><span className={styles.calculationLoading}><LocalLoading active={loading} iconOnly label="正在读取计算依据…"/></span>重新计算</button></div></div>;
 return <section className={styles.restingEstimate} aria-label="静息计算结果">
  <div className={styles.estimateHeading}><span>{label}<CalculationDetails snapshot={snapshot}/></span><CalculationPopover label="计算设置" title="计算设置" open={settings} changeOpen={setSettings} disabled={disabled}>{controls}</CalculationPopover></div>
  <div className={styles.estimateReading} data-resting-result><strong>{energyValue(snapshot?.restingKcal)}</strong><span>千卡</span></div>
  {message&&<div className={styles.calculationStatus}><p role="status">{message}</p>
   {missing.includes("profile")&&<button type="button" onClick={()=>supplement("profile")}>补填个人资料</button>}{(missing.includes("weight")||missing.includes("bodyFat"))&&<button type="button" onClick={()=>supplement("body")}>补填身体记录</button>}
  </div>}
 </section>;
}
export function RestingEstimator({context,value,loading,error,apply,supplement}:{context:CalculationContext|null;value:CalculationMethod;loading:boolean;error:string;apply:(method:CalculationMethod)=>void;supplement:(kind:"profile"|"body")=>void}){
 const [choice,setChoice]=useState(value),group=useId();
 const methods=([["auto","自动选择"],["cunningham","体重与体脂"],["mifflin-st-jeor","身高、年龄与性别"]] as const).map(([method,label])=>({method,label,result:context?calculateEnergy(context,{kind:"resting",method}):null}));
 const selected=methods.find(method=>method.method===choice)!.result;
 return <section className={styles.restingEstimator} aria-label="估算静息消耗">
  <div role="radiogroup" aria-label="静息估算方法">{methods.map(({method,label,result})=><label key={method} className={styles.estimatorChoice}>
   <input type="radio" name={group} value={method} checked={choice===method} onChange={()=>setChoice(method)}/>
   <span><span className={styles.estimatorChoiceHeading}><strong>{label}</strong><b>{energyValue(!loading&&result?.ok?result.snapshot.restingKcal:null)} <small>千卡</small></b></span>
    {choice===method&&(!loading&&result?.ok?<small>{method==="auto"?"本次采用"+formulaLabel(result.snapshot.method):method==="cunningham"?"500 + 22 × 体重 × (1 − 体脂率 ÷ 100)":"10 × 体重 + 6.25 × 身高 − 5 × 年龄 + 性别项"}<span>体重 {Number(result.snapshot.weight.value)} kg · {result.snapshot.weight.date} · {result.snapshot.weight.source??"来源未填写"}{result.snapshot.bodyFat&&<>；体脂 {Number(result.snapshot.bodyFat.value)}% · {result.snapshot.bodyFat.date} · {result.snapshot.bodyFat.source??"来源未填写"}</>}{result.snapshot.profile&&<>；{Number(result.snapshot.profile.heightCm)} cm · {result.snapshot.profile.age} 岁 · {result.snapshot.profile.sexForCalculation==="male"?"男性项 +5":"女性项 −161"}</>}</span></small>:<small>{loading?"正在读取计算依据…":result&&!result.ok?result.message:error||"暂时没有计算依据。"}</small>)}
   </span>
  </label>)}</div>
  {!loading&&selected&&!selected.ok&&<div className={styles.calculationStatus}>{selected.missing.includes("profile")&&<button type="button" onClick={()=>supplement("profile")}>补填个人资料</button>}{(selected.missing.includes("weight")||selected.missing.includes("bodyFat"))&&<button type="button" onClick={()=>supplement("body")}>补填身体记录</button>}</div>}
  {error&&<p role="status">{error}</p>}<p className={styles.hint}>按所选日期及此前30天的实测计算。估算值可继续手动修改。</p>
  <button type="button" className={styles.applyEstimate} data-apply-resting-estimate disabled={loading||!!error||!selected?.ok} onClick={()=>apply(choice)}>使用估算值</button>
 </section>;
}
export function ActivityEnergyHelp(){
 const id=useId();
 return <><button type="button" className={styles.calculationInfo} popoverTarget={id} aria-label="活动热量说明"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 4M12 16v1"/></svg></button><div id={id} popover="auto" className={styles.fieldHelp} role="dialog" aria-label="活动热量说明"><h4>活动热量</h4><p>填写当天已知的活动热量；不知道可以留空，明确没有活动才填0。</p><p>另记运动明细时，需核对是否已包含在活动合计中，避免重复相加。</p></div></>;
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
  const outside=(event:PointerEvent)=>{if(!event.composedPath().includes(node)&&!event.composedPath().includes(button))node.hidePopover();};
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&node.matches(":popover-open")){event.preventDefault();event.stopImmediatePropagation();node.hidePopover();button.focus({preventScroll:true});}};
  const stopPositioning=trackPopoverPosition(node,button,{
   owner:host,avoidHeading:true,width:340,align:"end",gap:8,minHeight:44,
  });
  document.addEventListener("pointerdown",outside,true);
  document.addEventListener("keydown",escape,true);
  return()=>{stopPositioning();document.removeEventListener("pointerdown",outside,true);document.removeEventListener("keydown",escape,true);};
 },[open,host]);
 const reference=(label:string,ref:CalculationSnapshot["weight"],unit:string)=><p>{label} {Number(ref.value)} {unit}<small>{ref.date} · {ref.period==="daytime"?"晨间":"晚间"} · {ref.source??"来源未填写"}</small></p>;
 return <><button ref={anchor} type="button" className={styles.calculationInfo} popoverTarget={id} aria-label="查看计算说明" aria-expanded={open}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6.5v7M12 16v1"/></svg></button>{host&&createPortal(<div id={id} ref={bubble} className={styles.calculationBubble} popover="auto" role="dialog" aria-label="计算说明" onToggle={event=>setOpen(event.newState==="open")}><h4>{snapshot?formulaLabel(snapshot.method):"静息估算逻辑"}</h4>{snapshot?<><p className={styles.formulaText}>{snapshot.method==="cunningham"?"500 + 22 × 体重 × (1 − 体脂率 ÷ 100)":"10 × 体重 + 6.25 × 身高 − 5 × 年龄 + 性别项"}</p>{reference("体重",snapshot.weight,"kg")}{snapshot.bodyFat&&reference("体脂率",snapshot.bodyFat,"%")}{snapshot.profile&&<p>身高 {Number(snapshot.profile.heightCm)} cm · {snapshot.profile.age} 岁 · {snapshot.profile.sexForCalculation==="male"?"男性项 +5":"女性项 −161"}<small>个人资料版本 {snapshot.profile.version} · 年龄按 {snapshot.date} 计算</small></p>}{snapshot.factor&&<p>全天 = 系统静息 × {snapshot.factor}<small>{activityLevels.find(level=>level.id===snapshot.activityLevel)?.label}，不拆分虚假的活动消耗。</small></p>}<p>保存后结果固定，资料变化需主动重新计算。</p></>:<p>自动选择优先用体脂公式；没有近期体脂时，在资料齐全后用常规公式。实测窗口为目标日期及此前30天，各项独立取最近实测，同日晨间优先。</p>}<p>公式和活动系数用于粗略估算，不能替代个体测量。</p></div>,host)}</>;
}
export function EnergySupplement({kind,date,today,close}:{kind:"profile"|"body";date:string;today:string;close:()=>void}) {
 const [profile,setProfile]=useState<PersonalProfile|null>(null),[body,setBody]=useState<Extract<Awaited<ReturnType<typeof loadEnergySupplementAction>>,{ok:true}>["data"]|null>(null),[error,setError]=useState("");
 const [changed,setChanged]=useState(false);
 useEffect(()=>{let active=true;void(async()=>{try{if(kind==="profile"){const result=await loadProfileAction();if(active){if(result.ok)setProfile(result.data);else setError(result.error);}}else{const result=await loadEnergySupplementAction(date);if(active){if(result.ok)setBody(result.data);else setError(result.error);}}}catch{if(active)setError("暂时无法读取，返回后可重试。");}})();return()=>{active=false;};},[kind,date]);
 async function back(){const forms=document.querySelectorAll('[data-energy-supplement] [aria-busy="true"]');if(forms.length)return;if(!changed||await confirmAction({title:"返回消耗记录？",message:"已保存的补填资料会保留，尚未保存的补填输入将放弃。消耗日期与草稿保持。",confirmLabel:"返回消耗"}))close();}
 return <section className={styles.energySupplement} data-energy-supplement onChangeCapture={()=>setChanged(true)}><button type="button" className={styles.calculationBack} onClick={()=>void back()}>返回消耗记录</button><h3>{kind==="profile"?"补填个人资料":"补填身体记录"}</h3>{error&&<p role="alert">{error}</p>}{!profile&&!body&&!error&&<LocalLoading active label="正在读取资料…"/>}{profile&&<ProfileForm initial={profile} today={today} embedded initialEditing onSaved={close}/>} {body&&<BodyFatContext value={true}><MeasurementEntry date={date} timezone="Asia/Shanghai" records={body.records} sources={body.sources} choices={{}} actions={{save:saveDayAction,removeSource:removeSourceAction}} onUpdated={close} onChoose={()=>{}}/></BodyFatContext>}</section>;
}
