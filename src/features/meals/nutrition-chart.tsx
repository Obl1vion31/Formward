"use client";
import { useEffect, useId, useRef, useState } from "react";
import { dailyTotals, macroColors, macroDistribution, formatNutrition, metricLabels, type Metric, type MacroMode } from "./model";
import { useChartMotion } from "@/components/use-chart-motion";
import { ChartDateControls } from "@/components/chart-date-controls";
import { chartScale } from "@/components/chart-scale";
import styles from "./meals.module.css";

const calorieColor = "#7F9EAF";
const macros: Metric[] = ["proteinG", "carbsG", "fatG"];
export function NutritionChart({ dates, groups, select, mode, setMode }: { dates: string[]; groups: ReturnType<typeof dailyTotals>; select: (date: string) => void; mode: MacroMode; setMode: (mode: MacroMode) => void }) {
  const viewport = useRef<HTMLDivElement>(null), [containerWidth, setContainerWidth] = useState(0);
  const patternId = useId().replaceAll(":", "");
  const byDate = new Map(groups.map(group => [group.date, group.totals]));
  const statusByDate = new Map(groups.map(group => [group.date, group.day.status]));
  const [selectedDate, setInspected] = useState(() => dates.findLast(date => byDate.has(date)) ?? dates.at(-1)!);
  const inspected = dates.includes(selectedDate) ? selectedDate : dates.findLast(date => byDate.has(date)) ?? dates.at(-1)!;
  const totals = byDate.get(inspected), distribution=macroDistribution(totals, mode), dayStatus = statusByDate.get(inspected), unit = "kcal";
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const node = viewport.current!, observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  useChartMotion(viewport, containerWidth ? `${dates[0]}:${dates.at(-1)}:${mode}:${connected}:${groups.map(group => `${group.date}:${JSON.stringify(group.totals)}`).join("|")}` : "pending");
  const width = containerWidth || 280, left = 54, right = 10, slot = (width - left - right) / dates.length;
  const scale = chartScale(dates.map(date => byDate.get(date)?.values.caloriesKcal)), max = scale.max, y = (value: number) => 184 - value / max * 150;
  const allDates = dates.length <= 7, selectedX = left + (dates.indexOf(inspected) + .5) * slot;
  const stride = Math.max(1, Math.ceil((dates.length - 1) / (width < 440 ? 3 : 6)));
  const line = dates.map((date,index) => {
    const day=byDate.get(date), value=day?.values.caloriesKcal;
    if(value==null||day?.incomplete.caloriesKcal)return "";
    const previous=index?byDate.get(dates[index-1]):null,command=previous?.values.caloriesKcal!=null&&!previous.incomplete.caloriesKcal?"L":"M";return `${command}${left+(index+.5)*slot},${y(Number(value))}`;
  }).join(" ");
  return <>
    <div className={styles.chartRange}><time>{dates[0].replaceAll("-", ".")}</time><span>—</span><time>{dates.at(-1)!.replaceAll("-", ".")}</time><label className={styles.lineToggle}><input type="checkbox" checked={connected} onChange={event=>setConnected(event.target.checked)}/>连线</label></div>
    <div className={styles.chartReadout} aria-live="polite" aria-atomic="true" data-chart-readout={inspected}>
      <div><time dateTime={inspected}>{inspected.replaceAll("-", ".")}</time><strong>{formatNutrition(totals?.values.caloriesKcal ?? null, "caloriesKcal")}<small>kcal</small></strong><span>{!totals ? "未记录" : dayStatus === "incomplete" ? "当天未记全" : dayStatus !== "complete" ? "全天待确认" : totals.incomplete.caloriesKcal ? "已知合计 · 营养不完整" : "总热量"}</span></div>
      <div className={styles.chartMacros}>{macros.map(metric => <span key={metric}>{metricLabels[metric]}<strong>{formatNutrition(totals?.values[metric] ?? null, metric)}<small>g</small></strong>{totals?.incomplete[metric] && <small>部分</small>}{distribution&&<small>{Number((distribution.find(segment=>segment.metric===metric)!.ratio*100).toFixed(1))}%</small>}</span>)}</div>
    </div>
    <div className={styles.macroMode} role="group" aria-label="营养占比口径">{([["grams","克数占比"],["energy","能量占比"]] as const).map(([value,label])=><button key={value} aria-pressed={mode===value} onClick={()=>setMode(value)}>{label}</button>)}</div>
    <div className={styles.macroLegend}>{macros.map(metric=><span key={metric}><i style={{background:macroColors[metric as keyof typeof macroColors]}}/>{metric==="proteinG"?"P":metric==="carbsG"?"C":"F"} · {metricLabels[metric]}</span>)}{totals&&!distribution&&<span>营养占比不完整 · 显示总热量</span>}{dates.some(date => byDate.has(date) && statusByDate.get(date) !== "complete") && <span><i className={styles.incompleteKey} />未记全／全天待确认</span>}</div>
    <div className={styles.barViewport} ref={viewport}>
      <svg className={styles.chart} style={{ visibility: containerWidth ? undefined : "hidden" }} viewBox={`0 0 ${width} 224`} role="group" aria-label={`热量柱状图，单位${unit}`}>
        <defs><pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M-1 1L1 -1M0 5L5 0M4 6L6 4" stroke="#f0e9dd" strokeOpacity=".3" strokeWidth="1" /></pattern></defs>
        {scale.ticks.map(tick => <g key={tick}><line className={styles.grid} x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} /><text className={styles.axis} data-calorie-tick={tick} x={left - 8} y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
        <text className={styles.axis} x={left - 8} y="18" textAnchor="end">{unit}</text>
        {dates.map((date, index) => {
          const daily = byDate.get(date), x = left + index * slot, barWidth = Math.min(30, slot * .68), energy = daily?.values.caloriesKcal;
          const incompleteDay = !!daily && statusByDate.get(date) !== "complete";
          const label = `${date} · ${daily ? ["caloriesKcal" as const, ...macros].map(metric => `${metricLabels[metric]} ${formatNutrition(daily.values[metric], metric)} ${metric === "caloriesKcal" ? "kcal" : "g"}${daily.incomplete[metric] ? "（已知合计，不完整）" : ""}`).join(" · ") : "未记录"}${incompleteDay ? statusByDate.get(date) === "incomplete" ? " · 当天未记全" : " · 全天待确认" : ""}`;
          const valueLabel = formatNutrition(energy ?? null, "caloriesKcal");
          return <g key={date} role="button" tabIndex={date === inspected ? 0 : -1} data-bar-date={date} data-selected={date === inspected} data-day-status={statusByDate.get(date)} aria-label={label} onMouseEnter={() => setInspected(date)} onFocus={() => setInspected(date)} onClick={() => setInspected(date)} onKeyDown={event => {
            if (["Enter", " "].includes(event.key)) { event.preventDefault(); setInspected(date); }
            const next = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? dates.length - 1 : null;
            if (next !== null) { event.preventDefault(); (event.currentTarget.parentElement?.querySelectorAll<SVGGElement>("[data-bar-date]")[Math.max(0, Math.min(dates.length - 1, next))])?.focus(); }
          }}>
            <title>{label}</title><rect className={styles.barHit} x={x} y="25" width={slot} height="164" />
            {energy!=null&&(()=>{
              const segments=macroDistribution(daily, mode);let below=0;
              if(!segments)return Number(energy)>0?<rect data-chart-bar data-chart-zero="184" data-metric="caloriesKcal" data-incomplete="true" x={x+(slot-barWidth)/2} y={y(Number(energy))} width={barWidth} height={y(0)-y(Number(energy))} fill={calorieColor} className={styles.bar}/>:null;
              return segments.map(segment=>{const start=below;below+=segment.calories;const height=y(start)-y(below);return <g key={segment.metric}><rect data-chart-bar data-chart-zero="184" data-metric={segment.metric} data-energy-ratio={mode==="energy"?segment.ratio:undefined} data-macro-ratio={segment.ratio} data-macro-mode={mode} data-incomplete={Boolean(daily?.incomplete.caloriesKcal)} x={x+(slot-barWidth)/2} y={y(below)} width={barWidth} height={height} fill={macroColors[segment.metric]} className={styles.bar}/>{barWidth>=11&&height>=14&&<text className={styles.stackLetter} x={x+slot/2} y={y(below)+height/2+3.5} textAnchor="middle" fill={segment.metric==="proteinG"?"#f0e9dd":"#182b38"}>{segment.metric==="proteinG"?"P":segment.metric==="carbsG"?"C":"F"}</text>}</g>});
            })()}
            {incompleteDay && energy != null && Number(energy) > 0 && <rect data-day-incomplete="true" x={x + (slot - barWidth) / 2} y={y(Number(energy))} width={barWidth} height={y(0) - y(Number(energy))} fill={`url(#${patternId})`} className={styles.bar} />}
            {allDates && energy != null && slot >= valueLabel.length * 6.5 + 6 && <text className={styles.barValue} x={x + slot / 2} y={y(Number(energy)) - 7} textAnchor="middle">{valueLabel}{daily?.incomplete.caloriesKcal ? "*" : ""}</text>}
            {(index % stride === 0 && dates.length - 1 - index >= stride / 2 || index === dates.length - 1) && <text className={styles.axis} data-date-tick x={x + slot / 2} y="215" textAnchor={index === 0 ? "start" : index === dates.length - 1 ? "end" : "middle"}>{allDates && slot < 46 ? date.slice(8) : date.slice(5)}</text>}
          </g>;
        })}
        {connected && <path data-chart-line data-energy-line d={line} fill="none" stroke={calorieColor} strokeWidth="1.5" className={styles.bar}/>}
        <path className={styles.selectedDay} d={`M ${selectedX} 188 v 6`} />
      </svg>
    </div>
    <div className={styles.chartNavigation}><ChartDateControls label="饮食图表日期" value={inspected} min={dates[0]} max={dates.at(-1)!} onChange={setInspected} /><button type="button" onClick={() => select(inspected)}>查看记录 →</button></div>
  </>;
}
