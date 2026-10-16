"use client";
import { useEffect, useId, useRef, useState } from "react";
import { LoadingLink } from "@/components/loading-link";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { dailyTotals, formatNutrition, type MealView } from "../meals/model";
import { EditorDialog } from "../meals/meals-view";
import { NutritionTable, MealEvidence } from "../meals/review-details";
import { ImageGallery } from "../meals/photos";
import { overviewDays, overviewWeightSeries, type OverviewDay } from "./model";
import styles from "./overview.module.css";
const signed=(value:number|null)=>value===null?"—":`${value>0?"+":""}${Number(value.toFixed(2))}`;
function WeightReading({record}:{record:MeasurementDisplay|null}) {
 return <><strong>{record?Number(record.weightKg):"—"}<small>kg</small></strong>{record?.recordKind==="estimated"&&<em>估计</em>}</>;
}
export function OverviewTrend({meals,records,today}:{meals:MealView[];records:MeasurementDisplay[];today:string}) {
 const [mode,setMode]=useState("30"),[custom,setCustom]=useState({from:addCalendarDays(today,-29),to:today}),[inspected,setInspected]=useState(today),[estimates,setEstimates]=useState(true),[opened,setOpened]=useState<string|null>(null);
 const earliest=[today,...dailyTotals(meals).map(day=>day.date),...records.map(record=>record.recordDate)].filter(date=>date<=today).sort()[0];
 const from=mode==="all"?earliest:mode==="custom"?custom.from:addCalendarDays(today,1-Number(mode)),to=mode==="custom"?custom.to:today;
 let dates:string[]=[];
 try { const length=calendarOrdinal(to)-calendarOrdinal(from)+1;if(length>0&&length<=3661)dates=Array.from({length},(_,index)=>addCalendarDays(from,index)); } catch {}
 const selected=dates.includes(inspected)?inspected:to,days=overviewDays(meals,records,dates,estimates),day=days.find(day=>day.date===selected),dialogDay=overviewDays(meals,records,opened?[opened]:[],estimates)[0];
 const {baseline}=overviewWeightSeries(days);
 return <section className={styles.trends} aria-label="身体与饮食趋势">
 <div className={styles.trendToolbar}><h2>摄入与体重</h2><div className={styles.ranges}>{[["7","7D"],["30","30D"],["90","90D"],["all","全部"],["custom","自定义"]].map(([key,label])=><button key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}>{label}</button>)}</div><label className={styles.estimateToggle}><input type="checkbox" checked={estimates} onChange={event=>setEstimates(event.target.checked)}/>显示已有估计</label></div>
 {mode==="custom"&&<div className={styles.customRange}><label>开始<input aria-label="总览开始日期" type="date" value={custom.from} onChange={event=>setCustom({...custom,from:event.target.value})}/></label><label>结束<input aria-label="总览结束日期" type="date" value={custom.to} onChange={event=>setCustom({...custom,to:event.target.value})}/></label></div>}
 {!dates.length?<p className={styles.caption}>请选择有效日期范围，最长 10 年。</p>:<>
 <p className={styles.caption}>{from.replaceAll("-",".")} — {to.replaceAll("-",".")}</p>
 <div className={styles.legend}><span><i style={{background:"#6C96B3"}}/>每日摄入 · kcal</span><span><i style={{background:"#BEA478",height:2}}/>晨重变化 · kg</span><span><i style={{background:"#C07B77"}}/>晚重 − 晨重 · kg</span></div>
 <div className={styles.dayReadout} aria-live="polite" aria-atomic="true" aria-label="日期对照" data-selected-date={selected}>
 <div><time dateTime={selected}>{selected.replaceAll("-",".")}</time><strong>{formatNutrition(day?.nutrition?.values.caloriesKcal??null,"caloriesKcal")}<small>kcal</small></strong><span>{day?.nutrition?.incomplete.caloriesKcal?"已知合计 · 不完整":"当天已记录摄入"}</span></div>
 <div><span>晨间体重{day?.ambiguous.weightKg?" · 待选择":""}</span><WeightReading record={day?.body.weightKg??null}/></div>
 <div><span>晚间体重</span><WeightReading record={day?.evening??null}/></div>
 <div><span>晚重 − 晨重</span><strong>{signed(day?.weightDifferenceKg??null)}<small>kg</small></strong>{day?.differenceEstimated&&<em>含估计</em>}</div>
 </div>
 <CombinedPlot days={days} selected={selected} inspect={setInspected} open={date=>{setInspected(date);setOpened(date);}}/>
 <p className={styles.caption}>{baseline?`晨重变化以 ${baseline.recordDate} 的 ${Number(baseline.weightKg)} kg 为基准。`:"区间内暂无晨间体重。"}右轴为 kg；纹理柱和虚线含已有估计。缺记录留空，点击日期查看详情。</p>
 </>}
 {dialogDay&&<EditorDialog title={`${dialogDay.date} · 当日记录`} close={()=>setOpened(null)} busy={false}><div className={styles.dayDetails}>
 <h3>当天身体记录</h3><p>晨间 <WeightReading record={dialogDay.body.weightKg}/></p><p>晚间 <WeightReading record={dialogDay.evening}/></p><p>晚重 − 晨重 {signed(dialogDay.weightDifferenceKg)} kg{dialogDay.differenceEstimated?" · 含估计":""}</p><LoadingLink href={`/dashboard/measurements?date=${dialogDay.date}`}>查看身体记录 →</LoadingLink>
 <h3>当天饮食 · {dialogDay.meals.length} 餐</h3>{dialogDay.meals.map(meal=><article key={meal.id}><h4>{meal.mealType}<span>{formatNutrition(meal.totals.values.caloriesKcal,"caloriesKcal")} kcal</span></h4><NutritionTable items={meal.items} saved/><MealEvidence notes={meal.notes}/><ImageGallery ids={meal.imageIds}/></article>)}{!dialogDay.meals.length&&<p>当天没有饮食记录。</p>}<LoadingLink href={`/dashboard/meals?date=${dialogDay.date}`}>查看饮食记录 →</LoadingLink>
 </div></EditorDialog>}
 </section>;
}
function CombinedPlot({days,selected,inspect,open}:{days:OverviewDay[];selected:string;inspect:(date:string)=>void;open:(date:string)=>void}) {
 const container=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0),pattern=useId();
 useEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(container.current!);return()=>observer.disconnect();},[]);
 const {points}=overviewWeightSeries(days),w=width||280,left=48,right=44,top=28,bottom=266,slot=(w-left-right)/days.length,x=(index:number)=>left+(index+.5)*slot;
 const maxKcal=Math.max(1,...days.map(day=>Number(day.nutrition?.values.caloriesKcal??0)))*1.15,kcalY=(value:number)=>bottom-value/maxKcal*(bottom-top);
 const kgValues=points.flatMap(({day,relativeKg})=>[relativeKg,day.weightDifferenceKg].filter((v):v is number=>v!==null));
 const min=Math.min(0,...kgValues),max=Math.max(0,...kgValues),padding=Math.max(.15,(max-min)*.15),low=min-padding,high=max+padding,kgY=(value:number)=>bottom-(value-low)/(high-low)*(bottom-top),zero=kgY(0),barWidth=Math.min(19,slot*.34);
 return <div ref={container} className={styles.plot}><svg viewBox={`0 0 ${w} 310`} style={{visibility:width?undefined:"hidden"}} role="group" aria-label="摄入与体重总览图">
 <defs><pattern id={pattern} width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#C07B77"/><path d="M0 5L5 0" stroke="#151513" strokeWidth="1.4"/></pattern></defs>
 <text x={left-8} y="14" textAnchor="end" className={styles.axis}>kcal</text><text x={w-right+8} y="14" className={styles.axis}>kg</text>
 {[0,1,2,3,4].map(i=><g key={i}><line x1={left} x2={w-right} y1={kcalY(maxKcal*i/4)} y2={kcalY(maxKcal*i/4)} className={styles.grid}/><text x={left-8} y={kcalY(maxKcal*i/4)+4} textAnchor="end" className={styles.axis}>{Math.round(maxKcal*i/4)}</text><text x={w-right+8} y={kgY(low+(high-low)*i/4)+4} className={styles.axis}>{Number((low+(high-low)*i/4).toFixed(2))}</text></g>)}
 <line x1={left} x2={w-right} y1={zero} y2={zero} stroke="#C07B77" strokeOpacity=".55" strokeDasharray="3 4"/><text x={w-right+8} y={zero+4} className={styles.zero}>0</text>
 {points.map(({day,relativeKg},index)=>{
 const calories=day.nutrition?.values.caloriesKcal,delta=day.weightDifferenceKg,previous=points[index-1],estimated=day.body.weightKg?.recordKind==="estimated";
 return <g key={day.date} role="button" tabIndex={day.date===selected?0:-1} data-overview-date={day.date} aria-label={`${day.date} · 摄入 ${calories??"未记录"} kcal · 晨重 ${day.body.weightKg?.weightKg??"未记录"} kg · 晨晚差 ${signed(delta)} kg${day.differenceEstimated?" · 含估计":""}`} onMouseEnter={()=>inspect(day.date)} onFocus={()=>inspect(day.date)} onClick={()=>open(day.date)} onKeyDown={event=>{
 if(["Enter"," "].includes(event.key)){event.preventDefault();open(day.date);}
 const next=event.key==="ArrowLeft"?index-1:event.key==="ArrowRight"?index+1:event.key==="Home"?0:event.key==="End"?days.length-1:null;
 if(next!==null){event.preventDefault();event.currentTarget.parentElement?.querySelectorAll<SVGGElement>("[data-overview-date]")[Math.max(0,Math.min(days.length-1,next))]?.focus();}
 }}><rect x={left+index*slot} y={top} width={slot} height={bottom-top} className={styles.plotHit}/>
 {calories!==null&&calories!==undefined&&<rect data-overview-value={calories} data-series="calories" x={x(index)-barWidth-1} y={kcalY(Number(calories))} width={barWidth} height={bottom-kcalY(Number(calories))} fill="#6C96B3" opacity={day.nutrition?.incomplete.caloriesKcal?.5:.85} className={styles.plotData}/>}
 {delta!==null&&<rect data-series="difference" data-overview-value={delta} data-estimated={day.differenceEstimated} x={x(index)+1} y={Math.min(zero,kgY(delta))} width={barWidth} height={Math.max(1,Math.abs(kgY(delta)-zero))} fill={day.differenceEstimated?`url(#${pattern})`:"#C07B77"} className={styles.plotData}/>}
 {relativeKg!==null&&<>{previous?.relativeKg!==null&&previous?.relativeKg!==undefined&&<line x1={x(index-1)} x2={x(index)} y1={kgY(previous.relativeKg)} y2={kgY(relativeKg)} stroke="#BEA478" strokeWidth="1.8" strokeDasharray={estimated||previous.day.body.weightKg?.recordKind==="estimated"?"4 4":undefined} className={styles.plotData}/>}<circle data-series="weight" data-overview-value={day.body.weightKg?.weightKg} data-relative-kg={relativeKg} data-kind={day.body.weightKg?.recordKind} cx={x(index)} cy={kgY(relativeKg)} r={days.length>90?1.5:2.5} fill={estimated?"#151513":"#BEA478"} stroke="#BEA478" className={styles.plotData}/></>}
 {days.length<=7&&<text x={x(index)} y="294" textAnchor="middle" className={styles.axis}>{slot>=46?day.date.slice(5):day.date.slice(8)}</text>}
 </g>;
 })}
 <line data-crosshair-date={selected} x1={x(days.findIndex(day=>day.date===selected))} x2={x(days.findIndex(day=>day.date===selected))} y1={top} y2={bottom+7} className={styles.crosshair}/>
 {days.length>7&&<text x={Math.max(left+20,Math.min(w-right-20,x(days.findIndex(day=>day.date===selected))))} y="294" textAnchor="middle" className={styles.axis}>{selected.slice(5)}</text>}
 </svg></div>;
}
