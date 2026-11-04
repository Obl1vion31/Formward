"use client";
import {useLayoutEffect,useRef,type ReactNode} from "react";

/** 永久选日图层。只移动标记，不修改真实曲线或插值健康读数。 */
export function ChartSelectionMarker({x,y=0,resetKey,direct=false,children}:{x:number|null;y?:number;resetKey:string;direct?:boolean;children:ReactNode}){
 const node=useRef<SVGGElement>(null),animation=useRef<Animation|null>(null),previous=useRef<{key:string;x:number|null;y:number}|null>(null);
 useLayoutEffect(()=>{
  const element=node.current!,last=previous.current;
  const from=animation.current?getComputedStyle(element).transform:last?`translate(${last.x??0}px, ${last.y}px)`:null;
  animation.current?.cancel();animation.current=null;
  if(x!==null&&last?.x!==null&&last?.key===resetKey&&!direct&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches&&from&&element.animate){
   animation.current=element.animate([{transform:from},{transform:`translate(${x}px, ${y}px)`}],{duration:220,easing:"cubic-bezier(.65,0,.35,1)",fill:"both"});
  }
  previous.current={key:resetKey,x,y};
 },[x,y,resetKey,direct]);
 useLayoutEffect(()=>{
  const query=window.matchMedia("(prefers-reduced-motion: reduce)"),stop=()=>{if(query.matches){animation.current?.cancel();animation.current=null;}};
  query.addEventListener("change",stop);return()=>{query.removeEventListener("change",stop);animation.current?.cancel();};
 },[]);
 return <g ref={node} data-chart-selection-marker aria-hidden="true" pointerEvents="none" style={{transform:`translate(${x??0}px, ${y}px)`,visibility:x===null?"hidden":undefined}}>{children}</g>;
}
