"use client";
import { useEffect, useRef, useState } from "react";
import { LoadingLink } from "@/components/loading-link";
import { useMobileMode } from "@/components/use-mobile-mode";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { normalScale } from "../measurements/trend";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { dailyTotals, formatNutrition, type MealView } from "../meals/model";
import { EditorDialog } from "../meals/meals-view";
import { NutritionTable, MealEvidence } from "../meals/review-details";
import { ImageGallery } from "../meals/photos";
import { overviewDays, type OverviewDay } from "./model";
import styles from "./overview.module.css";
const metrics=["weightKg","bodyFatPercent","caloriesKcal"] as const;
type Metric=typeof metrics[number];
const names={weightKg:"空腹体重",bodyFatPercent:"体脂率",caloriesKcal:"每日摄入"};
const units={weightKg:"kg",bodyFatPercent:"%",caloriesKcal:"kcal"};
const colors={weightKg:"#bea478",bodyFatPercent:"#93adb5",caloriesKcal:"#7F9EAF"};
const valueAt=(day:OverviewDay,metric:Metric)=>metric==="caloriesKcal"?day.nutrition?.values.caloriesKcal??null:day.body[metric]?.[metric]??null;
function BodyReading({day}:{day:OverviewDay}){
 return <span>{(["weightKg","bodyFatPercent"] as const).map(metric=><span key={metric}>{metric==="weightKg"?"体重":"体脂"} <strong>{day.body[metric]?.[metric]??"—"}<small>{units[metric]}</small></strong>{day.ambiguous[metric]?<em>待选择</em>:day.body[metric]?.recordKind==="estimated"?<em>估计</em>:null}</span>)}</span>;
}
export function OverviewTrend({meals,records,today}:{meals:MealView[];records:MeasurementDisplay[];today:string}){
 const mobile=useMobileMode(),[choice,setChoice]=useState<string|null>(null),mode=choice??(mobile?"7":"30");
 const [custom,setCustom]=useState({from:addCalendarDays(today,-29),to:today}),[inspected,setInspected]=useState(today),[estimates,setEstimates]=useState(false),[opened,setOpened]=useState<string|null>(null);
 const earliest=[today,...dailyTotals(meals).map(day=>day.date),...records.map(record=>record.recordDate)].filter(date=>date<=today).sort()[0];
 const from=mode==="all"?earliest:mode==="custom"?custom.from:addCalendarDays(today,1-Number(mode)),to=mode==="custom"?custom.to:today;
 let dates:string[]=[];
 try{const length=calendarOrdinal(to)-calendarOrdinal(from)+1;if(length>0&&length<=3661)dates=Array.from({length},(_,index)=>addCalendarDays(from,index));}catch{}
 const selected=dates.includes(inspected)?inspected:to;
 const days=overviewDays(meals,records.filter(record=>record.recordDate<=today),dates.length?[...dates,addCalendarDays(to,1)]:[],estimates),byDate=new Map(days.map(day=>[day.date,day]));
 const day=byDate.get(selected),next=dates.length?byDate.get(addCalendarDays(selected,1)):undefined,dialogDay=opened?byDate.get(opened):undefined;
 return <section className={styles.trends} aria-label="身体与饮食趋势">
  <div className={styles.trendToolbar}><h2>历史趋势</h2><div className={styles.ranges}>{[["7","7D"],["30","30D"],["90","90D"],["all","全部"],["custom","自定义"]].map(([key,label])=><button key={key} aria-pressed={mode===key} onClick={()=>setChoice(key)}>{label}</button>)}</div><label className={styles.estimateToggle}><input type="checkbox" checked={estimates} onChange={event=>setEstimates(event.target.checked)}/>显示已有估计</label></div>
  {mode==="custom"&&<div className={styles.customRange}><label>开始<input aria-label="总览开始日期" type="date" value={custom.from} onChange={event=>setCustom({...custom,from:event.target.value})}/></label><label>结束<input aria-label="总览结束日期" type="date" value={custom.to} onChange={event=>setCustom({...custom,to:event.target.value})}/></label></div>}
  {!dates.length?<p className={styles.caption}>请选择有效日期范围，最长 10 年。</p>:<>
   <p className={styles.caption}>{from.replaceAll("-",".")} — {to.replaceAll("-",".")} · 按真实日期对齐</p>
   <div className={styles.dayReadout} aria-live="polite" aria-atomic="true" aria-label="日期对照" data-selected-date={selected}><div><time dateTime={selected}>{selected.replaceAll("-",".")}</time><span>当天已记录摄入</span><strong>{formatNutrition(day?.nutrition?.values.caloriesKcal??null,"caloriesKcal")}<small>kcal</small></strong>{day?.nutrition?.incomplete.caloriesKcal&&<em>已知合计 · 不完整</em>}</div><div><span>当天空腹 · {selected.slice(5)}</span>{day&&<BodyReading day={day}/>}</div><div><span>次晨空腹 · {addCalendarDays(selected,1).slice(5)}</span>{next&&<BodyReading day={next}/>}</div></div>
   <LinkedPlots days={days.slice(0,dates.length)} selected={selected} ready={mobile!==null} inspect={setInspected} open={date=>{setInspected(date);setOpened(date);}}/>
   <p className={styles.caption}>选择日期对照摄入与次晨实测，点击查看当日记录。缺记录留空；估计不作为实测。</p>
  </>}
  {dialogDay&&<EditorDialog title={`${dialogDay.date} · 当日记录`} close={()=>setOpened(null)} busy={false}>
   <div className={styles.dayDetails}><h3>当天空腹</h3><BodyReading day={dialogDay}/><LoadingLink href={`/dashboard/measurements?date=${dialogDay.date}`}>查看身体记录 →</LoadingLink><h3>次晨空腹 · {addCalendarDays(dialogDay.date,1)}</h3>{byDate.get(addCalendarDays(dialogDay.date,1))&&<BodyReading day={byDate.get(addCalendarDays(dialogDay.date,1))!}/>}<LoadingLink href={`/dashboard/measurements?date=${addCalendarDays(dialogDay.date,1)}`}>查看次晨记录 →</LoadingLink><h3>当天饮食 · {dialogDay.meals.length} 餐</h3>{dialogDay.meals.map(meal=><article key={meal.id}><h4>{meal.mealType}<span>{formatNutrition(meal.totals.values.caloriesKcal,"caloriesKcal")} kcal</span></h4><NutritionTable items={meal.items} saved/><MealEvidence notes={meal.notes}/><ImageGallery ids={meal.imageIds}/></article>)}{!dialogDay.meals.length&&<p>当天没有饮食记录。</p>}<LoadingLink href={`/dashboard/meals?date=${dialogDay.date}`}>查看饮食记录 →</LoadingLink></div>
  </EditorDialog>}
 </section>;
}
function LinkedPlots({days,selected,ready,inspect,open}:{days:OverviewDay[];selected:string;ready:boolean;inspect:(date:string)=>void;open:(date:string)=>void}){
 const container=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0);
 useEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(container.current!);return()=>observer.disconnect();},[]);
 const measured=width||280,left=54,right=14,slot=(measured-left-right)/days.length,x=(index:number)=>left+(index+.5)*slot;
 return <div ref={container} className={styles.linkedPlots} style={{visibility:ready&&width?undefined:"hidden"}}>{metrics.map(metric=>{
  const values=days.flatMap(day=>valueAt(day,metric)===null?[]:[Number(valueAt(day,metric))]),scale=normalScale(values),high=metric==="caloriesKcal"?Math.max(1,...values)*1.16:scale.high,low=metric==="caloriesKcal"?0:scale.low,y=(value:number)=>170-(value-low)/(high-low)*140;
  const ticks=metric==="caloriesKcal"?[0,1,2,3].map(n=>high*n/3):scale.ticks;
  return <section className={styles.plot} key={metric}><h3>{names[metric]} <small>{units[metric]}</small></h3><svg viewBox={`0 0 ${measured} 202`} role="group" aria-label={`${names[metric]}趋势图`}>
   {ticks.map((tick,index)=><g key={index}><line x1={left} x2={measured-right} y1={y(tick)} y2={y(tick)} className={styles.grid}/><text x={left-9} y={y(tick)+4} textAnchor="end" className={styles.axis}>{metric==="caloriesKcal"?Math.round(tick):Number(tick.toFixed(2))}</text></g>)}
   {days.map((day,index)=>{const value=valueAt(day,metric),previous=index?days[index-1]:null,previousValue=previous?valueAt(previous,metric):null,estimated=metric!=="caloriesKcal"&&day.body[metric]?.recordKind==="estimated",incomplete=metric==="caloriesKcal"&&day.nutrition?.incomplete.caloriesKcal;
    return <g key={day.date} role="button" tabIndex={day.date===selected?0:-1} data-overview-date={day.date} aria-label={`${day.date} · ${names[metric]} ${value??"未记录"}${value===null?"":units[metric]}${estimated?" · 估计":""}${incomplete?" · 已知合计，不完整":""}`} onMouseEnter={()=>inspect(day.date)} onFocus={()=>inspect(day.date)} onClick={()=>open(day.date)} onKeyDown={event=>{
     if(["Enter"," "].includes(event.key)){event.preventDefault();open(day.date);}
     const next=event.key==="ArrowLeft"?index-1:event.key==="ArrowRight"?index+1:event.key==="Home"?0:event.key==="End"?days.length-1:null;
     if(next!==null){event.preventDefault();event.currentTarget.parentElement?.querySelectorAll<SVGGElement>("[data-overview-date]")[Math.max(0,Math.min(days.length-1,next))]?.focus();}
    }}><rect x={left+index*slot} y="15" width={slot} height="161" className={styles.plotHit}/>
     {metric==="caloriesKcal"?value!==null&&<><rect data-overview-value={value} x={x(index)-Math.min(28,slot*.68)/2} y={y(Number(value))} width={Math.min(28,slot*.68)} height={170-y(Number(value))} fill={colors[metric]} opacity={incomplete?.45:1} className={styles.plotData}/>{days.length<=7&&slot>String(Math.round(Number(value))).length*7+8&&<text x={x(index)} y={y(Number(value))-6} textAnchor="middle" className={styles.valueLabel}>{Math.round(Number(value))}</text>}</>:value!==null&&<>
      {previousValue!==null&&<line x1={x(index-1)} x2={x(index)} y1={y(Number(previousValue))} y2={y(Number(value))} stroke={colors[metric]} strokeWidth="1.7" strokeDasharray={estimated||previous?.body[metric]?.recordKind==="estimated"?"4 4":undefined} className={styles.plotData}/>}
      <circle data-overview-value={value} data-kind={day.body[metric]?.recordKind} cx={x(index)} cy={y(Number(value))} r={days.length>90?1.6:2.5} fill={estimated?"#151513":colors[metric]} stroke={colors[metric]} className={styles.plotData}/>
     </>}
     {metric==="caloriesKcal"&&days.length<=7&&<text x={x(index)} y="196" textAnchor="middle" className={styles.axis}>{slot>=46?day.date.slice(5):day.date.slice(8)}</text>}
    </g>;
   })}
   <line data-crosshair-date={selected} x1={x(days.findIndex(day=>day.date===selected))} x2={x(days.findIndex(day=>day.date===selected))} y1="18" y2="176" className={styles.crosshair}/>
   {metric==="caloriesKcal"&&days.length>7&&<text x={Math.max(left+20,Math.min(measured-right-20,x(days.findIndex(day=>day.date===selected))))} y="196" textAnchor="middle" className={styles.axis}>{selected.slice(5)}</text>}
  </svg></section>;
 })}</div>;
}
