"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {draftIsDirty,confirmDraftDiscard} from "./draft-guard";
import {reopenCurrentRecordTask} from './record-intent-client';
import type { ComponentProps } from "react";




export function LoadingLink({ children,beforeNavigate, ...props }: ComponentProps<typeof Link>&{beforeNavigate?:()=>Promise<boolean|void>}) {
  const router=useRouter();
  return <Link {...props} prefetch={props.prefetch ?? (typeof props.href==="string"&&/[?&]entry=/.test(props.href)?false:undefined)} onNavigate={event=>{
    props.onNavigate?.(event);
    const href=typeof props.href==="string"?props.href:(props.href.pathname??"")+(props.href.query?"?"+new URLSearchParams(Object.entries(props.href.query).flatMap(([k,v])=>(Array.isArray(v)?v:[v]).map(item=>[k,String(item??"")]))).toString():"")+(props.href.hash??"");
    if(!draftIsDirty()&&!beforeNavigate){if(reopenCurrentRecordTask(href))event.preventDefault();return;}
    event.preventDefault();
    void confirmDraftDiscard().then(async allowed=>{
      if(!allowed)return;
      if(beforeNavigate&&await beforeNavigate()===false)return;
      if(!reopenCurrentRecordTask(href))router[props.replace?"replace":"push"](href,{scroll:props.scroll});
    });
  }}>{children}</Link>;
}
