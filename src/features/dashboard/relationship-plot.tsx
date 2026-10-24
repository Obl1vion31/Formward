"use client";
import { useEffect, useId, useRef, useState } from "react";

import { useChartMotion } from "@/components/use-chart-motion";
import { energyBands, energyLineScale, fadeEdgeFraction, linePath, missingRuns } from "./chart-geometry";
import type { OverviewDay } from "./model";
import styles from "./overview.module.css";

const palette = { intake: "#92B9D6", expenditure: "#D89490", surplus: "#D8B38A", deficit: "#92B2C2", weight: "#EEE5D5" };
export function RelationshipPlot({ days, selected, inspect }: { days: OverviewDay[]; selected: string; inspect: (date: string) => void }) {
  const container = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0), id = useId().replaceAll(":", "");
  const gesture = useRef<{ x: number; y: number; horizontal: boolean } | null>(null);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(container.current!); return () => observer.disconnect(); }, []);
  useChartMotion(container, width ? days.map(day => `${day.date}:${day.nutrition?.values.caloriesKcal}:${day.energy.totalKcal}:${day.energyBalance}:${day.weightChangeKg}:${day.differenceEstimated}`).join("|") : "pending");
  const w = width || 280, left = 49, right = 13, top = 26, energyBottom = w < 500 ? 190 : 246, weightTop = energyBottom + 75, weightBottom = weightTop + 112, height = weightBottom + 34;
  const energyScale = energyLineScale(days.flatMap(day => [day.nutrition?.values.caloriesKcal, day.energy.totalKcal])), weightScale = energyLineScale(days.map(day => day.weightChangeKg), "kg");
  const energyY = (n: number) => energyBottom - (n - energyScale.min) / (energyScale.max - energyScale.min) * (energyBottom - top);
  const weightY = (n: number) => weightBottom - (n - weightScale.min) / (weightScale.max - weightScale.min) * (weightBottom - weightTop);
  const slot = (w - left - right) / days.length, x = (index: number) => left + (index + .5) * slot;
  const intake = days.map((day, i) => day.nutrition?.values.caloriesKcal != null ? { x: x(i), y: energyY(Number(day.nutrition.values.caloriesKcal)) } : null);
  const expenditure = days.map((day, i) => day.energy.totalKcal != null ? { x: x(i), y: energyY(Number(day.energy.totalKcal)) } : null);
  const paired = days.map((day, i) => intake[i] && expenditure[i] && day.energyBalance !== null ? { intake: intake[i]!, expenditure: expenditure[i]!, balance: day.energyBalance } : null);
  const energyGaps = missingRuns(days.map((_, i) => Boolean(intake[i] && expenditure[i]))), weightGaps = missingRuns(days.map(day => day.weightChangeKg !== null));
  const selectedIndex = Math.max(0, days.findIndex(day => day.date === selected)), stride = Math.max(1, Math.ceil((days.length - 1) / (w < 440 ? 3 : 6)));
  const pick = (svg: SVGSVGElement, clientX: number) => { const bounds = svg.getBoundingClientRect(); inspect(days[Math.max(0, Math.min(days.length - 1, Math.floor(((clientX - bounds.left) * w / bounds.width - left) / slot)))].date); };
  return <div ref={container} role="group" aria-label="摄入、消耗、盈余与次晨体重变化" className={styles.relationship}>
    <div className={styles.panelHeading}><h3>热量收支</h3><div className={styles.legend}><span><i className={styles.intakeKey} style={{ background: palette.intake }} />摄入</span><span><i className={styles.expenditureKey} style={{ background: palette.expenditure }} />消耗</span><span><i className={styles.areaKey} style={{ background: palette.surplus }} />盈余</span><span><i className={styles.areaKey} style={{ background: palette.deficit }} />缺口</span>{days.some(day => day.nutrition && day.mealDayStatus !== "complete") && <span><i className={styles.unconfirmedKey} />未记全／待确认</span>}{!!(energyGaps.length || weightGaps.length) && <span><i className={styles.gapKey} />缺记录</span>}</div></div>
    <div className={styles.plot}><svg viewBox={`0 0 ${w} ${height}`} style={{ visibility: width ? undefined : "hidden" }} role="group" aria-label="双层日期关联图" aria-describedby={`${id}-help`}
      onPointerDown={event => { if (event.button !== 0) return; gesture.current = { x: event.clientX, y: event.clientY, horizontal: false }; pick(event.currentTarget, event.clientX); }}
      onPointerMove={event => {
        if (event.pointerType === "mouse" && event.buttons === 0) gesture.current = null;
        const start = gesture.current;
        if (start && !start.horizontal && Math.abs(event.clientX - start.x) > 8 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) { start.horizontal = true; event.currentTarget.setPointerCapture(event.pointerId); }
        if (event.pointerType === "mouse" || start?.horizontal) pick(event.currentTarget, event.clientX);
      }} onPointerUp={event => { gesture.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { gesture.current = null; }}>
      <desc id={`${id}-help`}>上下两图使用同一日期。点击、左右方向键及Enter选择日期，查看记录按钮打开详情。摄入用圆点，消耗用方点，空心摄入点表示当天未记全或尚未确认全天。热量填色只用于已确认完整日，体重变化对应当日到次日晨间。</desc>
      <g data-overview-panel="energy">
        <text x={left - 8} y="13" textAnchor="end" className={styles.axis}>kcal</text>
        {energyScale.ticks.map(tick => <g key={tick} data-axis-tick={tick}><line x1={left} x2={w - right} y1={energyY(tick)} y2={energyY(tick)} className={styles.grid} /><text x={left - 8} y={energyY(tick) + 4} textAnchor="end" className={styles.axis}>{tick}</text></g>)}
        <g data-chart-line className={styles.plotData}>
          {paired.slice(0, -1).map((a, i) => {
            const bands = energyBands(a, paired[i + 1]); if (!bands.length) return null;
            const fadeStart = i > 0 && !paired[i - 1], fadeEnd = i + 2 < paired.length && !paired[i + 2], edge = fadeEdgeFraction(slot), mask = `${id}-gap-${i}`;
            return <g key={i}>{(fadeStart || fadeEnd) && <defs><linearGradient id={`${mask}-gradient`} gradientUnits="userSpaceOnUse" x1={x(i)} x2={x(i + 1)}><stop offset="0" stopColor="white" stopOpacity={fadeStart ? 0 : 1} /><stop offset={edge} stopColor="white" /><stop offset={1 - edge} stopColor="white" /><stop offset="1" stopColor="white" stopOpacity={fadeEnd ? 0 : 1} /></linearGradient><mask id={mask} maskUnits="userSpaceOnUse" x={x(i) - 1} y={top - 1} width={slot + 2} height={energyBottom - top + 2} style={{ maskType: "alpha" }}><rect x={x(i) - 1} y={top - 1} width={slot + 2} height={energyBottom - top + 2} fill={`url(#${mask}-gradient)`} /></mask></defs>}
              <g mask={fadeStart || fadeEnd ? `url(#${mask})` : undefined}>{bands.map((band, n) => <polygon key={n} data-energy-band={band.positive ? "surplus" : "deficit"} points={band.points.map(p => `${p.x},${p.y}`).join(" ")} fill={band.positive ? palette.surplus : palette.deficit} fillOpacity=".28" />)}</g>
            </g>;
          })}
          <path data-energy-line="intake" d={linePath(intake)} fill="none" stroke={palette.intake} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path data-energy-line="expenditure" d={linePath(expenditure)} fill="none" stroke={palette.expenditure} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {paired.some(Boolean) && energyGaps.map(run => <line key={run.start} data-missing-run="energy" x1={(x(run.start) + x(run.end)) / 2 - 3} x2={(x(run.start) + x(run.end)) / 2 + 3} y1={energyBottom + 12} y2={energyBottom + 12} className={styles.gapMark} />)}
        {!intake.some(Boolean) && !expenditure.some(Boolean) && <text x={(left + w - right) / 2} y={(top + energyBottom) / 2} textAnchor="middle" className={styles.emptyPlot}>此区间暂无热量记录</text>}
      </g>
      <g data-overview-panel="weight">
        <line x1="0" x2={w} y1={energyBottom + 35} y2={energyBottom + 35} className={styles.grid} />
        <text x="0" y={energyBottom + 58} className={styles.plotTitle}>次晨体重变化</text><text x={w - right} y={energyBottom + 58} textAnchor="end" className={styles.axis}>{w < 500 ? (days[selectedIndex]?.ambiguous ? "待选择" : days[selectedIndex]?.weightChangeKg == null ? "未配对" : (days[selectedIndex].weightChangeKg! > 0 ? "+" : "") + days[selectedIndex].weightChangeKg + (days[selectedIndex].differenceEstimated ? " kg · 含估计" : " kg")) : "kg"}</text>
        {weightScale.ticks.map(tick => <g key={tick} data-axis-tick={tick}><line data-overview-zero={tick === 0 ? "" : undefined} x1={left} x2={w - right} y1={weightY(tick)} y2={weightY(tick)} className={tick === 0 ? styles.zeroLine : styles.grid} /><text x={left - 8} y={weightY(tick) + 4} textAnchor="end" className={styles.axis}>{tick > 0 ? "+" : ""}{tick}</text></g>)}
        <g data-chart-line className={styles.plotData}>{days.map((day, i) => i > 0 && day.weightChangeKg !== null && days[i - 1].weightChangeKg !== null && <line key={day.date} x1={x(i - 1)} x2={x(i)} y1={weightY(days[i - 1].weightChangeKg!)} y2={weightY(day.weightChangeKg)} stroke={palette.weight} strokeWidth="1.6" strokeLinecap="round" strokeDasharray={day.differenceEstimated || days[i - 1].differenceEstimated ? "4 4" : undefined} />)}</g>
        {days.some(day => day.weightChangeKg !== null) && weightGaps.map(run => <line key={run.start} data-missing-run="weight" x1={(x(run.start) + x(run.end)) / 2 - 3} x2={(x(run.start) + x(run.end)) / 2 + 3} y1={weightBottom + 11} y2={weightBottom + 11} className={styles.gapMark} />)}
        {!days.some(day => day.weightChangeKg !== null) && <text x={(left + w - right) / 2} y={weightTop + 24} textAnchor="middle" className={styles.emptyPlot}>暂无相邻两日晨重</text>}
      </g>
      <rect x={left + selectedIndex * slot} y={top} width={slot} height={weightBottom - top} fill="rgba(240,233,221,.025)" className={styles.plotData} />
      <line data-crosshair-date={selected} x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={weightBottom} className={styles.crosshair} />
      {days.map((day, i) => <g key={day.date} style={{ outline: "none" }} role="button" tabIndex={day.date === selected ? 0 : -1} data-overview-date={day.date} data-balance={day.energyBalance ?? undefined} data-meal-day-status={day.mealDayStatus} aria-label={`${day.date} · 摄入 ${day.nutrition?.values.caloriesKcal ?? "未记录"} kcal${day.nutrition && day.mealDayStatus !== "complete" ? day.mealDayStatus === "incomplete" ? "，当天未记全" : "，全天待确认" : ""} · 消耗 ${day.energy.totalKcal ?? "未记录"} kcal · 盈余 ${day.energyBalance ?? "未知"} kcal · 次晨变化 ${day.weightChangeKg ?? "未知"} kg`} onFocus={() => inspect(day.date)} onClick={() => inspect(day.date)} onKeyDown={event => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); inspect(day.date); }
        const next = event.key === "ArrowLeft" ? i - 1 : event.key === "ArrowRight" ? i + 1 : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
        if (next !== null) { event.preventDefault(); event.currentTarget.parentElement?.querySelectorAll<SVGGElement>("[data-overview-date]")[Math.max(0, Math.min(days.length - 1, next))]?.focus(); }
      }}>
        <rect x={left + i * slot} y={top} width={slot} height={weightBottom - top} className={styles.plotHit} />
        <g className={styles.plotData}>{[intake[i], expenditure[i]].map((point, n) => {
          if (!point) return null;
          const radius = i === selectedIndex ? 3.6 : days.length > 90 ? 1.4 : ![intake, expenditure][n][i - 1] || ![intake, expenditure][n][i + 1] ? 2.5 : 1.8;
          return n ? <rect key={n} data-series="expenditure" data-overview-value={day.energy.totalKcal ?? undefined} x={point.x - radius} y={point.y - radius} width={radius * 2} height={radius * 2} fill={palette.expenditure} /> : <circle key={n} data-series="intake" data-overview-value={day.nutrition?.values.caloriesKcal} cx={point.x} cy={point.y} r={radius} stroke={palette.intake} strokeWidth="1.2" fill={day.mealDayStatus !== "complete" ? "#151513" : palette.intake} />;
        })}
          {day.weightChangeKg !== null && <circle data-series="weight-change" data-overview-value={day.weightChangeKg} data-estimated={day.differenceEstimated} cx={x(i)} cy={weightY(day.weightChangeKg)} r={i === selectedIndex ? 3.4 : days.length > 90 ? 1.4 : 2.5} stroke={palette.weight} strokeWidth="1.2" fill={day.differenceEstimated ? "#151513" : palette.weight} />}
        </g>
        {(i % stride === 0 && days.length - 1 - i >= stride / 2 || i === days.length - 1) && <text x={x(i)} y={height - 5} textAnchor={days.length === 1 ? "middle" : i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} className={styles.axis}>{w < 440 && days.length <= 7 ? day.date.slice(8) : days.length > 366 ? day.date.slice(2, 7).replace("-", ".") : day.date.slice(5).replace("-", ".")}</text>}
      </g>)}
    </svg></div>
  </div>;
}
