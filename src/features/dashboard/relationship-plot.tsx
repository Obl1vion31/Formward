"use client";
import {useChartViewport} from "@/components/use-chart-viewport";
import {signedRecordNumber} from "@/components/number-format";
import { useEffect, useId, useRef, useState } from "react";

import { useMobileMode } from "@/components/use-mobile-mode";
import { useChartMotion } from "@/components/use-chart-motion";
import { energyBands, energyLineScale, fadeEdgeFraction, linePath } from "./chart-geometry";
import type { OverviewDay } from "./model";
import styles from "./overview.module.css";

const palette = { intake: "#92B9D6", expenditure: "#D89490", surplus: "#D8B38A", deficit: "#92B2C2", weight: "#EEE5D5" };
export function RelationshipPlot({ days, selected, inspect,preview,leave,pin,unpin }: { days: OverviewDay[]; selected: string; inspect:(date:string)=>void;preview:(date:string)=>void;leave:()=>void;pin:(date:string)=>void;unpin:()=>void }) {
  const container = useRef<HTMLDivElement>(null), id = useId().replaceAll(":", "");
  const [viewportRoom,setViewportRoom]=useState<number|null>(null);
  const mobile = useMobileMode(), [shortViewport, setShortViewport] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-height: 600px)");
    const update = () => setShortViewport(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const gesture = useRef<{ x: number; y: number; horizontal: boolean } | null>(null);
  useEffect(() => {
    const node=container.current!,nav=document.querySelector(".mobile-bottom-nav");
    const measure=()=>{setViewportRoom(nav&&getComputedStyle(nav).display!=="none"?Math.floor(nav.getBoundingClientRect().top-node.getBoundingClientRect().top-window.scrollY-4):null);};
    const observer=new ResizeObserver(measure);observer.observe(node);if(nav)observer.observe(nav,{box:"border-box"});window.addEventListener("resize",measure);measure();
    return()=>{observer.disconnect();window.removeEventListener("resize",measure);};
  }, []);
  const energyScale = energyLineScale(days.flatMap(day => [day.nutrition?.values.caloriesKcal, day.energy.totalKcal])), weightScale = energyLineScale(days.map(day => day.weightChangeKg), "kg");
  const {width,left}=useChartViewport(container,[...energyScale.ticks,...weightScale.ticks.map(tick=>(tick>0?"+":"")+tick)],49);
  useChartMotion(container, width ? days.map(day => `${day.date}:${day.nutrition?.values.caloriesKcal}:${day.energy.totalKcal}:${day.energyBalance}:${day.weightChangeKg}:${day.differenceEstimated}`).join("|") : "pending");
  const w = width || 280, compact = mobile ?? w < 650, right = 13, top = compact ? 16 : 26;
  const energyHeight=compact?Math.min(shortViewport?96:124,Math.max(60,(viewportRoom??1000)-top-32-(shortViewport?56:68)-28)):220;
  const energyBottom = top + energyHeight;
  const weightTop = energyBottom + (compact ? 32 : 56), weightBottom = weightTop + (compact ? shortViewport ? 56 : 68 : 112), height = weightBottom + (compact ? 28 : 34);
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
  const pick = (svg: SVGSVGElement, clientX: number, action=preview) => { const bounds = svg.getBoundingClientRect(); action(days[Math.max(0, Math.min(days.length - 1, Math.floor(((clientX - bounds.left) * w / bounds.width - left) / slot)))].date); };
  return <div ref={container} role="group" aria-label="摄入、消耗、盈余与次晨体重变化" className={styles.relationship}>

    <div className={styles.plot}><svg viewBox={`0 0 ${w} ${height}`} style={{ visibility: width ? undefined : "hidden" }} role="group" aria-label="双层日期关联图" aria-describedby={`${id}-help`}
      onPointerDown={event => { if (event.button !== 0) return; gesture.current = { x: event.clientX, y: event.clientY, horizontal: false }; if(event.pointerType!=="mouse")pick(event.currentTarget,event.clientX,inspect); }}
      onPointerMove={event => {
        if (event.pointerType === "mouse" && event.buttons === 0) gesture.current = null;
        const start = gesture.current;
        if (start && !start.horizontal && Math.abs(event.clientX - start.x) > 8 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) { start.horizontal = true; event.currentTarget.setPointerCapture(event.pointerId); }
        if(event.pointerType==="mouse")pick(event.currentTarget,event.clientX);else if(start?.horizontal)pick(event.currentTarget,event.clientX,inspect);
      }} onPointerUp={event => { gesture.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { gesture.current = null; }} onPointerLeave={leave} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();unpin();}}}>
      <desc id={`${id}-help`}>上下两图使用同一日期。点击、左右方向键及Enter选择日期，查看记录按钮打开详情。摄入用圆点，消耗用方点，空心摄入点表示当天未记全或尚未确认全天。热量填色只用于已确认完整日，体重变化对应当日到次日晨间。</desc>
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
        <text data-weight-readout x={w - right} y={weightTop - 10} textAnchor="end" className={styles.axis}>次晨变化：{(days[selectedIndex]?.ambiguous ? "待选择" : days[selectedIndex]?.weightChangeKg == null ? "未配对" : signedRecordNumber(days[selectedIndex].weightChangeKg) + (days[selectedIndex].differenceEstimated ? " kg · 含估计" : " kg"))}</text>
        {weightTicks.map(tick => <g key={tick} data-axis-tick={tick}><line data-overview-zero={tick === 0 ? "" : undefined} x1={left} x2={w - right} y1={weightY(tick)} y2={weightY(tick)} className={tick === 0 ? styles.zeroLine : styles.grid} /><text x={left - 8} y={weightY(tick) + 4} textAnchor="end" className={styles.axis}>{tick > 0 ? "+" : ""}{tick}</text></g>)}
        <g data-chart-line className={styles.plotData}>{days.map((day, i) => i > 0 && day.weightChangeKg !== null && days[i - 1].weightChangeKg !== null && <line key={day.date} x1={x(i - 1)} x2={x(i)} y1={weightY(days[i - 1].weightChangeKg!)} y2={weightY(day.weightChangeKg)} stroke={palette.weight} strokeWidth="1.6" strokeLinecap="round" strokeDasharray={day.differenceEstimated || days[i - 1].differenceEstimated ? "4 4" : undefined} />)}</g>
        {!days.some(day => day.weightChangeKg !== null) && <text x={(left + w - right) / 2} y={weightTop + 24} textAnchor="middle" className={styles.emptyPlot}>暂无相邻两日晨重</text>}
      </g>
      <rect x={left + selectedIndex * slot} y={top} width={slot} height={weightBottom - top} fill="rgba(240,233,221,.025)" className={styles.plotData} />
      <line data-crosshair-date={selected} x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={weightBottom} className={styles.crosshair} />
      {days.map((day, i) => <g key={day.date} style={{ outline: "none" }} role="button" tabIndex={day.date === selected ? 0 : -1} data-overview-date={day.date} data-balance={day.energyBalance ?? undefined} data-meal-day-status={day.mealDayStatus} aria-label={`${day.date} · 摄入 ${day.nutrition?.values.caloriesKcal ?? "未记录"} kcal${day.nutrition && day.mealDayStatus !== "complete" ? day.mealDayStatus === "incomplete" ? "，当天未记全" : "，全天待确认" : ""} · 消耗 ${day.energy.totalKcal ?? "未记录"} kcal · 盈余 ${day.energyBalance ?? "未知"} kcal · 次晨变化 ${day.weightChangeKg ?? "未知"} kg`} onFocus={() => inspect(day.date)} onClick={() => pin(day.date)} onKeyDown={event => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); pin(day.date); }
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
        {(i % stride === 0 && days.length - 1 - i >= stride / 2 || i === days.length - 1) && <text x={x(i)} y={height - 5} textAnchor={days.length === 1 ? "middle" : i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} data-overview-date-label="" className={styles.axis}>{w < 440 && days.length <= 7 ? day.date.slice(8) : days.length > 366 ? day.date.slice(2, 7).replace("-", ".") : day.date.slice(5).replace("-", ".")}</text>}
      </g>)}
    </svg></div>
    {days.some(day => day.nutrition && day.mealDayStatus !== "complete") && <div className={styles.plotNotes}>
      {days.some(day => day.nutrition && day.mealDayStatus !== "complete") && <span><i className={styles.unconfirmedKey} />空心点：未记全／待确认</span>}
    </div>}
  </div>;
}
