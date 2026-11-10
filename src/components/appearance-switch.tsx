"use client";
import {useSyncExternalStore} from "react";
import {GlassMenu} from "./glass-menu";
import styles from "./appearance-switch.module.css";
import {appearanceSnapshot,appearanceServerSnapshot,subscribeAppearance,chooseAppearance} from "./appearance-state";
export function AppearanceSync(){useSyncExternalStore(subscribeAppearance,appearanceSnapshot,appearanceServerSnapshot);return null;}

export function AppearanceToggle(){
 const light=useSyncExternalStore(subscribeAppearance,()=>document.documentElement.dataset.theme==="light",()=>false);
 return <button className={styles.toggle} type="button" aria-label={light?"切换为深色":"切换为浅色"} title={light?"切换为深色":"切换为浅色"} onClick={event=>chooseAppearance(light?"dark":"light",event.currentTarget)}>
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{light?<path d="M20.7 14.1A8.9 8.9 0 0 1 9.9 3.3 9 9 0 1 0 20.7 14.1Z"/>:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>}</svg>
 </button>;
}

export function FollowSystemAppearance(){
 const appearance=useSyncExternalStore(subscribeAppearance,appearanceSnapshot,appearanceServerSnapshot);
 return <button type="button" role="menuitemcheckbox" data-menu-stay-open aria-checked={appearance==="system"} onClick={()=>chooseAppearance(appearance==="system"?(document.documentElement.dataset.theme==="light"?"light":"dark"):"system")}><span>跟随系统外观</span><span className={styles.systemToggle} data-checked={appearance==="system"} aria-hidden="true"/></button>;
}

/** 首次使用与演练没有账号菜单，系统外观放在同款轻量菜单内。 */
export function OnboardingAppearance(){return <div className={styles.onboarding}><AppearanceToggle/><GlassMenu label="外观选项" onOpen={()=>{}} icon={<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>}><FollowSystemAppearance/></GlassMenu></div>;}
