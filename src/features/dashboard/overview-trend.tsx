"use client";
import {RecordTrendPanel,InlineChartControls,CustomRecordRange} from "@/components/record-trend-panel";
import {formatRecordNumber,signedRecordNumber,signedIntegerNumber} from "@/components/number-format";
import {mealTypeLabel} from "../meals/model";
import { ChartRanges } from "@/components/chart-ranges";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import { Disclosure } from "@/components/disclosure";
import { preferredRecordedDate, rangeContaining } from "@/components/record-dates";
import { useState } from "react";
import { LoadingLink } from "@/components/loading-link";
import { RelationshipPlot } from "./relationship-plot";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { useMobileMode } from "@/components/use-mobile-mode";
import type { OverviewPresentation } from "./presentation";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { formatNutrition } from "../meals/model";
import { EditorDialog } from "../meals/meals-view";
import { NutritionTable, MealEvidence } from "../meals/review-details";
import { ImageGallery } from "../meals/photos";
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
  const selection=useChartDateSelection(dates,preferred,fallback,customOpen),selected=selection.selected,day=days.find(day=>day.date===selected),dialogDay=opened?byDate.get(opened)??blankDay(opened):null;
  return <section aria-label="热量与晨重趋势" data-chart-selection={selection.regionId} data-selected-date={selected} data-pinned-date={selection.pinned??undefined}>
    <RecordTrendPanel
      range={<ChartRanges value={range} change={key=>{selection.leave();if(key==="custom"){setCustomDraft(custom);setCustomOpen(true);}else{setMode(key);setCustomOpen(false);}}}/>}
      custom={customOpen&&<CustomRecordRange label="总览" value={customDraft} change={setCustomDraft} apply={()=>{setCustom(customDraft);setMode("custom");setCustomOpen(false);}} cancel={()=>setCustomOpen(false)}/>}
      date={selected} view={()=>{selection.release();setOpened(selected);}}
      readoutLabel="日期对照"
      metrics={[
       {label:"摄入",value:formatNutrition(day?.nutrition?.values.caloriesKcal??null,"caloriesKcal"),unit:"kcal",tone:"blue"},
       {label:"消耗",value:energyValue(day?.energy.totalKcal),unit:"kcal",tone:"red"},
       {label:day?.energyBalance==null?"收支":day.energyBalance<0?"缺口":"盈余",value:signedIntegerNumber(day?.energyBalance??null),unit:"kcal",tone:day?.energyBalance!=null&&day.energyBalance<0?"blue":"gold"}
      ]}
      flags={overviewFlags(day)} flagVariants={days.map(overviewFlags)}
      title="热量收支"
      options={<InlineChartControls><label><input type="checkbox" checked={estimates} onChange={event=>setEstimates(event.target.checked)} aria-label="显示体重估计"/>显示体重估计</label></InlineChartControls>}
      legend={<><span><i style={{background:"#92B9D6"}}/>摄入</span><span><i style={{background:"#D89490"}}/>消耗</span><span><i style={{background:"#D8B38A"}}/>盈余</span><span><i style={{background:"#92B2C2"}}/>缺口</span></>}
    >{dates.length?<RelationshipPlot days={days} selected={selected} inspect={selection.choose} preview={selection.preview} leave={selection.leave} pin={selection.pin} unpin={selection.release}/>:<p className={styles.caption}>请选择有效日期范围，最长10年。</p>}</RecordTrendPanel>
    {dialogDay&&<EditorDialog title={dialogDay.date+" · 当日记录"} close={()=>setOpened(null)} busy={false}><OverviewDayDetails day={dialogDay}/></EditorDialog>}
  </section>;
}

function OverviewDayDetails({day}:{day:OverviewDay}){
 const mealRow=(meal:OverviewDay["meals"][number])=><Disclosure key={meal.id} className={styles.compactMeal} summary={<><span><strong>{mealTypeLabel(meal.mealType)}</strong><span>{meal.items.map(item=>item.name).join("、")}</span></span><b>{formatNutrition(meal.totals.values.caloriesKcal,"caloriesKcal")} <small>kcal</small></b></>}><NutritionTable items={meal.items} saved/><MealEvidence notes={meal.notes}/><ImageGallery ids={meal.imageIds}/><LoadingLink href={"/dashboard/meals?date="+day.date}>编辑这一日饮食 →</LoadingLink></Disclosure>;
 return <div className={styles.dayDetails}>
  <div className={styles.detailTop}>
   <section><h3>晨间体重</h3><div className={styles.detailReading}><WeightReading record={day.morning}/></div><p>次晨 {day.nextDate.slice(5)} · {day.nextMorning?formatRecordNumber(day.nextMorning.weightKg):"—"} kg <b>{signed(day.weightChangeKg)} kg</b>{day.differenceEstimated&&day.weightChangeKg!==null?" · 含估计":""}</p><LoadingLink href={"/dashboard/measurements?date="+day.date}>身体记录 →</LoadingLink></section>
   <section><h3>消耗</h3><div className={styles.detailReading}><strong>{energyValue(day.energy.totalKcal)}<small>kcal</small></strong></div><p>静息 {energyValue(day.energy.restingKcal)} · 活动 {energyValue(day.energy.activeKcal)} kcal</p><LoadingLink href={"/dashboard/energy?date="+day.date}>消耗记录 →</LoadingLink></section>
  </div>
  <section className={styles.detailNutrition}>{day.nutrition&&day.mealDayStatus!=="complete"&&<p>饮食修改后需要重新确认是否已记全，确认后显示热量收支。</p>}<h3>当日总摄入 <small>{day.meals.length} 餐</small></h3><div>{(["caloriesKcal","proteinG","carbsG","fatG"] as const).map((metric,i)=><span key={metric}><small>{["热量","蛋白质","碳水","脂肪"][i]}</small><strong>{formatNutrition(day.nutrition?.values[metric]??null,metric)}<small>{i?"g":"kcal"}</small></strong>{day.nutrition?.incomplete[metric]&&<small>已知部分</small>}</span>)}</div></section>
  <div>{day.meals.slice(0,3).map(mealRow)}{day.meals.length>3&&<Disclosure className={styles.moreMeals} summary={"还有 "+(day.meals.length-3)+" 餐"}>{day.meals.slice(3).map(mealRow)}</Disclosure>}{!day.meals.length&&<p>没有饮食记录。</p>}</div>
  <LoadingLink href={"/dashboard/meals?date="+day.date}>查看饮食记录 →</LoadingLink>
 </div>;
}
