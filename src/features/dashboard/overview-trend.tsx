"use client";
import { useEffect, useRef, useState } from "react";
import { LoadingLink } from "@/components/loading-link";
import { useChartMotion } from "@/components/use-chart-motion";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { chartScale } from "@/components/chart-scale";
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
      <div className={styles.dayReadout} aria-live="polite" aria-atomic="true" aria-label="日期对照" data-selected-date={selected}><time className={styles.readoutDate} dateTime={selected}>{selected.replaceAll("-", ".")}</time>
        <div><span>摄入</span><strong>{formatNutrition(day?.nutrition?.values.caloriesKcal ?? null, "caloriesKcal")}<small>kcal</small></strong>{day?.nutrition?.incomplete.caloriesKcal && <em>部分</em>}</div>
        <div><span>消耗</span><strong>{energyValue(day?.energy.totalKcal)}<small>kcal</small></strong>{day?.energy.estimated && <em>估计</em>}</div>
        <div><span>盈余</span><strong>{signed(day?.energyBalance ?? null, 0)}<small>kcal</small></strong></div>
        <div><span>次晨变化</span><strong>{signed(day?.weightChangeKg ?? null)}<small>kg</small></strong>{day?.ambiguous ? <em>待选择</em> : day?.differenceEstimated && day.weightChangeKg !== null && <em>含估计</em>}</div>
      </div><ComparisonPlots days={days} selected={selected} inspect={setInspected} open={date => { setInspected(date); setOpened(date); }} />
    </>}
    {dialogDay && <EditorDialog title={`${dialogDay.date} · 当日记录`} close={() => setOpened(null)} busy={false}><div className={styles.dayDetails}>
      <h3>晨间体重</h3><p>{dialogDay.date} <WeightReading record={dialogDay.morning} /></p><p>{dialogDay.nextDate} <WeightReading record={dialogDay.nextMorning} /></p><p>次晨变化 {signed(dialogDay.weightChangeKg)} kg{dialogDay.differenceEstimated && dialogDay.weightChangeKg !== null ? " · 含估计" : ""}</p><LoadingLink href={`/dashboard/measurements?date=${dialogDay.date}`}>查看身体记录 →</LoadingLink>
      <h3>消耗</h3><p>总消耗 {energyValue(dialogDay.energy.totalKcal)} kcal</p><p>静息 {energyValue(dialogDay.energy.restingKcal)} · 活动 {energyValue(dialogDay.energy.activeKcal)} kcal</p><EnergySources day={dialogDay.energy} /><LoadingLink href={`/dashboard/energy?date=${dialogDay.date}`}>查看消耗记录 →</LoadingLink>
      <h3>饮食 · {dialogDay.meals.length} 餐</h3>{dialogDay.meals.map(meal => <article key={meal.id}><h4>{meal.mealType}<span>{formatNutrition(meal.totals.values.caloriesKcal, "caloriesKcal")} kcal</span></h4><NutritionTable items={meal.items} saved /><MealEvidence notes={meal.notes} /><ImageGallery ids={meal.imageIds} /></article>)}{!dialogDay.meals.length && <p>没有饮食记录。</p>}<LoadingLink href={`/dashboard/meals?date=${dialogDay.date}`}>查看饮食记录 →</LoadingLink>
    </div></EditorDialog>}
  </section>;
}
function ComparisonPlots({ days, selected, inspect, open }: { days: OverviewDay[]; selected: string; inspect: (date: string) => void; open: (date: string) => void }) {
  return <div role="group" aria-label="摄入、消耗、盈余与次晨体重变化" className={styles.comparisonPlots}>
    {(["energy", "balance", "weight"] as const).map(kind => <ComparisonPlot key={kind} kind={kind} days={days} selected={selected} inspect={inspect} open={open} />)}
  </div>;
}
function ComparisonPlot({ kind, days, selected, inspect, open }: { kind: "energy" | "balance" | "weight"; days: OverviewDay[]; selected: string; inspect: (date: string) => void; open: (date: string) => void }) {
  const container = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(container.current!); return () => observer.disconnect(); }, []);
  useChartMotion(container, width ? days.map(day => `${day.date}:${day.nutrition?.values.caloriesKcal}:${day.energy.totalKcal}:${day.energyBalance}:${day.weightChangeKg}:${day.differenceEstimated}`).join("|") : "pending");
  const w = width || 280, left = 56, right = 12, top = 24, bottom = kind === "energy" ? 196 : 130, height = bottom + (kind === "weight" ? 30 : 12);
  const values = days.flatMap<string | number | null | undefined>(day => kind === "energy" ? [day.nutrition?.values.caloriesKcal, day.energy.totalKcal] : [kind === "balance" ? day.energyBalance : day.weightChangeKg]);
  const scale = chartScale(values, kind === "weight" ? "kg" : "kcal"), y = (value: number) => bottom - (value - scale.min) / (scale.max - scale.min) * (bottom - top), zero = y(0);
  const slot = (w - left - right) / days.length, x = (index: number) => left + (index + .5) * slot;
  const groupWidth = Math.min(kind === "energy" ? 40 : 28, slot * .72), gap = groupWidth * .08, barWidth = kind === "energy" ? (groupWidth - gap) / 2 : groupWidth;
  const title = kind === "energy" ? "摄入与消耗" : kind === "balance" ? "热量盈余" : "次晨体重变化";
  const tickStride = Math.max(1, Math.ceil((days.length - 1) / (w < 440 ? 3 : 6)));
  const selectedIndex = Math.max(0, days.findIndex(day => day.date === selected));
  return <div ref={container} className={styles.plotPanel} data-overview-panel={kind}><div className={styles.panelHeading}><h3>{title}</h3>{kind === "energy" ? <div className={styles.legend}><span><i style={{ background: "#92B9D6" }} />摄入</span><span><i style={{ background: "#D89490" }} />消耗</span></div> : kind === "weight" ? <time>{selected.slice(5)} → {addCalendarDays(selected, 1).slice(5)}</time> : null}</div>
    <div className={styles.plot}><svg viewBox={`0 0 ${w} ${height}`} style={{ visibility: width ? undefined : "hidden" }} role="group" aria-label={title}>
      <text x={left - 8} y="13" textAnchor="end" className={styles.axis}>{kind === "weight" ? "kg" : "kcal"}</text>
      <rect x={left + selectedIndex * slot} y={top} width={slot} height={bottom - top} fill="rgba(240,233,221,.035)" />
      {scale.ticks.map(tick => <g key={tick}><line data-overview-zero={tick === 0 ? "" : undefined} x1={left} x2={w - right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? styles.zeroLine : styles.grid} /><text x={left - 8} y={y(tick) + 4} textAnchor="end" className={styles.axis}>{tick === 0 ? "0" : `${kind !== "energy" && tick > 0 ? "+" : ""}${tick}`}</text></g>)}
      {days.map((day, index) => { const previous = days[index - 1], bars = kind === "energy" ? [day.nutrition?.values.caloriesKcal ?? null, day.energy.totalKcal] : [day.energyBalance]; return <g key={day.date} role="button" tabIndex={day.date === selected ? 0 : -1} data-overview-date={day.date} aria-label={`${day.date} · ${title} · 摄入 ${day.nutrition?.values.caloriesKcal ?? "未记录"} kcal · 消耗 ${day.energy.totalKcal ?? "未记录"} kcal · 盈余 ${signed(day.energyBalance, 0)} kcal · 次晨变化 ${signed(day.weightChangeKg)} kg`} onMouseEnter={() => inspect(day.date)} onFocus={() => inspect(day.date)} onClick={() => open(day.date)} onKeyDown={event => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); open(day.date); }
        const next = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
        if (next !== null) { event.preventDefault(); event.currentTarget.parentElement?.querySelectorAll<SVGGElement>("[data-overview-date]")[Math.max(0, Math.min(days.length - 1, next))]?.focus(); }
      }}><rect x={left + index * slot} y={top} width={slot} height={bottom - top} className={styles.plotHit} />
        {kind !== "weight" && bars.map((value, series) => value !== null && <rect key={series} data-chart-bar data-chart-zero={zero} data-series={kind === "balance" ? "balance" : ["intake", "expenditure"][series]} data-overview-value={value} data-estimated={kind === "balance" || series === 1 ? day.energy.estimated : undefined} x={x(index) - groupWidth / 2 + (kind === "energy" ? series * (barWidth + gap) : 0)} y={Math.min(zero, y(Number(value)))} width={barWidth} height={Math.max(Number(value) === 0 ? 0 : 1, Math.abs(y(Number(value)) - zero))} fill={kind === "balance" ? "#D9B865" : ["#92B9D6", "#D89490"][series]} className={styles.plotData} />)}
        {kind === "weight" && day.weightChangeKg !== null && <g data-chart-line className={styles.plotData}>{previous?.weightChangeKg != null && <line x1={x(index - 1)} x2={x(index)} y1={y(previous.weightChangeKg)} y2={y(day.weightChangeKg)} stroke="#EEE5D5" strokeWidth="1.8" strokeDasharray={day.differenceEstimated || previous.differenceEstimated ? "4 4" : undefined} />}<circle data-series="weight-change" data-overview-value={day.weightChangeKg} data-estimated={day.differenceEstimated} cx={x(index)} cy={y(day.weightChangeKg)} r={days.length > 90 ? 1.4 : 2.8} fill={day.differenceEstimated ? "#151513" : "#EEE5D5"} stroke="#EEE5D5" /></g>}
        {kind === "weight" && (index % tickStride === 0 && days.length - 1 - index >= tickStride / 2 || index === days.length - 1) && <text x={x(index)} y={height - 8} textAnchor="middle" className={styles.axis}>{w < 440 && days.length <= 7 ? day.date.slice(8) : day.date.slice(5)}</text>}
      </g>; })}
      <line data-crosshair-date={selected} x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={bottom} className={styles.crosshair} />
    </svg></div>
  </div>;
}
