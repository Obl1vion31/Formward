"use client";
import { useEffect, useState } from "react";

/** 仅预留未知模块，不虚构曲线、记录数量或操作。 */
export function ModuleSkeleton({shape="line",label="正在读取…"}:{shape?:"line"|"number"|"chart"|"records";label?:string}){
  const [ready,setReady]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>setReady(true),200);return()=>clearTimeout(timer);},[]);
  return <span className="module-skeleton" data-shape={shape} data-ready={ready} role="status" aria-label={label}><span className="sr-only">{ready?label:""}</span></span>;
}
