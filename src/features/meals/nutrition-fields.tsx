"use client";
import {DecimalInput} from "@/components/decimal-input";
import {useId,useLayoutEffect,useRef,useState,type CSSProperties} from "react";
import { metrics, metricLabels, type FoodDraft, type Nutrition } from "./model";
import styles from "./meals.module.css";
export function NutritionFields({ value, change, readOnly = false }: { value: Nutrition; change: (value: Nutrition) => void; readOnly?: boolean }) {
  const grid=useRef<HTMLDivElement>(null),[columns,setColumns]=useState(4);
  const signature=JSON.stringify(value);
  useLayoutEffect(()=>{
    const node=grid.current!,canvas=document.createElement("canvas"),context=canvas.getContext("2d")!;
    let active=true,frame=0;
    function width(text:string,element:Element){const s=getComputedStyle(element);context.font=s.fontSize+" "+s.fontFamily;return context.measureText(text).width;}
    function measure(){
      if(!active)return;
      const style=getComputedStyle(node),gap=parseFloat(style.columnGap)||0;
      const needed=Math.max(...[...node.querySelectorAll("label")].map(label=>{
        const input=label.querySelector("input")!,caption=label.querySelector("span")!,unit=label.querySelector("small")!,s=getComputedStyle(input);
        const field=width(input.value||input.placeholder,input)+parseFloat(s.paddingLeft)+parseFloat(s.paddingRight)+parseFloat(s.borderLeftWidth)+parseFloat(s.borderRightWidth);
        return Math.max(field,width(caption.textContent??"",caption)+width(unit.textContent??"",unit)+6);
      }));
      const available=node.clientWidth;
      setColumns(needed<=(available-gap*3)/4?4:needed<=(available-gap)/2?2:1);
    }
    const queue=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};
    const observer=new ResizeObserver(measure);observer.observe(node);
    node.addEventListener("input",queue);node.addEventListener("focusin",queue);node.addEventListener("focusout",queue);
    measure();void document.fonts.ready.then(()=>{if(active)measure();});
    return()=>{active=false;cancelAnimationFrame(frame);observer.disconnect();node.removeEventListener("input",queue);node.removeEventListener("focusin",queue);node.removeEventListener("focusout",queue);};
  },[signature]);
  return <div ref={grid} className={styles.nutritionFields} data-nutrition-columns={columns} style={{"--nutrition-columns":columns} as CSSProperties}>{metrics.map(metric => <label key={metric}><span>{metricLabels[metric]}</span><small>{metric === "caloriesKcal" ? "kcal" : "g"}</small><DecimalInput precision={metric==="caloriesKcal"?0:1} aria-label={metricLabels[metric]} min={0} max={1000000} readOnly={readOnly} placeholder="未知" value={value[metric]} onValue={text=>change({...value,[metric]:text||null})} /></label>)}</div>;
}
type SourceValue={ sourceKind: FoodDraft["sourceKind"]; basis?: string | null; evidenceUrl?: string | null };
export function SourceFields({ value, change, detailed = false }: { value: SourceValue; change: (next: SourceValue) => void; detailed?: boolean }) {
  const name=useId();
  const reference = ["label", "composition_table", "reference"].includes(value.sourceKind);
  return <div className={styles.sourceFields}>
    <fieldset className={styles.sourceChoices}><legend>营养依据</legend><label><input type="radio" name={name} checked={reference} onChange={()=>change({...value,sourceKind:reference?value.sourceKind:"reference"})}/>标签／成分表</label><label><input type="radio" name={name} checked={value.sourceKind==="estimated"} onChange={()=>change({...value,sourceKind:"estimated"})}/>直接预估</label></fieldset>
    <details className={styles.evidence} open={detailed||undefined}><summary>{detailed?"来源与估算依据":"补充说明"}</summary><label>依据／备注<textarea rows={2} value={value.basis ?? ""} placeholder="简短说明标签口径或估算方法" onChange={event => change({ ...value, basis: event.target.value || null })} /></label><label>来源链接（可选）<input type="url" value={value.evidenceUrl ?? ""} onChange={event => change({ ...value, evidenceUrl: event.target.value || null })} /></label></details>
  </div>;
}
