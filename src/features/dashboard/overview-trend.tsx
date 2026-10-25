"use client";
import { Disclosure } from "@/components/disclosure";
import { preferredRecordedDate, rangeContaining } from "@/components/record-dates";
import { useEffect, useRef, useState } from "react";
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
const signed = (value: number | null, precision = 2) => value === null ? "—" : `${value > 0 ? "+" : ""}${Number(value.toFixed(precision))}`;
function WeightReading({ record }: { record: MeasurementDisplay | null }) {
  return <><strong>{record ? Number(record.weightKg) : "—"}<small>kg</small></strong>{record?.recordKind === "estimated" && <em>估计</em>}</>;
}
const blankDay = (date: string): OverviewDay => ({ date, nextDate: addCalendarDays(date, 1), meals: [], nutrition: null, morning: null, nextMorning: null, weightChangeKg: null, differenceEstimated: false, ambiguous: false, energy: blankEnergyDay(date), energyBalance: null, mealDayStatus: "unconfirmed", balanceEligible: false });
export function OverviewTrend({ data }: { data: OverviewPresentation }) {
  const today = data.today, mobile = useMobileMode();
  const preferred = preferredRecordedDate(data.days, today, day => day.energyBalance !== null, day => data.recordDates.includes(day.date));
  const [mode, setMode] = useState<string | null>(null), [custom, setCustom] = useState({ from: addCalendarDays(today, -29), to: today }), [inspected, setInspected] = useState(preferred), [estimates, setEstimates] = useState(true), [opened, setOpened] = useState<string | null>(null);
  const [hovered,setHovered]=useState<string|null>(null),[pinned,setPinned]=useState<string|null>(null);
  const plotRegion = useRef<HTMLDivElement>(null);
  const [customOpen, setCustomOpen] = useState(false), [customDraft, setCustomDraft] = useState(custom);
  let customValid = false;
  try { const length = calendarOrdinal(customDraft.to) - calendarOrdinal(customDraft.from) + 1; customValid = length > 0 && length <= 3661; } catch {}
  useEffect(() => {
    if (!pinned) return;
    const release = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-overview-range-controls]")) return;
      if (event.target instanceof Node && !plotRegion.current?.contains(event.target)) { setPinned(null); setHovered(null); }
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setPinned(null); setHovered(null); } };
    document.addEventListener("pointerdown", release);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", release); document.removeEventListener("keydown", escape); };
  }, [pinned]);
  const range = mode ?? rangeContaining(preferred, today, mobile ? "7" : "30");
  const available = estimates ? data.estimatedDays : data.days;
  const byDate = new Map(available.map(day => [day.date, day]));
  const earliest = available.map(day => day.date).filter(date => date <= today).sort()[0] ?? today;
  const from = range === "all" ? earliest : range === "custom" ? custom.from : addCalendarDays(today, 1 - Number(range)), to = range === "custom" ? custom.to : today;
  let dates: string[] = [];
  try { const length = calendarOrdinal(to) - calendarOrdinal(from) + 1; if (length > 0 && length <= 3661) dates = Array.from({ length }, (_, index) => addCalendarDays(from, index)); } catch {}
  const days = dates.map(date => byDate.get(date) ?? blankDay(date));
  const fallback = preferredRecordedDate(days, today, day => day.energyBalance !== null, day => data.recordDates.includes(day.date));
  if (pinned && !dates.includes(pinned)) { setPinned(null); setHovered(null); }
  const activePin=pinned && dates.includes(pinned)?pinned:null;
  const previewDate=activePin??hovered??inspected;
  const selected = dates.includes(previewDate) ? previewDate : dates.includes(fallback) ? fallback : to, day = days.find(day => day.date === selected), dialogDay = opened ? byDate.get(opened) ?? blankDay(opened) : null;
  return <section className={styles.trends} aria-label="热量与晨重趋势">
    <div className={styles.trendToolbar} data-overview-range-controls=""><div className={styles.trendTitle}><h2>摄入、消耗与次晨变化</h2><time>{from.replaceAll("-", ".")} — {to.replaceAll("-", ".")}</time></div><div className={styles.ranges}>{[["7", "7D"], ["30", "30D"], ["90", "90D"], ["all", "全部"], ["custom", "自定义"]].map(([key, label]) => <button key={key} aria-pressed={range === key} aria-expanded={key === "custom" ? customOpen : undefined} onClick={() => {
      setHovered(null);
      if (key === "custom") { setCustomDraft(custom); setCustomOpen(true); }
      else { setMode(key); setCustomOpen(false); }
    }}>{label}</button>)}</div><label className={styles.estimateToggle}><input type="checkbox" checked={estimates} onChange={event => setEstimates(event.target.checked)} aria-label="显示体重估计" />体重估计</label></div>
    {customOpen && <form data-overview-range-controls="" className={styles.customRange} aria-label="自定义日期范围" onSubmit={event => { event.preventDefault(); if (customValid) { setCustom(customDraft); setMode("custom"); setCustomOpen(false); } }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setCustomOpen(false); } }}>
      <label>开始<input autoFocus aria-label="总览开始日期" type="date" value={customDraft.from} onChange={event => setCustomDraft({ ...customDraft, from: event.target.value })} /></label>
      <label>结束<input aria-label="总览结束日期" type="date" value={customDraft.to} onChange={event => setCustomDraft({ ...customDraft, to: event.target.value })} /></label>
      <div><button type="submit" disabled={!customValid}>应用</button><button type="button" onClick={() => setCustomOpen(false)}>取消</button></div>
      {!customValid && <p role="status">请选择有效日期范围，最长 10 年。</p>}
    </form>}
    {!dates.length ? <p className={styles.caption}>请选择有效日期范围，最长 10 年。</p> : <>
      {day && <div className={styles.dayReadout} aria-live="polite" aria-atomic="true" aria-label="日期对照" data-selected-date={selected}>
        <div className={styles.readoutHeading}><time dateTime={selected}>{selected.replaceAll("-", ".")}</time><span className={styles.readoutFlags}>{[day.nutrition && day.mealDayStatus === "incomplete" ? "未记全" : day.nutrition && day.mealDayStatus === "unconfirmed" ? "待确认" : null, day.nutrition?.incomplete.caloriesKcal ? "部分" : null, day.energy.estimated ? "估计" : null].filter(Boolean).join(" · ")}</span><button onClick={() => setOpened(selected)}>查看记录 →</button></div>
        <div className={styles.mobileEnergy}>
          <span>摄入 <strong className={styles.intakeText}>{day.displayEnergy?.intake ?? "—"}</strong></span>
          <span>消耗 <strong className={styles.expenditureText}>{day.displayEnergy?.expenditure ?? "—"}</strong></span>
          <span>{day.energyBalance === null ? "收支" : day.energyBalance === 0 ? "平衡" : day.energyBalance > 0 ? "盈余" : "缺口"} <strong className={day.energyBalance !== null && day.energyBalance < 0 ? styles.deficitText : styles.surplusText}>{day.displayEnergy?.balance ?? "—"}</strong><small>kcal</small></span>
        </div><div className={styles.relations}>
          <div className={styles.energyEquation}>
            <div><span>摄入</span><strong className={styles.intakeText}>{day.displayEnergy?.intake ?? "—"}</strong><small>kcal{day.nutrition?.values.caloriesKcal == null ? " · 缺摄入" : day.mealDayStatus === "incomplete" ? " · 未记全" : day.mealDayStatus === "unconfirmed" ? " · 全天待确认" : day.nutrition.incomplete.caloriesKcal ? " · 营养部分未知" : ""}</small></div>
            <b aria-hidden="true">−</b>
            <div><span>消耗</span><strong className={styles.expenditureText}>{day.displayEnergy?.expenditure ?? "—"}</strong><small>kcal{day.energy.totalKcal === null ? " · 缺消耗" : day.energy.estimated ? " · 估计" : ""}</small></div>
            <b aria-hidden="true">=</b>
            <div className={day.energyBalance === null || day.energyBalance === 0 ? undefined : day.energyBalance > 0 ? styles.surplusText : styles.deficitText}><span>{day.energyBalance === null ? "热量收支" : day.energyBalance === 0 ? "收支平衡" : day.energyBalance < 0 ? "热量缺口" : "热量盈余"}</span><strong data-selected-balance={day.energyBalance ?? undefined}>{day.displayEnergy?.balance ?? "—"}</strong><small>kcal</small></div>
          </div>
          <div className={styles.weightEquation}>
            <div><span>{day.date.slice(5).replace("-", ".")} 晨重</span><WeightReading record={day.morning} /></div><b aria-hidden="true">→</b>
            <div><span>{day.nextDate.slice(5).replace("-", ".")} 晨重</span><WeightReading record={day.nextMorning} /></div>
            <div className={styles.weightDifference}><span>次晨变化</span><strong>{signed(day.weightChangeKg)}<small>kg</small></strong>{day.ambiguous ? <em>待选择</em> : day.differenceEstimated && day.weightChangeKg !== null && <em>含估计</em>}</div>
          </div>
        </div>
      </div>}<div ref={plotRegion} className={styles.plotRegion}><RelationshipPlot days={days} selected={selected} inspect={date=>{setInspected(date);setHovered(null);if(activePin)setPinned(date);}} preview={date=>{if(!activePin)setHovered(date);}} leave={()=>setHovered(null)} pin={date=>{setHovered(null);setInspected(date);if(!mobile)setPinned(date);}} unpin={()=>{setPinned(null);setHovered(null);}} pinned={!!activePin} /></div>
    </>}
    {dialogDay && <EditorDialog title={dialogDay.date+" · 当日记录"} close={()=>setOpened(null)} busy={false}><OverviewDayDetails day={dialogDay}/></EditorDialog>}
  </section>;
}
const mealTypeLabel=(name:string)=>({breakfast:"早餐",lunch:"午餐",dinner:"晚餐",snack:"加餐",supper:"夜宵"} as Record<string,string>)[name.toLowerCase()]??name;
function OverviewDayDetails({day}:{day:OverviewDay}){
 const mealRow=(meal:OverviewDay["meals"][number])=><Disclosure key={meal.id} className={styles.compactMeal} summary={<><span><strong>{mealTypeLabel(meal.mealType)}</strong><span>{meal.items.map(item=>item.name).join("、")}</span></span><b>{formatNutrition(meal.totals.values.caloriesKcal,"caloriesKcal")} <small>kcal</small></b></>}><NutritionTable items={meal.items} saved/><MealEvidence notes={meal.notes}/><ImageGallery ids={meal.imageIds}/><LoadingLink href={"/dashboard/meals?date="+day.date}>编辑这一日饮食 →</LoadingLink></Disclosure>;
 return <div className={styles.dayDetails}>
  <div className={styles.detailTop}>
   <section><h3>晨间体重</h3><div className={styles.detailReading}><WeightReading record={day.morning}/></div><p>次晨 {day.nextDate.slice(5)} · {day.nextMorning?Number(day.nextMorning.weightKg):"—"} kg <b>{signed(day.weightChangeKg)} kg</b>{day.differenceEstimated&&day.weightChangeKg!==null?" · 含估计":""}</p><LoadingLink href={"/dashboard/measurements?date="+day.date}>身体记录 →</LoadingLink></section>
   <section><h3>消耗</h3><div className={styles.detailReading}><strong>{energyValue(day.energy.totalKcal)}<small>kcal</small></strong></div><p>静息 {energyValue(day.energy.restingKcal)} · 活动 {energyValue(day.energy.activeKcal)} kcal</p><LoadingLink href={"/dashboard/energy?date="+day.date}>消耗记录 →</LoadingLink></section>
  </div>
  <section className={styles.detailNutrition}><h3>当日总摄入 <small>{day.meals.length} 餐</small></h3><div>{(["caloriesKcal","proteinG","carbsG","fatG"] as const).map((metric,i)=><span key={metric}><small>{["热量","蛋白质","碳水","脂肪"][i]}</small><strong>{formatNutrition(day.nutrition?.values[metric]??null,metric)}<small>{i?"g":"kcal"}</small></strong>{day.nutrition?.incomplete[metric]&&<small>已知部分</small>}</span>)}</div></section>
  <div>{day.meals.slice(0,3).map(mealRow)}{day.meals.length>3&&<Disclosure className={styles.moreMeals} summary={"还有 "+(day.meals.length-3)+" 餐"}>{day.meals.slice(3).map(mealRow)}</Disclosure>}{!day.meals.length&&<p>没有饮食记录。</p>}</div>
  <LoadingLink href={"/dashboard/meals?date="+day.date}>查看饮食记录 →</LoadingLink>
 </div>;
}
