"use client";
import {useSyncExternalStore} from "react";
import styles from "./appearance-switch.module.css";
import {appearanceSnapshot,appearanceServerSnapshot,subscribeAppearance,chooseAppearance} from "./appearance-state";
export function AppearanceSwitch({compact=false}:{compact?:boolean}){
 const theme=useSyncExternalStore(subscribeAppearance,appearanceSnapshot,appearanceServerSnapshot);
 const values=["system","light","dark"] as const;
 return <div className={styles.switch+(compact?" "+styles.compact:"")} role="group" aria-label="外观"><div role="radiogroup" aria-label="选择外观" onKeyDown={event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const index=event.key==="Home"?0:event.key==="End"?2:(values.indexOf(theme)+(event.key==="ArrowLeft"?2:1))%3;chooseAppearance(values[index]);event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[index]?.focus();}}>{values.map(value=><button key={value} type="button" role="radio" aria-checked={theme===value} tabIndex={theme===value?0:-1} onClick={()=>chooseAppearance(value)}>{value==="system"?"跟随系统":value==="light"?"浅色":"深色"}</button>)}</div></div>;
}
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
