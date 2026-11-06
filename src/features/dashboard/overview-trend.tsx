"use client";
import {RecordTrendPanel,InlineChartControls,CustomRecordRange,type RecordMetric} from "@/components/record-trend-panel";
import {formatRecordNumber,formatIntegerNumber,signedRecordNumber,signedIntegerNumber} from "@/components/number-format";
import {DayNutritionSummary} from "../meals/nutrition-composition";
import {RangeCoverage} from "./range-coverage-view";
import { ChartRanges } from "@/components/chart-ranges";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import { preferredRecordedDate, rangeContaining } from "@/components/record-dates";
import { useEffect,useRef,useState } from "react";
import { LoadingLink } from "@/components/loading-link";
import { RelationshipPlot } from "./relationship-plot";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { useMobileMode } from "@/components/use-mobile-mode";
import type { OverviewPresentation } from "./presentation";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { formatNutrition } from "../meals/model";
import { EditorDialog } from "../meals/meals-view";
import { SavedMealList } from "../meals/saved-meal-list";
import { blankEnergyDay, energyValue } from "../activities/model";
import type { OverviewDay } from "./model";
import styles from "./overview.module.css";
const signed=signedRecordNumber;
function WeightReading({ record }: { record: MeasurementDisplay | null }) {
  return <><strong>{record ? formatRecordNumber(record.weightKg) : "—"}<small>kg</small></strong>{record?.recordKind === "estimated" && <em>估计</em>}</>;
}
const blankDay = (date: string): OverviewDay => ({ date, nextDate: addCalendarDays(date, 1), meals: [], nutrition: null, morning: null, nextMorning: null, weightChangeKg: null, differenceEstimated: false, ambiguous: false, energy: blankEnergyDay(date), energyBalance: null, mealDayStatus: "unconfirmed", balanceEligible: false });
const overviewFlags=(day?:OverviewDay)=>[day?.nutrition&&day.mealDayStatus!=="complete"?"饮食"+(day.mealDayStatus==="incomplete"?"未记全":"待确认"):null,day?.nutrition?.incomplete.caloriesKcal?"营养含未知":null].filter(Boolean).join(" · ");
export function OverviewTrend({ data }: { data: OverviewPresentation }) {
  const today = data.today, mobile = useMobileMode();
  const preferred = preferredRecordedDate(data.days, today, day => day.energyBalance !== null, day => data.recordDates.includes(day.date));
  const [mode, setMode] = useState<string | null>(null), [custom, setCustom] = useState({ from: addCalendarDays(today, -29), to: today }), [estimates, setEstimates] = useState(true), [opened, setOpened] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false), [customDraft, setCustomDraft] = useState(custom);
  const range = mode ?? rangeContaining(preferred, today, mobile ? "7" : "30");
  const available = estimates ? data.estimatedDays : data.days;
  const byDate = new Map(available.map(day => [day.date, day]));
  const earliest = available.map(day => day.date).filter(date => date <= today).sort()[0] ?? today;
  const from = range === "all" ? earliest : range === "custom" ? custom.from : addCalendarDays(today, 1 - Number(range)), to = range === "custom" ? custom.to : today;
  let dates: string[] = [];
  try { const length = calendarOrdinal(to) - calendarOrdinal(from) + 1; if (length > 0 && length <= 3661) dates = Array.from({ length }, (_, index) => addCalendarDays(from, index)); } catch {}
  const days = dates.map(date => byDate.get(date) ?? blankDay(date));
  const fallback = preferredRecordedDate(days, today, day => day.energyBalance !== null, day => data.recordDates.includes(day.date));
  const selection=useChartDateSelection(dates,preferred,fallback,customOpen,String(estimates)),selected=selection.selected,day=days.find(day=>day.date===selected),dialogDay=opened?byDate.get(opened)??blankDay(opened):null;
  return <section aria-label="热量与晨重趋势" data-chart-selection={selection.regionId} data-selected-date={selected} data-selection-origin={selection.origin} {...selection.regionProps}>
    {mobile?<div className={styles.mobileTrend}>
      <div className={styles.mobileTrendHeading}><h2>能量与次晨变化</h2><button type="button" onClick={()=>{const target=selected;setOpened(target);selection.release();}}>查看记录 →</button></div>
      <ChartRanges value={range} change={key=>{selection.leave();if(key==="custom"){setCustomDraft(custom);setCustomOpen(true);}else{setMode(key);setCustomOpen(false);}}}/>
      {customOpen&&<CustomRecordRange label="总览" value={customDraft} change={setCustomDraft} apply={()=>{setCustom(customDraft);setMode("custom");setCustomOpen(false);}} cancel={()=>setCustomOpen(false)}/>}
      <div className={styles.mobileSelected} aria-live="polite"><time>{selected}</time><strong>{day?.energyBalance==null?"收支未知":day.energyBalance<0?"缺口 "+formatIntegerNumber(Math.abs(day.energyBalance)):"盈余 "+formatIntegerNumber(day.energyBalance)}<small>kcal</small></strong></div>
      <div className={styles.mobileLegend}><span><i style={{background:"var(--data-blue)"}}/>摄入</span><span><i style={{background:"var(--data-red)"}}/>消耗</span><span>金／蓝填色：盈余／缺口</span></div>
      {overviewFlags(day)&&<p className={styles.mobileFlags}>{overviewFlags(day)}</p>}
      {dates.length?<RelationshipPlot days={days} selected={selected} selection={selection}/>:<p className={styles.caption}>请选择有效日期范围，最长10年。</p>}
      <details className={styles.mobileStatistics} data-chart-controls><summary>统计与显示选项</summary><label><input type="checkbox" checked={estimates} onChange={event=>setEstimates(event.target.checked)}/>显示体重估计</label><OverviewReadings day={day} mobile={false} variants={days}/></details>
    </div>:<RecordTrendPanel
      range={<ChartRanges value={range} change={key=>{selection.leave();if(key==="custom"){setCustomDraft(custom);setCustomOpen(true);}else{setMode(key);setCustomOpen(false);}}}/>}
      custom={customOpen&&<CustomRecordRange label="总览" value={customDraft} change={setCustomDraft} apply={()=>{setCustom(customDraft);setMode("custom");setCustomOpen(false);}} cancel={()=>setCustomOpen(false)}/>}
      date={selected} view={()=>{const target=selected;setOpened(target);selection.release();}}
      readoutLabel="日期对照"
      metricVariants={days.map(day=>[formatNutrition(day.nutrition?.values.caloriesKcal??null,"caloriesKcal"),energyValue(day.energy.totalKcal),signedIntegerNumber(day.energyBalance),formatRecordNumber(day.morning?.weightKg??null),formatRecordNumber(day.nextMorning?.weightKg??null),signed(day.weightChangeKg)].slice(0,mobile?3:6))}
      metrics={overviewMetrics(day??blankDay(selected),!!mobile)}
      labelVariants={days.map(row=>overviewMetrics(row,!!mobile).map(metric=>metric.label))}
      supplementary={<OverviewReadings day={day} mobile={!!mobile} variants={days}/>} statusInDate
      flags={overviewFlags(day)} flagVariants={days.map(overviewFlags)}
      title="热量收支" unit="kcal"
      options={<InlineChartControls><label><input type="checkbox" checked={estimates} onChange={event=>setEstimates(event.target.checked)} aria-label="显示体重估计"/>显示体重估计</label></InlineChartControls>}
      legend={<><span><i style={{background:"var(--data-blue)"}}/>摄入</span><span><i style={{background:"var(--data-red)"}}/>消耗</span><span><i style={{background:"var(--data-surplus)"}}/>盈余</span><span><i style={{background:"var(--data-deficit)"}}/>缺口</span></>}
    >{dates.length?<RelationshipPlot days={days} selected={selected} selection={selection}/>:<p className={styles.caption}>请选择有效日期范围，最长10年。</p>}</RecordTrendPanel>}
    <RangeCoverage key={from+to} days={days} today={today} from={from} to={to}/>
    {dialogDay&&<EditorDialog title={dialogDay.date+" · 当日记录"} titleParts={[dialogDay.date,"当日记录"]} stableScroll close={()=>setOpened(null)} busy={false}><OverviewDayDetails day={dialogDay}/></EditorDialog>}
  </section>;
}

