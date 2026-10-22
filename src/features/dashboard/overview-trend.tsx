"use client";
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
import { EnergySources } from "../activities/energy-view";
import { blankEnergyDay, energyValue } from "../activities/model";
import type { OverviewDay } from "./model";
import styles from "./overview.module.css";
const signed = (value: number | null, precision = 2) => value === null ? "—" : `${value > 0 ? "+" : ""}${Number(value.toFixed(precision))}`;
function WeightReading({ record }: { record: MeasurementDisplay | null }) {
  return <><strong>{record ? Number(record.weightKg) : "—"}<small>kg</small></strong>{record?.recordKind === "estimated" && <em>估计</em>}</>;
}
const blankDay = (date: string): OverviewDay => ({ date, nextDate: addCalendarDays(date, 1), meals: [], nutrition: null, morning: null, nextMorning: null, weightChangeKg: null, differenceEstimated: false, ambiguous: false, energy: blankEnergyDay(date), energyBalance: null });
export function OverviewTrend({ data }: { data: OverviewPresentation }) {
  const today = data.today, mobile = useMobileMode();
  const [mode, setMode] = useState<string | null>(null), [custom, setCustom] = useState({ from: addCalendarDays(today, -29), to: today }), [inspected, setInspected] = useState(today), [estimates, setEstimates] = useState(true), [opened, setOpened] = useState<string | null>(null);
  const range = mode ?? (mobile ? "7" : "30");
  const available = estimates ? data.estimatedDays : data.days;
  const byDate = new Map(available.map(day => [day.date, day]));
  const earliest = available.map(day => day.date).filter(date => date <= today).sort()[0] ?? today;
  const from = range === "all" ? earliest : range === "custom" ? custom.from : addCalendarDays(today, 1 - Number(range)), to = range === "custom" ? custom.to : today;
  let dates: string[] = [];
  try { const length = calendarOrdinal(to) - calendarOrdinal(from) + 1; if (length > 0 && length <= 3661) dates = Array.from({ length }, (_, index) => addCalendarDays(from, index)); } catch {}
  const selected = dates.includes(inspected) ? inspected : to, days = dates.map(date => byDate.get(date) ?? blankDay(date)), day = days.find(day => day.date === selected), dialogDay = opened ? byDate.get(opened) ?? blankDay(opened) : null;
  return <section className={styles.trends} aria-label="热量与晨重趋势">
    <div className={styles.trendToolbar}><div className={styles.trendTitle}><h2>摄入、消耗与次晨变化</h2><time>{from.replaceAll("-", ".")} — {to.replaceAll("-", ".")}</time></div><div className={styles.ranges}>{[["7", "7D"], ["30", "30D"], ["90", "90D"], ["all", "全部"], ["custom", "自定义"]].map(([key, label]) => <button key={key} aria-pressed={range === key} onClick={() => setMode(key)}>{label}</button>)}</div><label className={styles.estimateToggle}><input type="checkbox" checked={estimates} onChange={event => setEstimates(event.target.checked)} />显示体重估计</label></div>
    {range === "custom" && <div className={styles.customRange}><label>开始<input aria-label="总览开始日期" type="date" value={custom.from} onChange={event => setCustom({ ...custom, from: event.target.value })} /></label><label>结束<input aria-label="总览结束日期" type="date" value={custom.to} onChange={event => setCustom({ ...custom, to: event.target.value })} /></label></div>}
    {!dates.length ? <p className={styles.caption}>请选择有效日期范围，最长 10 年。</p> : <>
      {day && <div className={styles.dayReadout} aria-live="polite" aria-atomic="true" aria-label="日期对照" data-selected-date={selected}>
        <div className={styles.readoutHeading}><time dateTime={selected}>{selected.replaceAll("-", ".")}</time><button onClick={() => setOpened(selected)}>查看记录 →</button></div>
        <div className={styles.relations}>
          <div className={styles.energyEquation}>
            <div><span>摄入</span><strong className={styles.intakeText}>{formatNutrition(day.nutrition?.values.caloriesKcal ?? null, "caloriesKcal")}</strong><small>kcal{day.nutrition?.values.caloriesKcal == null ? " · 缺摄入" : day.nutrition.incomplete.caloriesKcal ? " · 部分" : ""}</small></div>
            <b aria-hidden="true">−</b>
            <div><span>消耗</span><strong className={styles.expenditureText}>{energyValue(day.energy.totalKcal)}</strong><small>kcal{day.energy.totalKcal === null ? " · 缺消耗" : day.energy.estimated ? " · 估计" : ""}</small></div>
            <b aria-hidden="true">=</b>
            <div className={day.energyBalance === null || day.energyBalance === 0 ? undefined : day.energyBalance > 0 ? styles.surplusText : styles.deficitText}><span>{day.energyBalance === 0 ? "收支平衡" : day.energyBalance !== null && day.energyBalance < 0 ? "热量缺口" : "热量盈余"}</span><strong data-selected-balance={day.energyBalance ?? undefined}>{signed(day.energyBalance, 0)}</strong><small>kcal</small></div>
          </div>
          <div className={styles.weightEquation}>
            <div><span>{day.date.slice(5).replace("-", ".")} 晨重</span><WeightReading record={day.morning} /></div><b aria-hidden="true">→</b>
            <div><span>{day.nextDate.slice(5).replace("-", ".")} 晨重</span><WeightReading record={day.nextMorning} /></div>
            <div className={styles.weightDifference}><span>次晨变化</span><strong>{signed(day.weightChangeKg)}<small>kg</small></strong>{day.ambiguous ? <em>待选择</em> : day.differenceEstimated && day.weightChangeKg !== null && <em>含估计</em>}</div>
          </div>
        </div>
      </div>}<RelationshipPlot days={days} selected={selected} inspect={setInspected} open={date => { setInspected(date); setOpened(date); }} />
    </>}
    {dialogDay && <EditorDialog title={`${dialogDay.date} · 当日记录`} close={() => setOpened(null)} busy={false}><div className={styles.dayDetails}>
      <h3>晨间体重</h3><p>{dialogDay.date} <WeightReading record={dialogDay.morning} /></p><p>{dialogDay.nextDate} <WeightReading record={dialogDay.nextMorning} /></p><p>次晨变化 {signed(dialogDay.weightChangeKg)} kg{dialogDay.differenceEstimated && dialogDay.weightChangeKg !== null ? " · 含估计" : ""}</p><LoadingLink href={`/dashboard/measurements?date=${dialogDay.date}`}>查看身体记录 →</LoadingLink>
      <h3>消耗</h3><p>总消耗 {energyValue(dialogDay.energy.totalKcal)} kcal</p><p>静息 {energyValue(dialogDay.energy.restingKcal)} · 活动 {energyValue(dialogDay.energy.activeKcal)} kcal</p><EnergySources day={dialogDay.energy} /><LoadingLink href={`/dashboard/energy?date=${dialogDay.date}`}>查看消耗记录 →</LoadingLink>
      <h3>饮食 · {dialogDay.meals.length} 餐</h3>{dialogDay.meals.map(meal => <article key={meal.id}><h4>{meal.mealType}<span>{formatNutrition(meal.totals.values.caloriesKcal, "caloriesKcal")} kcal</span></h4><NutritionTable items={meal.items} saved /><MealEvidence notes={meal.notes} /><ImageGallery ids={meal.imageIds} /></article>)}{!dialogDay.meals.length && <p>没有饮食记录。</p>}<LoadingLink href={`/dashboard/meals?date=${dialogDay.date}`}>查看饮食记录 →</LoadingLink>
    </div></EditorDialog>}
  </section>;
}