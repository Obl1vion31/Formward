"use client";
import {useLayoutEffect,useState,type RefObject,type CSSProperties} from "react";

/** 只测量排版所需的文字宽度，不计算或舍入营养。 */
export function useMealLayout(sheet:RefObject<HTMLDivElement|null>,cells:string[][]){
 const signature=JSON.stringify(cells);
 const [layout,setLayout]=useState({picker:"tabs",mode:"cards",stack:false,nutrientColumns:4,widths:[88,80,88,80,80,80]});
 useLayoutEffect(()=>{
  const node=sheet.current!,form=node.closest("form")!,table=node.querySelector("table")!,canvas=document.createElement("canvas"),context=canvas.getContext("2d")!;
  let active=true,frame=0;
  function measure(){
   if(!active)return;
   const style=getComputedStyle(table),textWidth=(text:string,fieldStyle=style)=>{context.font=fieldStyle.font||`${fieldStyle.fontStyle} ${fieldStyle.fontWeight} ${fieldStyle.fontSize} ${fieldStyle.fontFamily}`;return Math.ceil(context.measureText(text).width);};
   const rows=JSON.parse(signature) as string[][],minimum=[88,80,88,80,80,80];
   // 实际字段可能显示补足的小数位或尚未通过验证的输入，不能只测已采用的值。
   const liveRows=[...table.querySelectorAll("tbody tr")].map(row=>[...row.querySelectorAll("td")].slice(1,7).map(cell=>{
    const field=cell.querySelector<HTMLInputElement|HTMLSelectElement>("input,select")??cell.querySelector<HTMLElement>(":scope>span");
    if(!field)return null;
    const value=field instanceof HTMLSelectElement?field.selectedOptions[0]?.textContent??"":field instanceof HTMLInputElement?field.value:field.textContent??"",fieldStyle=getComputedStyle(field);
    const padding=parseFloat(fieldStyle.paddingLeft)+parseFloat(fieldStyle.paddingRight)+parseFloat(fieldStyle.borderLeftWidth)+parseFloat(fieldStyle.borderRightWidth);
    return {width:textWidth(value,fieldStyle),space:padding+8+(field instanceof HTMLSelectElement?22:0)};
   }));
   const widths=minimum.map((base,index)=>Math.max(base,...rows.map(row=>textWidth(row[index]??"")+(index===0?54:30)),...liveRows.map(row=>{const field=row[index];return field?field.width+Math.max(index===0?54:30,field.space):0;})));
   const total=220+120+widths.reduce((a,b)=>a+b,0),picker=form.clientWidth>=total+264?"side":"tabs";
   const sheetStyle=getComputedStyle(node),available=node.clientWidth-parseFloat(sheetStyle.paddingLeft)-parseFloat(sheetStyle.paddingRight);
   const nutrientWidth=Math.max(48,...rows.flatMap(row=>row.slice(2)).map(value=>textWidth(value)+14),...liveRows.flatMap(row=>row.slice(2)).map(field=>field?field.width+14:0));
   const nutrientColumns=nutrientWidth<=(available-30)/4?4:nutrientWidth<=(available-8)/2?2:1;
   const next={nutrientColumns,picker,mode:available>=total?"table":"cards",stack:Math.max(...widths.slice(0,2))>(available-10)/2,widths};
   setLayout(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
  }
  const queue=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);},events=["input","change","focusin","focusout"] as const;events.forEach(event=>form.addEventListener(event,queue));
  measure();const observer=new ResizeObserver(queue);observer.observe(node);observer.observe(form);
  void document.fonts.ready.then(()=>{if(active)queue();});return()=>{active=false;cancelAnimationFrame(frame);observer.disconnect();events.forEach(event=>form.removeEventListener(event,queue));};
 },[signature,sheet]);
 const variables=Object.fromEntries(layout.widths.map((value,index)=>["--entry-col-"+index,value+"px"])) as CSSProperties;
 return {...layout,variables};
}
