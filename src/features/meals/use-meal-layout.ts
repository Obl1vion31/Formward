"use client";
import {useLayoutEffect,useState,type RefObject,type CSSProperties} from "react";

/** 只测量排版所需的文字宽度，不计算或舍入营养。 */
export function useMealLayout(sheet:RefObject<HTMLDivElement|null>,cells:string[][]){
 const signature=JSON.stringify(cells);
 const [layout,setLayout]=useState({picker:"tabs",mode:"cards",stack:false,widths:[88,80,88,80,80,80]});
 useLayoutEffect(()=>{
  const node=sheet.current!,form=node.closest("form")!,table=node.querySelector("table")!,canvas=document.createElement("canvas"),context=canvas.getContext("2d")!;
  function measure(){
   const style=getComputedStyle(table);context.font="16px "+style.fontFamily;
   const rows=JSON.parse(signature) as string[][],minimum=[88,80,88,80,80,80];
   const widths=minimum.map((base,index)=>Math.max(base,...rows.map(row=>Math.ceil(context.measureText(row[index]??"").width)+(index===0?54:30))));
   const total=220+88+widths.reduce((a,b)=>a+b,0),picker=form.clientWidth>=total+264?"side":"tabs";
   const sheetStyle=getComputedStyle(node),available=node.clientWidth-parseFloat(sheetStyle.paddingLeft)-parseFloat(sheetStyle.paddingRight);
   const next={picker,mode:available>=total?"table":"cards",stack:Math.max(...widths)>(available-10)/2,widths};
   setLayout(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
  }
  measure();const observer=new ResizeObserver(measure);observer.observe(node);observer.observe(form);
  void document.fonts.ready.then(measure);return()=>observer.disconnect();
 },[signature,sheet]);
 const variables=Object.fromEntries(layout.widths.map((value,index)=>["--entry-col-"+index,value+"px"])) as CSSProperties;
 return {...layout,variables};
}
