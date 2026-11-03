"use client";

import Link, { useLinkStatus } from "next/link";
import {useRouter} from "next/navigation";
import {draftIsDirty,confirmDraftDiscard} from "./draft-guard";
import type { ComponentProps } from "react";
import { usePageLoading } from "./page-loading-state";

function NavigationStatus() {
  const { pending } = useLinkStatus();
  usePageLoading({ active: pending, label: "正在加载页面…" });
  return null;
}

export function LoadingLink({ children, ...props }: ComponentProps<typeof Link>) {
  const router=useRouter();
  return <Link {...props} onNavigate={event=>{
    props.onNavigate?.(event);
    if(!draftIsDirty())return;
    event.preventDefault();
    void confirmDraftDiscard().then(allowed=>{
      if(!allowed)return;
      const href=typeof props.href==="string"?props.href:(props.href.pathname??"")+(props.href.query?"?"+new URLSearchParams(Object.entries(props.href.query).flatMap(([k,v])=>(Array.isArray(v)?v:[v]).map(item=>[k,String(item??"")]))).toString():"")+(props.href.hash??"");
      router[props.replace?"replace":"push"](href,{scroll:props.scroll});
    });
  }}>{children}<NavigationStatus /></Link>;
}
