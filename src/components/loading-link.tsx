"use client";

import Link,{useLinkStatus} from "next/link";
import {useRouter} from "next/navigation";
import {useEffect,useRef,useTransition} from 'react';
import {draftIsDirty,confirmDraftDiscard} from "./draft-guard";
import {reopenCurrentRecordTask} from './record-intent-client';
import type { ComponentProps } from "react";
import {useWorkspaceReturn,type ReturnScope} from "./workspace-return";
import {usePrepareWorkspace} from "./workspace-navigation";




export function LoadingLink({ children,beforeNavigate,onPendingChange,returnScope,...props }: ComponentProps<typeof Link>&{beforeNavigate?:()=>Promise<boolean|void>;onPendingChange?:(pending:boolean)=>void;returnScope?:ReturnScope}) {
  const router=useRouter(),[pending,startTransition]=useTransition();
  const returns=useWorkspaceReturn(),prepare=usePrepareWorkspace(),link=useRef<HTMLAnchorElement>(null);
  return <Link {...props} onClick={event=>{link.current=event.currentTarget;props.onClick?.(event);}} data-workspace-origin-link={typeof props.href==="string"&&(returnScope||/[?&]entry=/.test(props.href))?props.href:undefined} prefetch={props.prefetch ?? (typeof props.href==="string"&&/[?&]entry=/.test(props.href)?false:undefined)} onNavigate={event=>{
    let intercepted=false;
    props.onNavigate?.({preventDefault(){intercepted=true;event.preventDefault();}});
    if(intercepted)return;
    const href=typeof props.href==="string"?props.href:(props.href.pathname??"")+(props.href.query?"?"+new URLSearchParams(Object.entries(props.href.query).flatMap(([k,v])=>(Array.isArray(v)?v:[v]).map(item=>[k,String(item??"")]))).toString():"")+(props.href.hash??"");
    const remember=props.replace?undefined:returns?.capture(href,link.current,returnScope);
    if(!draftIsDirty()&&!beforeNavigate){
      if(reopenCurrentRecordTask(href))event.preventDefault();
      else { remember?.(); prepare(href); }
      return;
    }
    event.preventDefault();
    void confirmDraftDiscard().then(async allowed=>{
      if(!allowed)return;
      if(beforeNavigate&&await beforeNavigate()===false)return;
      if(!reopenCurrentRecordTask(href)){
        remember?.();
        prepare(href);
        startTransition(()=>router[props.replace?"replace":"push"](href,{scroll:props.scroll}));
      }
    });
  }}>{children}{onPendingChange&&<LinkPending manual={pending} change={onPendingChange}/>}</Link>;
}
function LinkPending({manual,change}:{manual:boolean;change:(pending:boolean)=>void}){
 const {pending}=useLinkStatus();
 useEffect(()=>{change(manual||pending);return()=>change(false);},[manual,pending,change]);
 return null;
}
