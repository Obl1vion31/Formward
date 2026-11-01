"use client";
import {useSyncExternalStore} from "react";
import styles from "./appearance-switch.module.css";
import {appearanceSnapshot,appearanceServerSnapshot,subscribeAppearance,chooseAppearance} from "./appearance-state";
export function AppearanceSwitch({compact=false}:{compact?:boolean}){
 const theme=useSyncExternalStore(subscribeAppearance,appearanceSnapshot,appearanceServerSnapshot);
 return <div className={styles.switch+(compact?" "+styles.compact:"")} role="group" aria-label="外观"><span>外观</span><div role="radiogroup" aria-label="选择浅色或深色" onKeyDown={event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const next=event.key==="Home"?"light":event.key==="End"?"dark":theme==="dark"?"light":"dark";chooseAppearance(next);event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next==="light"?0:1]?.focus();}}>{(["light","dark"] as const).map(value=><button key={value} type="button" role="radio" aria-checked={theme===value} tabIndex={theme===value?0:-1} onClick={()=>chooseAppearance(value)}>{value==="light"?"浅色":"深色"}</button>)}</div></div>;
}
