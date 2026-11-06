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
