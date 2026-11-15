"use client";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {usePathname} from "next/navigation";
import {checkForAppUpdate,currentBuild,refreshToAppUpdate,useAppUpdate} from "./app-update-state";
import styles from "./app-updates.module.css";
const overlaySnapshot=()=>Boolean(document.querySelector("dialog[open], [data-assistant-open]"))||Boolean(document.fullscreenElement);
const serverOverlay=()=>false;
const subscribeNothing=()=>()=>{};
function subscribeOverlay(notify:()=>void){
 const observer=new MutationObserver(notify);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["open","data-assistant-open"]});document.addEventListener("fullscreenchange",notify);
 return()=>{observer.disconnect();document.removeEventListener("fullscreenchange",notify);};
}
export function AppUpdates(){
 const pathname=usePathname(),active=/^\/(dashboard|onboarding|admin)(\/|$)/.test(pathname);
 const {availableVersion:available}=useAppUpdate();
 const [dismissed,setDismissed]=useState<string|null>(null),[message,setMessage]=useState("");
 const showNotice=active&&available!==null&&available!==dismissed;
 const overlay=useSyncExternalStore(showNotice?subscribeOverlay:subscribeNothing,showNotice?overlaySnapshot:serverOverlay,serverOverlay),lock=useRef(false);
 useEffect(()=>{
  if(!active||currentBuild==="development")return;
  const check=()=>{if(!document.hidden)void checkForAppUpdate();};
  check();const timer=setInterval(check,90000);
  document.addEventListener("visibilitychange",check);window.addEventListener("focus",check);window.addEventListener("pageshow",check);
  return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",check);window.removeEventListener("focus",check);window.removeEventListener("pageshow",check);};
 },[active]);
 async function refresh(){
  if(lock.current)return;
  lock.current=true;
  try{
   const result=await refreshToAppUpdate();
   setMessage(result==="busy"?"正在保存，完成后再刷新。":"");
  }finally{lock.current=false;}
 }
 if(!active||!available||available===dismissed||overlay)return null;
 return <aside className={styles.notice} aria-label="应用版本更新"><p role="status">{message||"有新版本，刷新后使用。"}</p><div><button type="button" onClick={()=>void refresh()}>刷新</button><button type="button" onClick={()=>setDismissed(available)}>稍后</button></div></aside>;
}
