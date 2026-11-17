"use client";
import {useLayoutEffect,useState,type RefObject} from "react";

/** 只测量排版所需的文字宽度，不计算或舍入营养。 */
export function useMealLayout(sheet:RefObject<HTMLDivElement|null>,cells:string[][],enabled=true){
 const signature=JSON.stringify(cells);
 const [layout,setLayout]=useState({picker:"auto",stack:false,identityColumns:2,nutrientColumns:4});
 useLayoutEffect(()=>{
  if(!enabled||!sheet.current)return;
  const node=sheet.current!,form=node.closest("form")!,table=node.querySelector("table")!,canvas=document.createElement("canvas"),context=canvas.getContext("2d")!;
  let active=true,frame=0;
  function measure(){
   if(!active)return;
   const style=getComputedStyle(table),textWidth=(text:string,fieldStyle=style)=>{context.font=fieldStyle.font||`${fieldStyle.fontStyle} ${fieldStyle.fontWeight} ${fieldStyle.fontSize} ${fieldStyle.fontFamily}`;return Math.ceil(context.measureText(text).width);};
   const rows=JSON.parse(signature) as string[][];
   // 实际字段可能显示补足的小数位或尚未通过验证的输入，不能只测已采用的值。
   const liveRows=[...table.querySelectorAll("tbody tr")].map(row=>[...row.querySelectorAll("[data-entry-cell]")].slice(1,7).map(cell=>{
    const field=cell.querySelector<HTMLInputElement|HTMLSelectElement>("input,select")??cell.querySelector<HTMLElement>(":scope>span:last-child");
    if(!field)return null;
    const value=field instanceof HTMLSelectElement?field.selectedOptions[0]?.textContent??"":field instanceof HTMLInputElement?field.value:field.textContent??"",fieldStyle=getComputedStyle(field);
    const padding=parseFloat(fieldStyle.paddingLeft)+parseFloat(fieldStyle.paddingRight)+parseFloat(fieldStyle.borderLeftWidth)+parseFloat(fieldStyle.borderRightWidth);
    return {width:textWidth(value,fieldStyle),space:padding+8};
   }));
   const sheetStyle=getComputedStyle(node),available=node.clientWidth-parseFloat(sheetStyle.paddingLeft)-parseFloat(sheetStyle.paddingRight);
   const labelStyle=getComputedStyle(table.querySelector("[data-nutrient] span")??table);
   const nutrientLabelWidth=Math.max(...["热量 千卡","蛋白质 g","碳水 g","脂肪 g"].map(label=>textWidth(label,labelStyle)));
   const nutrientWidth=Math.max(48,nutrientLabelWidth,...rows.flatMap(row=>row.slice(2)).map(value=>textWidth(value)+14),...liveRows.flatMap(row=>row.slice(2)).map(field=>field?field.width+14:0));
   const nutrientColumns=nutrientWidth<=(available-24)/4?4:nutrientWidth<=(available-8)/2?2:1;
   const identityWidths=[0,1].map(index=>Math.max(56,...rows.map(row=>textWidth(row[index]??"")+24),...liveRows.map(row=>{const field=row[index];return field?field.width+field.space:0;})));
   const nameInput=table.querySelector<HTMLInputElement>('td[data-entry-cell] input[placeholder="食物名称"]'),nameStyle=nameInput?getComputedStyle(nameInput):style;
   const nameMinimum=textWidth("食物名称",nameStyle)+(nameInput?parseFloat(nameStyle.paddingLeft)+parseFloat(nameStyle.paddingRight)+2:14);
   const identityWidth=Math.max(...identityWidths),nameSpace=(available-88)*5/12+32;
   const next={nutrientColumns,picker:form.clientWidth>=960?"side":"tabs",stack:nameMinimum>nameSpace||identityWidths[0]>(available-24)/4||identityWidths[1]>(available-16)/3,identityColumns:identityWidth>(available-8)/2?1:2};
   setLayout(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
  }
  const queue=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);},events=["input","change","focusin","focusout"] as const;events.forEach(event=>form.addEventListener(event,queue));
  measure();const mutations=new MutationObserver(queue);mutations.observe(document.documentElement,{attributes:true,attributeFilter:["style","class"]});const observer=new ResizeObserver(queue);observer.observe(node);observer.observe(form);observer.observe(table);
  void document.fonts.ready.then(()=>{if(active)queue();});return()=>{active=false;cancelAnimationFrame(frame);observer.disconnect();mutations.disconnect();events.forEach(event=>form.removeEventListener(event,queue));};
 },[signature,sheet,enabled]);
 return layout;
}