function overviewMetrics(day:OverviewDay,mobile:boolean):RecordMetric[]{
 return [
  {id:"intake",label:"摄入",value:formatNutrition(day.nutrition?.values.caloriesKcal??null,"caloriesKcal"),unit:"kcal",tone:"blue"},
  {id:"energy",label:"消耗",value:energyValue(day.energy.totalKcal),unit:"kcal",tone:"red"},
  {id:"balance",label:day.energyBalance==null?"收支":day.energyBalance<0?"缺口":"盈余",value:signedIntegerNumber(day.energyBalance),unit:"kcal",tone:day.energyBalance!=null&&day.energyBalance<0?"blue":"gold"},
  ...(!mobile?[
   {id:"morning",label:"晨重 "+day.date.slice(5).replace("-",".")+(day.morning?.recordKind==="estimated"?" · 估计":""),value:formatRecordNumber(day.morning?.weightKg??null),unit:"kg",inlineUnit:true},
   {id:"next",label:"次晨 "+day.nextDate.slice(5).replace("-",".")+(day.nextMorning?.recordKind==="estimated"?" · 估计":""),value:formatRecordNumber(day.nextMorning?.weightKg??null),unit:"kg",inlineUnit:true},
   {id:"change",label:"次晨变化",value:signed(day.weightChangeKg),unit:"kg",inlineUnit:true}
  ]:[])
 ];
}
function StableReadingText({value,variants}:{value:string;variants:string[]}){
 return <span className={styles.stableText}>{[...new Set(variants.filter(Boolean))].map(text=><span className={styles.stableMeasure} aria-hidden="true" key={text}>{text}</span>)}<span>{value}</span></span>;
}
const morningPair=(day?:OverviewDay)=>day?.morning?.weightKg!=null&&day.nextMorning?.weightKg!=null?formatRecordNumber(day.morning.weightKg)+" → "+formatRecordNumber(day.nextMorning.weightKg):!day?.morning?"缺当天晨重":!day.nextMorning?"缺次晨重":"未配对";
const coverageNote=(day?:OverviewDay)=>(day?.week?.coveredDays??0)<7?"已计"+(day?.week?.coveredDays??0)+"/7天":"";
const estimateNote=(day?:OverviewDay)=>day?.week?.estimated&&day.week.weightChangeKg!==null?"估计":"";
const weekBasis=(day?:OverviewDay)=>day?.week?(day.week.missingMorningDates.length?"缺"+day.week.missingMorningDates.map(date=>date.slice(5).replace("-",".")).join("、")+"晨重":"晨重 "+day.week.from.slice(5).replace("-",".")+" "+formatRecordNumber(day.week.startWeightKg)+" → "+day.week.nextDate.slice(5).replace("-",".")+" "+formatRecordNumber(day.week.endWeightKg)+" kg"):"暂无记录";

