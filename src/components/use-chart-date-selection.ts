"use client";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";

type Origin = "initial" | "pointer" | "touch" | "keyboard";
type Choice = {date:string;origin:Origin;range:string};
/** 日期预览属于整个趋势面板；鼠标离开恢复默认，触屏选择与键盘任务分别保留。 */
export function useChartDateSelection(dates: string[], initial: string, fallback = initial, previewPaused = false, contextKey = "") {
  const regionId=useId(), range=dates.join("|")+":"+contextKey;
  const [choice,setChoice]=useState<Choice|null>(()=>initial!==fallback?({date:initial,origin:"initial",range}):null);
  const [previousRange,setPreviousRange]=useState(range);
  if(previousRange!==range){setPreviousRange(range);if(choice)setChoice(null);}
  const input=useRef<"mouse"|"touch"|"keyboard">("keyboard");
  useEffect(()=>{
    const keyboard=()=>{input.current="keyboard";};
    const pointer=(event:globalThis.PointerEvent)=>{input.current=event.pointerType==="mouse"?"mouse":"touch";};
    document.addEventListener("keydown",keyboard,true);document.addEventListener("pointerdown",pointer,true);
    return()=>{document.removeEventListener("keydown",keyboard,true);document.removeEventListener("pointerdown",pointer,true);};
  },[]);
  const active=choice?.range===range&&dates.includes(choice.date)?choice:null;
  const selected=active?.date??(dates.includes(fallback)?fallback:dates.at(-1)??fallback);
  const release=()=>setChoice(null);
  const select=(date:string,origin:Origin)=>{if(dates.includes(date))setChoice(current=>current?.date===date&&current.origin===origin&&current.range===range?current:{date,origin,range});};
  const choose=(date:string)=>select(date,"touch");
  const activate=(date:string)=>select(date,input.current==="mouse"?"pointer":input.current);
  const preview=(date:string)=>{if(!previewPaused)select(date,"pointer");};
  const focus=(event:FocusEvent<SVGGElement>,date:string)=>{if(input.current==="keyboard"&&event.currentTarget.matches(":focus-visible"))select(date,"keyboard");};
  const leave=()=>{if(!previewPaused)setChoice(current=>current?.origin==="touch"||current?.origin==="keyboard"?current:null);};
  const keyDown=(event:KeyboardEvent<SVGGElement>,date:string)=>{
    input.current="keyboard";
    if(event.key==="Enter"||event.key===" "){event.preventDefault();select(date,"keyboard");return;}
    if(event.key==="Escape"){event.preventDefault();release();return;}
    const nodes=[...(event.currentTarget.ownerSVGElement?.querySelectorAll<SVGGElement>("[data-chart-date]")??[])];
    const index=nodes.indexOf(event.currentTarget),next=event.key==="ArrowLeft"?index-1:event.key==="ArrowRight"?index+1:event.key==="Home"?0:event.key==="End"?nodes.length-1:null;
    if(next!==null){event.preventDefault();const node=nodes[Math.max(0,Math.min(nodes.length-1,next))];if(node){select(node.dataset.chartDate!,"keyboard");node.focus();}}
  };
  const regionProps={
    onPointerDownCapture:(event:PointerEvent<HTMLElement>)=>{input.current=event.pointerType==="mouse"?"mouse":"touch";},
    onKeyDownCapture:()=>{input.current="keyboard";},
    onPointerLeave:(event:PointerEvent<HTMLElement>)=>{if(event.pointerType==="mouse")leave();},
    onBlurCapture:(event:FocusEvent<HTMLElement>)=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setChoice(current=>current?.origin==="keyboard"?null:current);}
  };
  return {regionId,selected,active:!!active,origin:active?.origin??"default",direct:active?.origin==="touch",choose,activate,preview,focus,release,leave,keyDown,regionProps};
}
