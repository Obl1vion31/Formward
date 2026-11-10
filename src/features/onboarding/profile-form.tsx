"use client";
import {numericDraftValue} from "@/components/form-draft";
import { useEffect, useRef, useState } from "react";
import { LoadingLink } from "@/components/loading-link";
import { confirmAction } from "@/components/confirmation-state";
import {useDraftGuard,pageRefreshApproved} from "@/components/draft-guard";
import { LocalLoading } from "@/components/local-loading";
import { saveProfileAction, advanceOnboardingAction, loadProfileAction } from "@/app/onboarding/actions";
import { profileAge, validateProfile, type PersonalProfile } from "./model";
import { BirthDateInput } from "./birth-date-input";
import styles from "./profile.module.css";

export function ProfileForm({initial,today,onboarding=false,test=false,onContinue,embedded=false}:{embedded?:boolean;initial:PersonalProfile;today:string;onboarding?:boolean;test?:boolean;onContinue?:(profile:PersonalProfile)=>void}) {
  const [saved,setSaved]=useState(initial),[height,setHeight]=useState(initial.heightCm??""),[birth,setBirth]=useState(initial.birthDate??"");
  const [editing,setEditing]=useState(onboarding),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[failed,setFailed]=useState(false),[conflict,setConflict]=useState(false);
  const submitting=useRef(false),[pending,setPending]=useState<"skip"|"save"|"clear"|null>(null);
  const dirty=numericDraftValue(height)!==numericDraftValue(saved.heightCm)||birth!==(saved.birthDate??"");
  useDraftGuard(dirty,busy);
  const age=profileAge(/^\d{4}-\d{2}-\d{2}$/.test(birth)?birth:null,today);
  useEffect(()=>{if(!dirty||test)return;const guard=(event:BeforeUnloadEvent)=>{if(!pageRefreshApproved())event.preventDefault();};addEventListener("beforeunload",guard);return()=>removeEventListener("beforeunload",guard);},[dirty,test]);
  async function submit(skip=false) {
    if(submitting.current)return;
    setNotice("");setFailed(false);setConflict(false);
    try {
      if(!skip&&birth&&!/^\d{4}-\d{2}-\d{2}$/.test(birth))throw new Error("请选择完整的出生日期，或清空三项。");
      const value=skip?null:validateProfile({expectedVersion:saved.version,heightCm:height,birthDate:birth,continueOnboarding:onboarding},today);
      if(test) { onContinue?.({...saved,heightCm:value?.heightCm??null,birthDate:value?.birthDate??null,onboardingStep:"tutorial"});return; }
      submitting.current=true;setPending(skip?"skip":"save");setBusy(true);
      const result=skip?await advanceOnboardingAction({expectedVersion:saved.version,step:"tutorial"}):await saveProfileAction(value);
      if(!result.ok){setFailed(true);setConflict(result.code==="version_conflict");setNotice(result.error);return;}
      setSaved(result.data);setHeight(result.data.heightCm??"");setBirth(result.data.birthDate??"");
      if(onboarding){onContinue?.(result.data);}else{setEditing(false);setNotice("资料已保存。");}
    } catch(error){setFailed(true);setNotice(error instanceof Error&&/^(身高请|请选择有效|请选择完整)/.test(error.message)?error.message:"暂时没有保存成功，输入已保留，请重试。");}
    finally{submitting.current=false;setBusy(false);setPending(null);}
  }
  async function cancel() {
    if(dirty&&!await confirmAction({title:"放弃这次修改？",message:"尚未保存的身高和出生日期将恢复，已保存资料保持。",confirmLabel:"放弃修改",cancelLabel:"继续编辑"}))return;
    setHeight(saved.heightCm??"");setBirth(saved.birthDate??"");setEditing(false);setNotice("");setConflict(false);
  }
  async function clear() {
    if(!await confirmAction({title:"清空个人资料？",message:"将清空身高和出生日期。每日体重、体脂、饮食和消耗记录全部保留。",danger:true,confirmLabel:"清空资料"}))return;
    if(submitting.current)return;submitting.current=true;setPending("clear");setBusy(true);setNotice("");
    try{const result=await saveProfileAction({expectedVersion:saved.version,heightCm:null,birthDate:null});
      if(!result.ok){setFailed(true);setNotice(result.error);return;}
      setSaved(result.data);setHeight("");setBirth("");setFailed(false);setNotice("资料已清空。");
    }catch{setFailed(true);setNotice("暂时未能清空，请重试。");}
    finally{submitting.current=false;setBusy(false);setPending(null);}
  }
  async function latest() {
    let result;try{result=await loadProfileAction();}catch{setFailed(true);setNotice("暂时无法读取最新资料，输入已保留，请重试。");return;}
    if(!result.ok){setFailed(true);setNotice(result.error);return;}
    const p=result.data;
    if(await confirmAction({title:"查看最新资料",message:`身高：${p.heightCm??"未填写"}${p.heightCm?"厘米":""}；生日：${p.birthDate??"未填写"}。是否采用最新资料？当前未保存的输入将被替换。`,confirmLabel:"采用最新资料"})){setSaved(p);setHeight(p.heightCm??"");setBirth(p.birthDate??"");setConflict(false);setNotice("");}
  }
  return <section className={styles.personal}>
    {!onboarding&&!embedded&&<LoadingLink href="/dashboard" className={styles.back}>← 返回总览</LoadingLink>}
    {!embedded&&<h1>{onboarding?"先认识一下你":"个人资料"}</h1>}
    {!onboarding&&<p className={styles.intro}>{editing?"修改后，点保存才会生效。":"不是每天要填的资料，变化时再来修改。"}</p>}
    {editing?<form data-entry-form="profile" aria-busy={busy} noValidate onSubmit={event=>{event.preventDefault();void submit();}}>
      <div className={styles.fields}>
        <label><span className={styles.label}>身高 <small>选填</small></span><span className={styles.input}><input aria-label="身高" inputMode="decimal" placeholder="例如172" value={height} onChange={e=>setHeight(e.target.value)} disabled={busy}/><span>cm</span></span></label>
        <div><span className={styles.label}>出生日期 <small>{age!==null&&age>=0?age+"岁":"选填"}</small></span><BirthDateInput value={birth} today={today} onChange={setBirth} disabled={busy}/></div>
      </div>
      {notice&&<p className={styles.notice} role={failed?"alert":"status"}>{notice}</p>}
      {conflict&&<button className={styles.quiet} type="button" onClick={()=>void latest()}>查看最新资料</button>}
      <div className={styles.actions}><button className={styles.quiet} type="button" disabled={busy} onClick={()=>void(onboarding?submit(true):cancel())}>{onboarding?"暂时跳过":"取消"}<span className={styles.pendingIcon}><LocalLoading active={busy&&pending==="skip"} iconOnly label="正在继续…"/></span></button><button className={styles.primary} disabled={busy} type="submit">{onboarding?"保存并继续":"保存资料"}<span className={styles.pendingIcon}><LocalLoading active={busy&&pending==="save"} iconOnly label="正在保存资料…"/></span></button></div>
    </form>:<>
      <dl className={styles.readings}><div><dt>身高</dt><dd>{saved.heightCm??"—"}{saved.heightCm&&<small>cm</small>}</dd></div><div><dt>出生日期</dt><dd className={styles.birth}>{saved.birthDate?.replaceAll("-",".")??"—"}</dd><p>{saved.birthDate?`${profileAge(saved.birthDate,today)}岁 · 年龄自动更新`:"暂未填写"}</p></div></dl>
      <p className={styles.dataNote}>体重和体脂在“身体”页按日期记录。</p>
      {notice&&<p className={styles.notice} role={failed?"alert":"status"}>{notice}</p>}
      <div className={styles.actions}><button className={styles.quiet} disabled={busy||!saved.heightCm&&!saved.birthDate} onClick={()=>void clear()}>清空资料<span className={styles.pendingIcon}><LocalLoading active={busy&&pending==="clear"} iconOnly label="正在清空资料…"/></span></button><button className={styles.primary} onClick={()=>{setEditing(true);setNotice("");}}>修改资料</button></div>
    </>}
    {onboarding&&<p className={styles.footnote}>以后可在账号菜单的“个人资料”中修改。</p>}
  </section>;
}
