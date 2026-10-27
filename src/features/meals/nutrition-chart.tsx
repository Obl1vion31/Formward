"use client";
import { useEffect, useId, useRef, useState } from "react";
import { dailyTotals, macroColors, macroDistribution, formatNutrition, metricLabels, type Metric, type MacroMode } from "./model";
import {useChartDrag} from "@/components/use-chart-drag";
import { useChartMotion } from "@/components/use-chart-motion";
import type { useChartDateSelection } from "@/components/use-chart-date-selection";
import { chartScale } from "@/components/chart-scale";
import styles from "./meals.module.css";

const calorieColor = "#7F9EAF";
const macros: Metric[] = ["proteinG", "carbsG", "fatG"];
export function NutritionChart({ dates, groups, selection, mode }: { dates: string[]; groups: ReturnType<typeof dailyTotals>; selection:ReturnType<typeof useChartDateSelection>; mode: MacroMode }) {
  const viewport = useRef<HTMLDivElement>(null), [containerWidth, setContainerWidth] = useState(0);
  const patternId = useId().replaceAll(":", "");
  const byDate = new Map(groups.map(group => [group.date, group.totals]));
  const statusByDate = new Map(groups.map(group => [group.date, group.day.status]));
  const inspected=selection.selected,unit="kcal";
  useEffect(() => {
    const node = viewport.current!, observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  useChartMotion(viewport, containerWidth ? `${dates[0]}:${dates.at(-1)}:${mode}:${groups.map(group => `${group.date}:${JSON.stringify(group.totals)}`).join("|")}` : "pending");
  const width = containerWidth || 280, left = 54, right = 10, slot = (width - left - right) / dates.length;
  const scale = chartScale(dates.map(date => byDate.get(date)?.values.caloriesKcal)), max = scale.max, y = (value: number) => 154 - value / max * 120;
  const drag=useChartDrag(dates,width,left,right,selection.pin);
  const allDates = dates.length <= 7, selectedX = left + (dates.indexOf(inspected) + .5) * slot;
  const stride = Math.max(1, Math.ceil((dates.length - 1) / (width < 440 ? 3 : 6)));
  return <>
    <div className={styles.barViewport} ref={viewport} onMouseLeave={selection.leave}>
      <svg {...drag} className={styles.chart} style={{ touchAction:"pan-y", visibility: containerWidth ? undefined : "hidden" }} viewBox={`0 0 ${width} 194`} role="group" aria-label={`热量柱状图，单位${unit}`}>
        <defs><pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M-1 1L1 -1M0 5L5 0M4 6L6 4" stroke="#f0e9dd" strokeOpacity=".3" strokeWidth="1" /></pattern></defs>
        {scale.ticks.map(tick => <g key={tick}><line className={styles.grid} x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} /><text className={styles.axis} data-calorie-tick={tick} x={left - 8} y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
        <text className={styles.axis} x={left - 8} y="18" textAnchor="end">{unit}</text>
        {dates.map((date, index) => {
          const daily = byDate.get(date), x = left + index * slot, barWidth = Math.min(30, slot * .68), energy = daily?.values.caloriesKcal;
          const incompleteDay = !!daily && statusByDate.get(date) !== "complete";
          const label = `${date} · ${daily ? ["caloriesKcal" as const, ...macros].map(metric => `${metricLabels[metric]} ${formatNutrition(daily.values[metric], metric)} ${metric === "caloriesKcal" ? "kcal" : "g"}${daily.incomplete[metric] ? "（已知合计，不完整）" : ""}`).join(" · ") : "未记录"}${incompleteDay ? statusByDate.get(date) === "incomplete" ? " · 当天未记全" : " · 全天待确认" : ""}`;
          const valueLabel = formatNutrition(energy ?? null, "caloriesKcal");
          return <g key={date} role="button" tabIndex={date === inspected ? 0 : -1} data-bar-date={date} data-selected={date === inspected} data-day-status={statusByDate.get(date)} aria-label={label} data-chart-date={date} onMouseEnter={()=>selection.preview(date)} onFocus={()=>selection.choose(date)} onClick={()=>selection.pin(date)} onKeyDown={event=>selection.keyDown(event,date)}>
            <title>{label}</title><rect className={styles.barHit} x={x} y="25" width={slot} height="134" />
            {energy!=null&&(()=>{
              const segments=macroDistribution(daily, mode);let below=0;
              if(!segments)return Number(energy)>0?<rect data-chart-bar data-chart-zero="154" data-metric="caloriesKcal" data-incomplete="true" x={x+(slot-barWidth)/2} y={y(Number(energy))} width={barWidth} height={y(0)-y(Number(energy))} fill={calorieColor} className={styles.bar}/>:null;
              return segments.map(segment=>{const start=below;below+=segment.calories;const height=y(start)-y(below);return <g key={segment.metric}><rect data-chart-bar data-chart-zero="154" data-metric={segment.metric} data-energy-ratio={mode==="energy"?segment.ratio:undefined} data-macro-ratio={segment.ratio} data-macro-mode={mode} data-incomplete={Boolean(daily?.incomplete.caloriesKcal)} x={x+(slot-barWidth)/2} y={y(below)} width={barWidth} height={height} fill={macroColors[segment.metric]} className={styles.bar}/>{barWidth>=11&&height>=14&&<text className={styles.stackLetter} x={x+slot/2} y={y(below)+height/2+3.5} textAnchor="middle" fill={segment.metric==="proteinG"?"#f0e9dd":"#182b38"}>{segment.metric==="proteinG"?"P":segment.metric==="carbsG"?"C":"F"}</text>}</g>});
            })()}
            {incompleteDay && energy != null && Number(energy) > 0 && <rect data-day-incomplete="true" x={x + (slot - barWidth) / 2} y={y(Number(energy))} width={barWidth} height={y(0) - y(Number(energy))} fill={`url(#${patternId})`} className={styles.bar} />}
            {allDates && energy != null && slot >= valueLabel.length * 6.5 + 6 && <text className={styles.barValue} x={x + slot / 2} y={y(Number(energy)) - 7} textAnchor="middle">{valueLabel}{daily?.incomplete.caloriesKcal ? "*" : ""}</text>}
            {(index % stride === 0 && dates.length - 1 - index >= stride / 2 || index === dates.length - 1) && <text className={styles.axis} data-date-tick x={x + slot / 2} y="185" textAnchor={index === 0 ? "start" : index === dates.length - 1 ? "end" : "middle"}>{allDates && slot < 46 ? date.slice(8) : date.slice(5)}</text>}
          </g>;
        })}
        <path className={styles.selectedDay} d={`M ${selectedX} 158 v 6`} />
      </svg>
    </div>
  </>;
}
