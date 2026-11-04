"use client";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {usePathname} from "next/navigation";
import {draftIsBusy,draftIsDirty,approvePageRefresh} from "./draft-guard";
import {confirmAction} from "./confirmation-state";
import styles from "./app-updates.module.css";
const currentVersion=process.env.NEXT_PUBLIC_APP_VERSION??"development";
const overlaySnapshot=()=>Boolean(document.querySelector("dialog[open], [data-assistant-open]"))||Boolean(document.fullscreenElement);
const serverOverlay=()=>false;
const subscribeNothing=()=>()=>{};
function subscribeOverlay(notify:()=>void){
 const observer=new MutationObserver(notify);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["open","data-assistant-open"]});document.addEventListener("fullscreenchange",notify);
 return()=>{observer.disconnect();document.removeEventListener("fullscreenchange",notify);};
}
export function AppUpdates(){
 const pathname=usePathname(),active=/^\/(dashboard|onboarding|admin)(\/|$)/.test(pathname);
 const [available,setAvailable]=useState<string|null>(null),[dismissed,setDismissed]=useState<string|null>(null),[message,setMessage]=useState("");
 const showNotice=active&&available!==null&&available!==dismissed;
 const overlay=useSyncExternalStore(showNotice?subscribeOverlay:subscribeNothing,showNotice?overlaySnapshot:serverOverlay,serverOverlay),lock=useRef(false);
 useEffect(()=>{
  if(!active||currentVersion==="development")return;
  let alive=true,inflight=false;let controller:AbortController|null=null;
  async function check(){
   if(document.hidden||inflight)return;inflight=true;
   const request=new AbortController();controller=request;const timeout=setTimeout(()=>request.abort(),10000);
   try{
    // 原生fetch不带旧部署标记与cookie，读取正式别名当前提供的版本。
    const response=await fetch("/api/app-version",{cache:"no-store",credentials:"omit",signal:request.signal});
    if(!response.ok)return;const result=await response.json();
    if(alive&&typeof result.version==="string"&&/^[a-zA-Z0-9._-]{1,120}$/.test(result.version)&&result.version!=="development")setAvailable(result.version!==currentVersion?result.version:null);
   }catch{}finally{clearTimeout(timeout);inflight=false;}
  }
  const visible=()=>{if(!document.hidden)void check();};void check();const timer=setInterval(check,90000);
  document.addEventListener("visibilitychange",visible);window.addEventListener("focus",visible);window.addEventListener("pageshow",visible);
  return()=>{alive=false;controller?.abort();clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("focus",visible);window.removeEventListener("pageshow",visible);};
 },[active]);
 async function refresh(){
  if(lock.current)return;
  if(draftIsBusy()){setMessage("正在保存，完成后再刷新。");return;}
  lock.current=true;
  try{
   if(draftIsDirty()&&!await confirmAction({title:"刷新到新版本？",message:"当前尚未保存的输入将丢失。请先保存，或确认放弃后刷新。已保存记录保持。",confirmLabel:"放弃输入并刷新"}))return;
   if(draftIsBusy()){setMessage("正在保存，完成后再刷新。");return;}
   // 只在明确确认后解除本次离开保护，不清除会话或健康数据。
   approvePageRefresh();
   window.location.reload();
  }finally{lock.current=false;}
 }
 if(!active||!available||available===dismissed||overlay)return null;
 return <aside className={styles.notice} aria-label="应用版本更新"><p role="status">{message||"有新版本，刷新后使用。"}</p><div><button type="button" onClick={()=>void refresh()}>刷新</button><button type="button" onClick={()=>setDismissed(available)}>稍后</button></div></aside>;
}
