"use client";
import {useChartViewport} from "@/components/use-chart-viewport";
import {useChartDrag} from "@/components/use-chart-drag";
import {signedRecordNumber} from "@/components/number-format";
import { useEffect, useId, useRef, useState } from "react";

import { useMobileMode } from "@/components/use-mobile-mode";
import { ChartSelectionColumn, ChartSelectionPoint } from "@/components/chart-selection-marker";
import type {useChartDateSelection} from "@/components/use-chart-date-selection";
import { useChartMotion } from "@/components/use-chart-motion";
import { energyBands, energyLineScale, fadeEdgeFraction, linePath } from "./chart-geometry";
import type { OverviewDay } from "./model";
import styles from "./overview.module.css";
import {relationshipFrame,relationshipFrameStyle} from "./relationship-frame";

const palette = { intake: "var(--data-blue)", expenditure: "var(--data-red)", surplus: "var(--data-surplus)", deficit: "var(--data-deficit)", weight: "var(--data-weight)" };
export function RelationshipPlot({days,selected,selection,compactMode}:{days:OverviewDay[];selected:string;selection:ReturnType<typeof useChartDateSelection>;compactMode?:boolean}) {
  const container = useRef<HTMLDivElement>(null), id = useId().replaceAll(":", "");
  const mobile = useMobileMode(), [shortViewport, setShortViewport] = useState<boolean|null>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-height: 600px)");
    const update = () => setShortViewport(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const energyScale = energyLineScale(days.flatMap(day => [day.nutrition?.values.caloriesKcal, day.energy.totalKcal])), weightScale = energyLineScale(days.map(day => day.weightChangeKg), "kg");
  const {width,left}=useChartViewport(container,[...energyScale.ticks,...weightScale.ticks.map(tick=>(tick>0?"+":"")+tick)],49);
  useChartMotion(container, width ? days.map(day => `${day.date}:${day.nutrition?.values.caloriesKcal}:${day.energy.totalKcal}:${day.energyBalance}:${day.weightChangeKg}`).join("|") : "pending");
  const w=width||280,compact=compactMode??mobile??w<650,right=13;
  const {top,energyBottom,weightTop,weightBottom,height}=relationshipFrame(compact,!!shortViewport);
  // 只减少标签密度，保持全区间的数据范围与零线。
  const spacedTicks = (ticks: number[], step: number, plotHeight: number) => {
    const stride = Math.max(1, Math.ceil(24 * (ticks.length - 1) / plotHeight));
    return ticks.filter(tick => Math.abs(tick / (step * stride) - Math.round(tick / (step * stride))) < 1e-8);
  };
  const energyTicks = spacedTicks(energyScale.ticks, energyScale.step, energyBottom - top), weightTicks = spacedTicks(weightScale.ticks, weightScale.step, weightBottom - weightTop);
  const energyY = (n: number) => energyBottom - (n - energyScale.min) / (energyScale.max - energyScale.min) * (energyBottom - top);
  const weightY = (n: number) => weightBottom - (n - weightScale.min) / (weightScale.max - weightScale.min) * (weightBottom - weightTop);
  const slot = (w - left - right) / days.length, x = (index: number) => left + (index + .5) * slot;
  const intake = days.map((day, i) => day.nutrition?.values.caloriesKcal != null ? { x: x(i), y: energyY(Number(day.nutrition.values.caloriesKcal)) } : null);
  const expenditure = days.map((day, i) => day.energy.totalKcal != null ? { x: x(i), y: energyY(Number(day.energy.totalKcal)) } : null);
  const paired = days.map((day, i) => intake[i] && expenditure[i] && day.energyBalance !== null ? { intake: intake[i]!, expenditure: expenditure[i]!, balance: day.energyBalance } : null);
  const selectedIndex = Math.max(0, days.findIndex(day => day.date === selected)), stride = Math.max(1, Math.ceil((days.length - 1) / (w < 440 ? 3 : 6)));
  const drag=useChartDrag(days.map(day=>day.date),w,left,right,selection.choose);
  const pick = (svg: SVGSVGElement, clientX: number, action=selection.preview) => { const bounds = svg.getBoundingClientRect(); action(days[Math.max(0, Math.min(days.length - 1, Math.floor(((clientX - bounds.left) * w / bounds.width - left) / slot)))].date); };
  return <div ref={container} role="group" aria-label="摄入、消耗、盈余与次晨体重变化" className={styles.relationship} style={relationshipFrameStyle} data-compact={compactMode??mobile??undefined}>

    <div className={styles.plot}><svg viewBox={`0 0 ${w} ${height}`} style={{ visibility: width&&(compactMode!==undefined||mobile!==null)&&(!compact||shortViewport!==null) ? undefined : "hidden" }} role="group" aria-label="双层日期关联图" aria-describedby={`${id}-help`}
      {...drag} onPointerMove={event=>{drag.onPointerMove(event);if(event.pointerType==="mouse")pick(event.currentTarget,event.clientX);}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();selection.release();}}}>
      <desc id={`${id}-help`}>上下两图使用同一日期。点击、左右方向键及Enter选择日期，查看记录按钮打开详情。摄入用圆点，消耗用方点，空心摄入点表示当天未记全或尚未确认全天。热量填色只用于已确认完整日，体重变化对应当日到次日晨间。</desc>
      <ChartSelectionColumn x={x(selectedIndex)} date={selected} column={{left:x(selectedIndex)-slot/2,right:x(selectedIndex)+slot/2}} plot={{left,right:w-right,top,bottom:weightBottom}} resetKey={`${w}:${height}:${days.map(d=>d.date).join("|")}`} direct={selection.direct}/>
      <g data-overview-panel="energy">
        {energyTicks.map(tick => <g key={tick} data-axis-tick={tick}><line x1={left} x2={w - right} y1={energyY(tick)} y2={energyY(tick)} className={styles.grid} /><text x={left - 8} y={energyY(tick) + 4} textAnchor="end" className={styles.axis}>{tick}</text></g>)}
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
        {!intake.some(Boolean) && !expenditure.some(Boolean) && <text x={(left + w - right) / 2} y={(top + energyBottom) / 2} textAnchor="middle" className={styles.emptyPlot}>此区间暂无热量记录</text>}
      </g>
      <g data-overview-panel="weight">
        {!compact && <line x1="0" x2={w} y1={energyBottom + 16} y2={energyBottom + 16} className={styles.grid} />}
        <text data-weight-readout x={w - right} y={weightTop - 10} textAnchor="end" className={styles.axis}>{compact?days[selectedIndex]?.nextDate.slice(5).replace("-",".")+" ":""}次晨变化：{(days[selectedIndex]?.ambiguous ? "待选择" : days[selectedIndex]?.weightChangeKg == null ? "未配对 · kg" : signedRecordNumber(days[selectedIndex].weightChangeKg) + " kg")}</text>
        {weightTicks.map(tick => <g key={tick} data-axis-tick={tick}><line data-overview-zero={tick === 0 ? "" : undefined} x1={left} x2={w - right} y1={weightY(tick)} y2={weightY(tick)} className={tick === 0 ? styles.zeroLine : styles.grid} /><text x={left - 8} y={weightY(tick) + 4} textAnchor="end" className={styles.axis}>{tick > 0 ? "+" : ""}{tick}</text></g>)}
        <g data-chart-line className={styles.plotData}>{days.map((day, i) => i > 0 && day.weightChangeKg !== null && days[i - 1].weightChangeKg !== null && <line key={day.date} x1={x(i - 1)} x2={x(i)} y1={weightY(days[i - 1].weightChangeKg!)} y2={weightY(day.weightChangeKg)} stroke={palette.weight} strokeWidth="1.6" strokeLinecap="round" />)}</g>
        {!days.some(day => day.weightChangeKg !== null) && <text x={(left + w - right) / 2} y={weightTop + 24} textAnchor="middle" className={styles.emptyPlot}>暂无相邻两日晨重</text>}
      </g>
      {[{point:intake[selectedIndex],color:palette.intake},{point:expenditure[selectedIndex],color:palette.expenditure},{point:days[selectedIndex]?.weightChangeKg!=null?{x:x(selectedIndex),y:weightY(days[selectedIndex].weightChangeKg!)}:null,color:palette.weight}].map(({point,color},i)=><ChartSelectionPoint key={i} x={point?.x??null} y={point?.y??0} resetKey={`${w}:${height}:${energyScale.min}:${energyScale.max}:${weightScale.min}:${weightScale.max}:${days.map(d=>d.date).join("|")}`} direct={selection.direct} color={color}/>)}
      {days.map((day, i) => <g key={day.date} style={{ outline: "none" }} role="button" tabIndex={day.date === selected ? 0 : -1} data-overview-date={day.date} data-selected={day.date===selected} aria-pressed={day.date===selected} data-balance={day.energyBalance ?? undefined} data-meal-day-status={day.mealDayStatus} aria-label={`${day.date} · 摄入 ${day.nutrition?.values.caloriesKcal ?? "未记录"} kcal${day.nutrition && day.mealDayStatus !== "complete" ? day.mealDayStatus === "incomplete" ? "，当天未记全" : "，全天待确认" : ""} · 消耗 ${day.energy.totalKcal ?? "未记录"} kcal · 盈余 ${day.energyBalance ?? "未知"} kcal · 次晨变化 ${day.weightChangeKg ?? "未知"} kg`} data-chart-date={day.date} onFocus={event=>selection.focus(event,day.date)} onClick={()=>selection.activate(day.date)} onKeyDown={event=>selection.keyDown(event,day.date)}>
        <rect x={left + i * slot} y={top} width={slot} height={weightBottom - top} className={styles.plotHit} />
        <g className={styles.plotData}>{[intake[i], expenditure[i]].map((point, n) => {
          if (!point) return null;
          const radius = days.length > 90 ? 1.4 : ![intake, expenditure][n][i - 1] || ![intake, expenditure][n][i + 1] ? 2.5 : 1.8;
          return n ? <rect key={n} data-series="expenditure" data-overview-value={day.energy.totalKcal ?? undefined} x={point.x - radius} y={point.y - radius} width={radius * 2} height={radius * 2} fill={palette.expenditure} /> : <circle key={n} data-series="intake" data-overview-value={day.nutrition?.values.caloriesKcal} cx={point.x} cy={point.y} r={radius} stroke={palette.intake} strokeWidth="1.2" fill={day.mealDayStatus !== "complete" ? "var(--surface)" : palette.intake} />;
        })}
          {day.weightChangeKg !== null && <circle data-series="weight-change" data-overview-value={day.weightChangeKg} cx={x(i)} cy={weightY(day.weightChangeKg)} r={days.length > 90 ? 1.4 : 2.5} stroke={palette.weight} strokeWidth="1.2" fill={palette.weight} />}
        </g>
        {(i % stride === 0 && days.length - 1 - i >= stride / 2 || i === days.length - 1) && <text x={x(i)} y={height - 5} textAnchor={days.length === 1 ? "middle" : i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} data-overview-date-label="" className={styles.axis}>{w < 440 && days.length <= 7 ? day.date.slice(8) : days.length > 366 ? day.date.slice(2, 7).replace("-", ".") : day.date.slice(5).replace("-", ".")}</text>}
      </g>)}
    </svg></div>

  </div>;
}
