"use client";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";

type Origin = "initial" | "pointer" | "click" | "touch" | "keyboard";
type Choice = {date:string;origin:Origin;range:string};
type SelectionAction = {type:"select";date:string;origin:Origin}|{type:"preview";date:string}|{type:"leave"}|{type:"release"}|{type:"release-preview"};
/** 鼠标点击是明确选择；悬停只预览，不能覆盖已点击的日期。 */
export function updateChartDateChoice(current:Choice|null,action:SelectionAction,dates:readonly string[],range:string):Choice|null {
  const active=current?.range===range&&dates.includes(current.date)?current:null;
  if(action.type==="release")return null;
  if(action.type==="release-preview")return active&&["click","touch"].includes(active.origin)?active:null;
  if(action.type==="leave")return active&&["click","touch","keyboard"].includes(active.origin)?active:null;
  if(!dates.includes(action.date))return active;
  if(action.type==="preview"&&active?.origin==="click")return active;
  const origin=action.type==="preview"?"pointer":action.origin;
  return active?.date===action.date&&active.origin===origin?active:{date:action.date,origin,range};
}
/** 日期选择属于整个趋势面板；点击／触屏保持，键盘选择随焦点，悬停离开才恢复默认。 */
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
  const update=(action:SelectionAction)=>setChoice(current=>updateChartDateChoice(current,action,dates,range));
  const release=()=>update({type:"release"});
  const releasePreview=()=>update({type:"release-preview"});
  const select=(date:string,origin:Origin)=>update({type:"select",date,origin});
  const choose=(date:string)=>select(date,"touch");
  const activate=(date:string)=>select(date,input.current==="mouse"?"click":input.current);
  const preview=(date:string)=>{if(!previewPaused)update({type:"preview",date});};
  const focus=(event:FocusEvent<SVGGElement>,date:string)=>{if(input.current==="keyboard"&&event.currentTarget.matches(":focus-visible"))select(date,"keyboard");};
  const leave=()=>{if(!previewPaused)update({type:"leave"});};
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
  return {regionId,selected,active:!!active,locked:active?.origin==="click",origin:active?.origin??"default",direct:active?.origin==="touch",choose,activate,preview,focus,release,releasePreview,leave,keyDown,regionProps};
}
