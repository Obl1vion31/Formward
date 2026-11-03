"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {LoadingLink} from "@/components/loading-link";
import {draftIsDirty} from "@/components/draft-guard";
import {localMeasurementDate} from "../measurements/entry-state";
import {dailyReminders,type ReminderCatalog} from "./daily-reminders";
import styles from "./overview.module.css";
export function DailyReminders({catalog,accountId,createdAt}:{catalog:ReminderCatalog;accountId:string;createdAt:string}){
 const [clock,setClock]=useState<Date|null>(null),[expanded,setExpanded]=useState(false),[hiddenKey,setHiddenKey]=useState(""),router=useRouter();
 useEffect(()=>{
  const update=()=>{const now=new Date();setClock(now);try{const key="formward:reminders:"+accountId+":"+localMeasurementDate(now);if(localStorage.getItem(key)==="closed")setHiddenKey(key);}catch{}};
  const visible=()=>{if(document.visibilityState==="visible"){update();if(!draftIsDirty())router.refresh();}};
  update();const timer=setInterval(update,60000);document.addEventListener("visibilitychange",visible);
  return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
 },[accountId,router]);
 if(!clock)return null;
 const today=localMeasurementDate(clock),items=dailyReminders(catalog,today,clock.getHours(),localMeasurementDate(new Date(createdAt))),key="formward:reminders:"+accountId+":"+today;
 if(!items.length)return null;
 const hidden=hiddenKey===key&&!expanded;
 return <section className={styles.reminderStrip} aria-label="待记录提醒">
  <div className={styles.reminderHeading}>
   {!hidden&&!expanded&&<LoadingLink className={styles.reminderPrimary} href={items[0].href}><span>{items[0].label}</span><span aria-hidden="true">→</span></LoadingLink>}
   <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>待记录 {items.length} 项 {expanded?"−":"＋"}</button>
   {!hidden&&<button type="button" aria-label="今天收起提醒" onClick={()=>{setExpanded(false);setHiddenKey(key);try{localStorage.setItem(key,"closed");}catch{}}}>×</button>}
  </div>
  {expanded&&<ul>{items.map(item=><li key={item.key}><span>{item.label}</span><LoadingLink href={item.href}>{item.action}</LoadingLink></li>)}</ul>}
 </section>;
}
