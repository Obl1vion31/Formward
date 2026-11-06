"use client";
import {useLayoutEffect,useRef,useState} from "react";
import {formatNutrition,macroComposition,macroColors,metricLabels,type Totals} from "./model";
import styles from "./nutrition-composition.module.css";

const percent=(value:number)=>new Intl.NumberFormat("zh-CN",{maximumFractionDigits:1}).format(value*100)+"%";
export function NutritionComposition({totals}:{totals:Totals|null|undefined}){
 const {kind,segments}=macroComposition(totals);
 const description=kind==="known"?segments.map(s=>metricLabels[s.metric]+percent(s.ratio)).join("、"):kind==="zero"?"三项均为0，暂无供能占比":"营养未齐，暂不计算占比";
 return <figure className={styles.composition} data-nutrition-composition={kind}>
  <svg viewBox="0 0 100 100" role="img" aria-label={"蛋白质、碳水、脂肪供能比例："+description}>
   <circle cx="50" cy="50" r="38" fill="none" stroke="var(--line-strong)" strokeWidth="12"/>
   {segments.map((segment,index)=>{const start=segments.slice(0,index).reduce((sum,s)=>sum+s.ratio*100,0);return <circle key={segment.metric} data-macro-share={segment.metric} data-ratio={segment.ratio} cx="50" cy="50" r="38" pathLength="100" fill="none" stroke={macroColors[segment.metric]} strokeWidth="12" strokeDasharray={`${segment.ratio*100} ${100-segment.ratio*100}`} strokeDashoffset={-start} transform="rotate(-90 50 50)"/>;})}
   <text x="50" y="54" textAnchor="middle" fill="var(--muted)" fontSize="17">{kind==="known"?"供能":kind==="zero"?"0":"—"}</text>
  </svg>
 </figure>;
}
export function CompositionLegend({totals}:{totals:Totals|null|undefined}){
 const {kind,segments}=macroComposition(totals);
 return kind==="known"?<span className={styles.legend}>{segments.map(s=><span key={s.metric}><i style={{background:macroColors[s.metric]}}/>{metricLabels[s.metric]} <b>{percent(s.ratio)}</b></span>)}</span>:null;
}

export function DayNutritionSummary({totals,partial=false}:{totals:Totals|null|undefined;partial?:boolean}){
 const state=macroComposition(totals);
 const numbers=useRef<HTMLDivElement>(null),[columns,setColumns]=useState(4);
 const metrics=["caloriesKcal","proteinG","carbsG","fatG"] as const;
 const signature=JSON.stringify(metrics.map(metric=>[totals?.values[metric],totals?.incomplete[metric]]));
 useLayoutEffect(()=>{
  const group=numbers.current;if(!group)return;
  const measure=()=>{
   const gap=parseFloat(getComputedStyle(group).columnGap)||0;
   const scale=group.getBoundingClientRect().width/group.offsetWidth||1;
   const widths=[...group.children].map(item=>Math.max(...[...item.querySelectorAll<HTMLElement>("[data-summary-measure]")].map(node=>node.getBoundingClientRect().width/scale)));
   const fits=(count:number)=>{const weights=count===4?[1.4,1,1,1]:Array(count).fill(1),available=group.clientWidth-gap*(count-1),weight=weights.reduce((a,b)=>a+b,0);return widths.every((width,index)=>width<=available*weights[index%count]/weight+1);};
   const next=fits(4)?4:fits(2)?2:1;setColumns(current=>current===next?current:next);
  };
  const observer=new ResizeObserver(measure);observer.observe(group);group.querySelectorAll<HTMLElement>("[data-summary-measure]").forEach(node=>observer.observe(node));
  measure();let active=true;void document.fonts.ready.then(()=>{if(active)measure();});
  return()=>{active=false;observer.disconnect();};
 },[signature]);
 return <div className={styles.summary} data-day-nutrition-summary role="group" aria-label={partial?"当天已记录营养合计":"当天营养合计"}>
  <NutritionComposition totals={totals}/>
  <div ref={numbers} className={styles.numbers} data-nutrition-columns={columns}>{metrics.map(metric=><div key={metric}><span className={styles.metricLabel}><span data-summary-measure>{metric==="caloriesKcal"?"当天合计":metricLabels[metric]}{totals?.incomplete[metric]&&totals.values[metric]!=null&&<small> · 已知部分</small>}</span></span><strong><span data-summary-measure>{formatNutrition(totals?.values[metric]??null,metric)}<small>{metric==="caloriesKcal"?"kcal":"g"}</small></span></strong></div>)}</div>
  <div className={styles.shares}>{state.kind!=="known"&&<p className={styles.caption}>{state.kind==="zero"?"零供能":"营养未齐"}</p>}<CompositionLegend totals={totals}/></div>
 </div>;
}