function OverviewDayDetails({day}:{day:OverviewDay}){
 return <div className={styles.dayDetails}>
  <div className={styles.detailTop}>
   <section><h3>晨间体重</h3><div className={styles.detailReading}><WeightReading record={day.morning}/></div><p>次晨 {day.nextDate.slice(5)} · {day.nextMorning?formatRecordNumber(day.nextMorning.weightKg):"—"} kg <b>{signed(day.weightChangeKg)} kg</b>{day.differenceEstimated&&day.weightChangeKg!==null?" · 含估计":""}</p><LoadingLink href={"/dashboard/measurements?date="+day.date}>身体记录 →</LoadingLink></section>
   <section><h3>消耗</h3><div className={styles.detailReading}><strong>{energyValue(day.energy.totalKcal)}<small>kcal</small></strong></div><p>静息 {energyValue(day.energy.restingKcal)} · 活动 {energyValue(day.energy.activeKcal)} kcal</p><LoadingLink href={"/dashboard/energy?date="+day.date}>消耗记录 →</LoadingLink></section>
  </div>
  <section className={styles.detailNutrition}>{day.nutrition&&day.mealDayStatus!=="complete"&&<LoadingLink className={styles.mealDayStatus} href={"/dashboard/meals?date="+day.date}>饮食待确认 →</LoadingLink>}<DayNutritionSummary totals={day.nutrition} partial={day.mealDayStatus!=="complete"}/></section>
  <SavedMealList meals={day.meals} initialLimit={3}/>
  <LoadingLink href={"/dashboard/meals?date="+day.date}>查看饮食记录 →</LoadingLink>
 </div>;
}

