"use client";
import { useEffect, useRef, useState } from "react";
import { LoadingLink } from "@/components/loading-link";
import { useChartMotion } from "@/components/use-chart-motion";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { dailyTotals, formatNutrition, type MealView } from "../meals/model";
import { EditorDialog } from "../meals/meals-view";
import { NutritionTable, MealEvidence } from "../meals/review-details";
import { ImageGallery } from "../meals/photos";
import { EnergyBasis } from "../activities/energy-view";
import { emptyEnergy, energyValue, type EnergySnapshot } from "../activities/model";
import { overviewDays, overviewScale, type OverviewDay } from "./model";
import styles from "./overview.module.css";
const signed = (value: number | null, precision = 2) => value === null ? "—" : `${value > 0 ? "+" : ""}${Number(value.toFixed(precision))}`;
function WeightReading({ record }: { record: MeasurementDisplay | null }) {
  return <><strong>{record ? Number(record.weightKg) : "—"}<small>kg</small></strong>{record?.recordKind === "estimated" && <em>估计</em>}</>;
}
export function OverviewTrend({ meals, records, today, energy = emptyEnergy() }: { meals: MealView[]; records: MeasurementDisplay[]; today: string; energy?: EnergySnapshot }) {
  const [mode, setMode] = useState("30"), [custom, setCustom] = useState({ from: addCalendarDays(today, -29), to: today }), [inspected, setInspected] = useState(today), [estimates, setEstimates] = useState(true), [opened, setOpened] = useState<string | null>(null);
  const earliest = [today, ...dailyTotals(meals).map(day => day.date), ...records.map(record => record.recordDate), ...energy.days.filter(day => !day.deletedAt).map(day => day.date), ...energy.activities.filter(activity => !activity.deletedAt).map(activity => activity.date)].filter(date => date <= today).sort()[0];
  const from = mode === "all" ? earliest : mode === "custom" ? custom.from : addCalendarDays(today, 1 - Number(mode)), to = mode === "custom" ? custom.to : today;
  let dates: string[] = [];
  try { const length = calendarOrdinal(to) - calendarOrdinal(from) + 1; if (length > 0 && length <= 3661) dates = Array.from({ length }, (_, index) => addCalendarDays(from, index)); } catch {}
  const selected = dates.includes(inspected) ? inspected : to, days = overviewDays(meals, records, dates, estimates, energy, today), day = days.find(day => day.date === selected), dialogDay = overviewDays(meals, records, opened ? [opened] : [], estimates, energy, today)[0];
  return <section className={styles.trends} aria-label="热量与晨重趋势">
    <div className={styles.trendToolbar}><div className={styles.trendTitle}><h2>热量与体重</h2><time>{from.replaceAll("-", ".")} — {to.replaceAll("-", ".")}</time></div><div className={styles.ranges}>{[["7", "7D"], ["30", "30D"], ["90", "90D"], ["all", "全部"], ["custom", "自定义"]].map(([key, label]) => <button key={key} aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</button>)}</div><label className={styles.estimateToggle}><input type="checkbox" checked={estimates} onChange={event => setEstimates(event.target.checked)} />显示体重估计</label></div>
    {mode === "custom" && <div className={styles.customRange}><label>开始<input aria-label="总览开始日期" type="date" value={custom.from} onChange={event => setCustom({ ...custom, from: event.target.value })} /></label><label>结束<input aria-label="总览结束日期" type="date" value={custom.to} onChange={event => setCustom({ ...custom, to: event.target.value })} /></label></div>}
    <div className={styles.legend}><span><i style={{ background: "#6C96B3", opacity: .45 }} />摄入 · kcal</span><span><i style={{ background: "#C07B77", opacity: .45 }} />消耗 · kcal</span><span><i style={{ background: "#BEA478" }} />盈余 · kcal</span><span><i style={{ background: "#EEE5D5", height: 2 }} />次晨变化 · kg</span></div>
    {!dates.length ? <p className={styles.caption}>请选择有效日期范围，最长 10 年。</p> : <>
      <div className={styles.dayReadout} aria-live="polite" aria-atomic="true" aria-label="日期对照" data-selected-date={selected}><time className={styles.readoutDate} dateTime={selected}>{selected.replaceAll("-", ".")}</time>
        <div><span>摄入</span><strong>{formatNutrition(day?.nutrition?.values.caloriesKcal ?? null, "caloriesKcal")}<small>kcal</small></strong>{day?.nutrition?.incomplete.caloriesKcal && <em>部分</em>}</div>
        <div><span>消耗</span><strong>{energyValue(day?.energy.totalKcal)}<small>kcal</small></strong>{day?.energy.estimated && <em>估计</em>}</div>
        <div><span>盈余</span><strong>{signed(day?.energyBalance ?? null, 0)}<small>kcal</small></strong></div>
        <div><span>次晨变化</span><strong>{signed(day?.weightChangeKg ?? null)}<small>kg</small></strong>{day?.ambiguous ? <em>待选择</em> : day?.differenceEstimated && day.weightChangeKg !== null && <em>含估计</em>}</div>
      </div><CombinedPlot days={days} selected={selected} inspect={setInspected} open={date => { setInspected(date); setOpened(date); }} />
    </>}
    {dialogDay && <EditorDialog title={`${dialogDay.date} · 当日记录`} close={() => setOpened(null)} busy={false}><div className={styles.dayDetails}>
      <h3>晨间体重</h3><p>{dialogDay.date} <WeightReading record={dialogDay.morning} /></p><p>{dialogDay.nextDate} <WeightReading record={dialogDay.nextMorning} /></p><p>次晨变化 {signed(dialogDay.weightChangeKg)} kg{dialogDay.differenceEstimated && dialogDay.weightChangeKg !== null ? " · 含估计" : ""}</p><LoadingLink href={`/dashboard/measurements?date=${dialogDay.date}`}>查看身体记录 →</LoadingLink>
      <h3>消耗</h3><p>总消耗 {energyValue(dialogDay.energy.totalKcal)} kcal</p><p>静息 {energyValue(dialogDay.energy.restingKcal)} · 活动 {energyValue(dialogDay.energy.activeKcal)} kcal</p><EnergyBasis day={dialogDay.energy} /><LoadingLink href={`/dashboard/energy?date=${dialogDay.date}`}>查看消耗记录 →</LoadingLink>
      <h3>饮食 · {dialogDay.meals.length} 餐</h3>{dialogDay.meals.map(meal => <article key={meal.id}><h4>{meal.mealType}<span>{formatNutrition(meal.totals.values.caloriesKcal, "caloriesKcal")} kcal</span></h4><NutritionTable items={meal.items} saved /><MealEvidence notes={meal.notes} /><ImageGallery ids={meal.imageIds} /></article>)}{!dialogDay.meals.length && <p>没有饮食记录。</p>}<LoadingLink href={`/dashboard/meals?date=${dialogDay.date}`}>查看饮食记录 →</LoadingLink>
    </div></EditorDialog>}
  </section>;
}
function CombinedPlot({ days, selected, inspect, open }: { days: OverviewDay[]; selected: string; inspect: (date: string) => void; open: (date: string) => void }) {
  const container = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(container.current!); return () => observer.disconnect(); }, []);
  useChartMotion(container, width ? days.map(day => `${day.date}:${day.nutrition?.values.caloriesKcal}:${day.energy.totalKcal}:${day.energyBalance}:${day.weightChangeKg}:${day.differenceEstimated}`).join("|") : "pending");
  const w = width || 280, left = 48, right = 44, top = 24, bottom = 276, scale = overviewScale(days), zero = top + (bottom - top) * scale.positiveRatio;
  const kcalY = (value: number) => zero - value / scale.kcalHigh * (zero - top), kgY = (value: number) => zero - value / scale.kgHigh * (zero - top);
  const slot = (w - left - right) / days.length, x = (index: number) => left + (index + .5) * slot, groupWidth = Math.min(42, slot * .8), gap = groupWidth * .035, barWidth = (groupWidth - 2 * gap) / 3;
  return <div ref={container} className={styles.plot}><svg viewBox={`0 0 ${w} 312`} style={{ visibility: width ? undefined : "hidden" }} role="group" aria-label="摄入、消耗、盈余与次晨体重变化">
    <text x={left - 8} y="13" textAnchor="end" className={styles.axis}>kcal</text><text x={w - right + 8} y="13" className={styles.axis}>kg</text>
    {[0, 1, 2, 3, 4].map(index => { const y = top + index * (bottom - top) / 4; return <g key={index}><line x1={left} x2={w - right} y1={y} y2={y} className={styles.grid} />{Math.abs(y - zero) > 12 && <><text x={left - 8} y={y + 4} textAnchor="end" className={styles.axis}>{Math.round((zero - y) / (zero - top) * scale.kcalHigh)}</text><text x={w - right + 8} y={y + 4} className={styles.axis}>{Number(((zero - y) / (zero - top) * scale.kgHigh).toFixed(2))}</text></>}</g>; })}
    <line data-overview-zero x1={left} x2={w - right} y1={zero} y2={zero} className={styles.zeroLine} /><text x={left - 8} y={zero + 4} textAnchor="end" className={styles.axis}>0</text><text x={w - right + 8} y={zero + 4} className={styles.axis}>0</text>
    {days.map((day, index) => { const values = [day.nutrition?.values.caloriesKcal ?? null, day.energy.totalKcal, day.energyBalance], previous = days[index - 1]; return <g key={day.date} role="button" tabIndex={day.date === selected ? 0 : -1} data-overview-date={day.date} aria-label={`${day.date} · 摄入 ${values[0] ?? "未记录"} kcal · 消耗 ${values[1] ?? "未记录"} kcal · 盈余 ${signed(day.energyBalance, 0)} kcal · 次晨变化 ${signed(day.weightChangeKg)} kg`} onMouseEnter={() => inspect(day.date)} onFocus={() => inspect(day.date)} onClick={() => open(day.date)} onKeyDown={event => {
      if (["Enter", " "].includes(event.key)) { event.preventDefault(); open(day.date); }
      const next = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
      if (next !== null) { event.preventDefault(); event.currentTarget.parentElement?.querySelectorAll<SVGGElement>("[data-overview-date]")[Math.max(0, Math.min(days.length - 1, next))]?.focus(); }
    }}><rect x={left + index * slot} y={top} width={slot} height={bottom - top} className={styles.plotHit} />
      {values.map((value, series) => value !== null && <rect key={series} data-chart-bar data-chart-zero={zero} data-series={["intake", "expenditure", "balance"][series]} data-overview-value={value} data-estimated={series !== 0 && day.energy.estimated} x={x(index) - groupWidth / 2 + series * (barWidth + gap)} y={Math.min(zero, kcalY(Number(value)))} width={barWidth} height={Math.max(Number(value) === 0 ? 0 : 1, Math.abs(kcalY(Number(value)) - zero))} fill={["#6C96B3", "#C07B77", "#BEA478"][series]} opacity={series === 2 ? 1 : .38} className={styles.plotData} />)}
      {day.weightChangeKg !== null && <g data-chart-line className={styles.plotData}>{previous?.weightChangeKg !== null && previous?.weightChangeKg !== undefined && <line x1={x(index - 1)} x2={x(index)} y1={kgY(previous.weightChangeKg)} y2={kgY(day.weightChangeKg)} stroke="#EEE5D5" strokeWidth="1.6" strokeDasharray={day.differenceEstimated || previous.differenceEstimated ? "4 4" : undefined} />}<circle data-series="weight-change" data-overview-value={day.weightChangeKg} data-estimated={day.differenceEstimated} cx={x(index)} cy={kgY(day.weightChangeKg)} r={days.length > 90 ? 1.4 : 2.5} fill={day.differenceEstimated ? "#151513" : "#EEE5D5"} stroke="#EEE5D5" /></g>}
      {days.length <= 7 && <text x={x(index)} y="299" textAnchor="middle" className={styles.axis}>{slot >= 46 ? day.date.slice(5) : day.date.slice(8)}</text>}
    </g>; })}
    <line data-crosshair-date={selected} x1={x(days.findIndex(day => day.date === selected))} x2={x(days.findIndex(day => day.date === selected))} y1={top} y2={bottom + 7} className={styles.crosshair} />{days.length > 7 && <text x={Math.max(left + 20, Math.min(w - right - 20, x(days.findIndex(day => day.date === selected))))} y="299" textAnchor="middle" className={styles.axis}>{selected.slice(5)}</text>}
  </svg></div>;
}
