"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageLoading } from "@/components/page-loading-state";
import { LoadingLink } from "@/components/loading-link";
import {AppearanceSwitch} from "@/components/appearance-switch";
import { BrandLogo } from "@/components/brand-logo";
import { advanceOnboardingAction } from "@/app/onboarding/actions";
import type { PersonalProfile } from "./model";
import { ProfileForm } from "./profile-form";
import { TutorialView } from "./tutorial-view";
import styles from "./profile.module.css";

export function OnboardingFlow({initial,today,test=false}:{initial:PersonalProfile;today:string;test?:boolean}) {
  const router=useRouter(),[profile,setProfile]=useState(initial),[finished,setFinished]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const waiting=useRef(false);
  usePageLoading({active:busy,label:"正在更新步骤…"});
  async function move(step:"profile"|"complete") {
    if(waiting.current)return;
    if(test){if(step==="complete")setFinished(true);else setProfile(p=>({...p,onboardingStep:step}));return;}
    waiting.current=true;setBusy(true);setError("");
    try{const result=await advanceOnboardingAction({expectedVersion:profile.version,step});
      if(!result.ok){setError(result.error);return;}
      setProfile(result.data);
      if(result.data.onboardingStep==="complete")router.replace("/dashboard");

    }catch{setError("暂时没有更新成功，请重试。");}finally{waiting.current=false;setBusy(false);}
  }
  return <div className="onboarding-flow">
    <header className={styles.header}><LoadingLink href="/dashboard" aria-label="Formward 主页"><BrandLogo compactOnMobile/></LoadingLink><div className={styles.headerOptions}><AppearanceSwitch compact/><small>{test?"演练 · 不保存":profile.onboardingStep==="profile"?"第1步／共2步":"第2步／共2步"}</small></div></header>
    {finished?<section className={styles.done}><h1>演练完成</h1><p>你已走过填写资料和使用说明。真实资料、引导状态和健康记录没有改变。</p><LoadingLink className={styles.primary} href="/dashboard">返回总览</LoadingLink></section>:
    profile.onboardingStep==="profile"?<ProfileForm initial={profile} today={today} onboarding test={test} onContinue={setProfile}/>:
    <TutorialView startText={test?"结束演练":"开始使用"} backText="返回资料" onStart={()=>void move("complete")} onBack={()=>void move("profile")} busy={busy}/>}
    {error&&<p role="alert" style={{maxWidth:720,margin:"16px auto",padding:16,color:"var(--danger)"}}>{error}</p>}
  </div>;
}
