"use client";
import { useEffect, useRef, useState } from "react";
import { dailyTotals, formatNutrition, metricLabels, type Metric } from "./model";
import styles from "./meals.module.css";

const colors: Record<Metric, string> = { proteinG: "#d2b05d", carbsG: "#ede6d9", fatG: "#c8796c", caloriesKcal: "#bea478" };
const macros: Metric[] = ["proteinG", "carbsG", "fatG"];
export function NutritionChart({ dates, groups, mode, select }: { dates: string[]; groups: ReturnType<typeof dailyTotals>; mode: "macros" | "calories"; select: (date: string) => void }) {
  const viewport = useRef<HTMLDivElement>(null), [containerWidth, setContainerWidth] = useState(0);
  const byDate = new Map(groups.map(group => [group.date, group.totals]));
  const [inspected, setInspected] = useState(() => dates.findLast(date => byDate.has(date)) ?? dates.at(-1)!);
  const totals = byDate.get(inspected), shown = mode === "macros" ? macros : ["caloriesKcal" as const], unit = mode === "macros" ? "g" : "kcal";
  useEffect(() => {
    const node = viewport.current!, observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  const width = containerWidth || 280, left = 42, right = 10, slot = (width - left - right) / dates.length;
  const sum = (date: string) => shown.reduce((total, metric) => total + Number(byDate.get(date)?.values[metric] ?? 0), 0);
  const max = Math.max(1, ...dates.map(sum)) * 1.16, y = (value: number) => 184 - value / max * 150;
  const allDates = dates.length <= 7, selectedX = left + (dates.indexOf(inspected) + .5) * slot;
  return <>
    <div className={styles.chartRange}><time>{dates[0].replaceAll("-", ".")}</time><span>—</span><time>{dates.at(-1)!.replaceAll("-", ".")}</time></div>
    <div className={styles.chartReadout} aria-live="polite" aria-atomic="true" data-chart-readout={inspected}>
      <div><time dateTime={inspected}>{inspected.replaceAll("-", ".")}</time><strong>{formatNutrition(totals?.values.caloriesKcal ?? null, "caloriesKcal")}<small>kcal</small></strong><span>{!totals ? "未记录" : totals.incomplete.caloriesKcal ? "已知合计 · 不完整" : "总热量"}</span></div>
      <div className={styles.chartMacros}>{macros.map(metric => <span key={metric}><i style={{ background: colors[metric] }} />{metricLabels[metric]}<strong>{formatNutrition(totals?.values[metric] ?? null, metric)}<small>g</small></strong>{totals?.incomplete[metric] && <small>部分</small>}</span>)}</div>
    </div>
    <div className={styles.barViewport} ref={viewport}>
      <svg className={styles.chart} style={{ visibility: containerWidth ? undefined : "hidden" }} viewBox={`0 0 ${width} 224`} role="group" aria-label={`${mode === "macros" ? "三大营养素堆叠" : "热量"}柱状图，单位${unit}`}>
        {[0, 1, 2, 3].map(i => <g key={i}><line className={styles.grid} x1={left} x2={width - right} y1={y(max * i / 3)} y2={y(max * i / 3)} /><text className={styles.axis} x={left - 8} y={y(max * i / 3) + 4} textAnchor="end">{Math.round(max * i / 3)}</text></g>)}
        <text className={styles.axis} x={left - 8} y="18" textAnchor="end">{unit}</text>
        {dates.map((date, index) => {
          const daily = byDate.get(date), x = left + index * slot, barWidth = Math.min(30, slot * .68), energy = daily?.values.caloriesKcal;
          const label = `${date} · ${daily ? ["caloriesKcal" as const, ...macros].map(metric => `${metricLabels[metric]} ${formatNutrition(daily.values[metric], metric)} ${metric === "caloriesKcal" ? "kcal" : "g"}${daily.incomplete[metric] ? "（已知合计，不完整）" : ""}`).join(" · ") : "未记录"}`;
          const valueLabel = formatNutrition(energy ?? null, "caloriesKcal");
          return <g key={date} role="button" tabIndex={date === inspected ? 0 : -1} data-bar-date={date} data-selected={date === inspected} aria-label={label} onMouseEnter={() => setInspected(date)} onFocus={() => setInspected(date)} onClick={() => select(date)} onKeyDown={event => {
            if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(date); }
            const next = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? dates.length - 1 : null;
            if (next !== null) { event.preventDefault(); (event.currentTarget.parentElement?.querySelectorAll<SVGGElement>("[data-bar-date]")[Math.max(0, Math.min(dates.length - 1, next))])?.focus(); }
          }}>
            <title>{label}</title><rect className={styles.barHit} x={x} y="25" width={slot} height="164" />
            {shown.map((metric, j) => { const value = daily?.values[metric], below = shown.slice(0, j).reduce((total, key) => total + Number(daily?.values[key] ?? 0), 0); return value == null || Number(value) === 0 ? null : <rect key={metric} data-metric={metric} data-incomplete={Boolean(daily?.incomplete[metric])} x={x + (slot - barWidth) / 2} y={y(below + Number(value))} width={barWidth} height={y(below) - y(below + Number(value))} fill={colors[metric]} className={styles.bar} />; })}
            {mode === "calories" && allDates && energy != null && slot >= valueLabel.length * 6.5 + 6 && <text className={styles.barValue} x={x + slot / 2} y={y(Number(energy)) - 7} textAnchor="middle">{valueLabel}{daily?.incomplete.caloriesKcal ? "*" : ""}</text>}
            {allDates && <text className={styles.axis} data-date-tick x={x + slot / 2} y="215" textAnchor="middle">{slot >= 46 ? date.slice(5) : date.slice(8)}</text>}
          </g>;
        })}
        <path className={styles.selectedDay} d={`M ${selectedX} 188 v 6`} />
        {!allDates && <text className={styles.axis} data-date-tick x={Math.max(left + 20, Math.min(width - right - 20, selectedX))} y="215" textAnchor="middle">{inspected.slice(5)}</text>}
      </svg>
    </div>
  </>;
}
