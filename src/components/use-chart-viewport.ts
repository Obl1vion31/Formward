"use client";
import {useEffect,useState,type RefObject} from "react";
/** 按实际字体测量刻度；数据范围未变化时，悬停和选日不改变绘图区。 */
export function useChartViewport(ref:RefObject<HTMLElement|null>,labels:readonly (string|number)[],minimumLeft=54){
 const key=labels.map(String).join("|");
 const [measured,setMeasured]=useState({width:0,left:minimumLeft,key:""});
 useEffect(()=>{
  const node=ref.current;if(!node)return;
  let active=true;
  const canvas=document.createElement("canvas"),context=canvas.getContext("2d");
  const measure=()=>{
   if(!active)return;
   const axis=node.querySelector("svg text"),style=getComputedStyle(axis??node);
   if(context)context.font=style.fontWeight+" "+style.fontSize+" "+style.fontFamily;
   const labelWidth=Math.max(0,...key.split("|").map(label=>context?context.measureText(label).width:label.length*12));
   const next={width:node.clientWidth,left:Math.max(minimumLeft,Math.ceil(labelWidth+12)),key};
   setMeasured(previous=>previous.width===next.width&&previous.left===next.left&&previous.key===next.key?previous:next);
  };
  const observer=new ResizeObserver(measure);observer.observe(node);
  void document.fonts.ready.then(measure);
  return()=>{active=false;observer.disconnect();};
 },[ref,key,minimumLeft]);
 return {width:measured.key===key?measured.width:0,left:measured.left};
}