/** 服务端已算好当天配对和七天统计，这里只排版与格式化。 */
function OverviewReadings({day,mobile,variants}:{day?:OverviewDay;mobile:boolean;variants:OverviewDay[]}){
 const group=useRef<HTMLElement>(null),[widths,setWidths]=useState<number[]>([]);
 const readings=JSON.stringify(variants.map(row=>[signed(row.weightChangeKg),formatIntegerNumber(row.week?.energyBalance==null?null:Math.abs(row.week.energyBalance)),signed(row.week?.weightChangeKg??null)]));
 useEffect(()=>{
  const node=group.current;if(!mobile||!node)return;
  const measure=()=>{
   const canvas=document.createElement("canvas").getContext("2d");if(!canvas)return;
   const rows=JSON.parse(readings) as string[][];
   const measured=Array.from(node.querySelectorAll<HTMLElement>("strong")).map((value,i)=>{
    const unit=value.querySelector("small")!,style=getComputedStyle(value);canvas.font=style.font||style.fontWeight+" "+style.fontSize+" "+style.fontFamily;
    return Math.ceil(Math.max(0,...rows.map(row=>canvas.measureText(row[i]).width))+unit.getBoundingClientRect().width+(parseFloat(getComputedStyle(unit).marginLeft)||0));
   });
   setWidths(previous=>previous.join()===measured.join()?previous:measured);
  };
  const observer=new ResizeObserver(measure);observer.observe(node);measure();return()=>observer.disconnect();
 },[mobile,readings]);
 const week=day?.week;
 const short=(date?:string)=>date?.slice(5).replace("-",".")??"—";
 const weekLabel=week?.energyBalance==null||week.energyBalance===0?"收支":week.energyBalance<0?"缺口":"盈余";

 if(mobile)return <section ref={group} className={styles.secondaryReadings} aria-label="次晨与七天统计" data-overview-secondary data-overview-week>
  <div data-overview-next style={{minWidth:widths[0]||undefined}}><StableReadingText value={"次晨变化"+(day?.differenceEstimated?" · 估计":"")} variants={variants.map(row=>"次晨变化"+(row.differenceEstimated?" · 估计":""))}/><strong>{signed(day?.weightChangeKg??null)}<small>kg</small></strong><p><StableReadingText value={morningPair(day)} variants={variants.map(morningPair)}/></p></div>
  <div data-overview-week-energy style={{minWidth:widths[1]||undefined}}><span>近7天{weekLabel}</span><strong className={week?.energyBalance!=null&&week.energyBalance<0?styles.weekDeficit:styles.weekSurplus}>{formatIntegerNumber(week?.energyBalance==null?null:Math.abs(week.energyBalance))}<small>kcal</small></strong>{variants.some(row=>coverageNote(row))&&<p><StableReadingText value={coverageNote(day)} variants={variants.map(coverageNote)}/></p>}</div>
  <div data-overview-week-weight style={{minWidth:widths[2]||undefined}}><span>近7天体重变化</span><strong>{signed(week?.weightChangeKg??null)}<small>kg</small></strong>{variants.some(row=>estimateNote(row))&&<p><StableReadingText value={estimateNote(day)} variants={variants.map(estimateNote)}/></p>}</div>
 </section>;
 return <section className={styles.weekReadings} aria-label="选中日七天统计" data-overview-week>
   <div className={styles.weekContent}>
    <header><span>近7天 <time>{short(week?.from)}—{short(week?.through)}</time></span></header>
    <div className={styles.weekNumbers}>
     <div data-overview-week-energy><span>{week?.energyBalance==null?"热量收支":week.energyBalance<0?"热量缺口":"热量盈余"}</span><strong className={week?.energyBalance!=null&&week.energyBalance<0?styles.weekDeficit:styles.weekSurplus}>{signedIntegerNumber(week?.energyBalance??null)}<small>kcal</small></strong></div>
     <div data-overview-week-weight><StableReadingText value={"体重变化"+(estimateNote(day)?" · 含估计":"")} variants={variants.map(row=>"体重变化"+(estimateNote(row)?" · 含估计":""))}/><strong>{signed(week?.weightChangeKg??null)}<small>kg</small></strong></div>
    </div>
    <span className={styles.weekCoverage}>已计{week?.coveredDays??0}/7天</span>
    <p className={styles.weekBasis}><StableReadingText value={weekBasis(day)} variants={variants.map(weekBasis)}/></p>
   </div>
  </section>;
}
