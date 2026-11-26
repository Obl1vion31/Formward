"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoadingLink } from "@/components/loading-link";
import {OnboardingAppearance} from "@/components/appearance-switch";
import { BrandLogo } from "@/components/brand-logo";
import { advanceOnboardingAction } from "@/app/onboarding/actions";
import type { PersonalProfile } from "./model";
import { ProfileForm } from "./profile-form";
import styles from "./profile.module.css";

export function OnboardingFlow({initial,today,test=false,destination="/dashboard"}:{initial:PersonalProfile;today:string;test?:boolean;destination?:string}) {
  const router=useRouter(),[profile,setProfile]=useState(initial),[finished,setFinished]=useState(false),[saving,setBusy]=useState(false),[navigating,startNavigation]=useTransition(),[error,setError]=useState("");
  const waiting=useRef(false);
  const busy=saving||navigating;
  function continued(result:PersonalProfile){
    setProfile(result);
    if(result.onboardingStep!=="complete")return;
    if(test)setFinished(true);else startNavigation(()=>router.replace(destination));
  }
  async function completeLegacyStep() {
    if(waiting.current||busy)return;
    waiting.current=true;setBusy(true);setError("");
    try{const result=await advanceOnboardingAction({expectedVersion:profile.version,step:"complete"});
      if(!result.ok){setError(result.error);return;}
      continued(result.data);
    }catch{setError("暂时没有更新成功，请重试。");}finally{waiting.current=false;setBusy(false);}
  }
  return <div className="onboarding-flow">
    <header className={styles.header}><LoadingLink prefetch={test} href="/dashboard" aria-label="Formward 主页"><BrandLogo compactOnMobile/></LoadingLink><div className={styles.headerOptions}><OnboardingAppearance/>{test&&<small>管理员演练</small>}</div></header>
    {finished?<section className={styles.done}><h1>演练完成</h1><p>真实个人资料与记录可在工作区查看。</p><LoadingLink className={styles.primary} href="/dashboard">返回总览</LoadingLink></section>:
    profile.onboardingStep==="profile"?<ProfileForm initial={profile} today={today} onboarding test={test} onboardingLabel={destination==="/dashboard"?"保存并进入总览":"保存并继续"} onContinue={continued}/>:
    <section className={styles.done}><h1>资料准备完成</h1><p>使用说明可以随时从小助手打开。</p><button className={styles.primary} type="button" disabled={busy} onClick={()=>void completeLegacyStep()}>{busy?"正在进入…":destination==="/dashboard"?"进入总览":"继续"}</button></section>}
    {error&&<p role="alert" style={{maxWidth:720,margin:"16px auto",padding:16,color:"var(--danger)"}}>{error}</p>}
  </div>;
}
