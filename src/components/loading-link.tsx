"use client";

import Link,{useLinkStatus} from "next/link";
import {useRouter} from "next/navigation";
import {useEffect,useTransition} from 'react';
import {draftIsDirty,confirmDraftDiscard} from "./draft-guard";
import {reopenCurrentRecordTask} from './record-intent-client';
import type { ComponentProps } from "react";




export function LoadingLink({ children,beforeNavigate,onPendingChange, ...props }: ComponentProps<typeof Link>&{beforeNavigate?:()=>Promise<boolean|void>;onPendingChange?:(pending:boolean)=>void}) {
  const router=useRouter(),[pending,startTransition]=useTransition();
  return <Link {...props} prefetch={props.prefetch ?? (typeof props.href==="string"&&/[?&]entry=/.test(props.href)?false:undefined)} onNavigate={event=>{
    let intercepted=false;
    props.onNavigate?.({preventDefault(){intercepted=true;event.preventDefault();}});
    if(intercepted)return;
    const href=typeof props.href==="string"?props.href:(props.href.pathname??"")+(props.href.query?"?"+new URLSearchParams(Object.entries(props.href.query).flatMap(([k,v])=>(Array.isArray(v)?v:[v]).map(item=>[k,String(item??"")]))).toString():"")+(props.href.hash??"");
    if(!draftIsDirty()&&!beforeNavigate){if(reopenCurrentRecordTask(href))event.preventDefault();return;}
    event.preventDefault();
    void confirmDraftDiscard().then(async allowed=>{
      if(!allowed)return;
      if(beforeNavigate&&await beforeNavigate()===false)return;
      if(!reopenCurrentRecordTask(href))startTransition(()=>router[props.replace?"replace":"push"](href,{scroll:props.scroll}));
    });
  }}>{children}{onPendingChange&&<LinkPending manual={pending} change={onPendingChange}/>}</Link>;
}
function LinkPending({manual,change}:{manual:boolean;change:(pending:boolean)=>void}){
 const {pending}=useLinkStatus();
 useEffect(()=>{change(manual||pending);return()=>change(false);},[manual,pending,change]);
 return null;
}
