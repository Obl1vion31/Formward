"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChartPreparation } from "@/components/chart-preparation";
import { useChartViewport } from "@/components/use-chart-viewport";
import { useChartDrag } from "@/components/use-chart-drag";
import { useMobileMode } from "@/components/use-mobile-mode";
import { ChartSelectionColumn } from "@/components/chart-selection-marker";
import { chartScale, type ChartScale } from "@/components/chart-scale";
import type { useChartDateSelection } from "@/components/use-chart-date-selection";
import { useChartMotion } from "@/components/use-chart-motion";
import { compactReferenceTick, dayReadoutLeft, morningChangeScale, spacedTicks } from "./chart-geometry";
import { DayReadout } from "./day-readout";
import { balanceLabel, hasEnergyRecord, shortDate } from "./day-readings";
import type { OverviewDay } from "./model";
import styles from "./overview.module.css";
import { relationshipFrame, relationshipFrameStyle } from "./relationship-frame";

type ReadoutMode = "hover" | "focus" | "pinned";
type ReadoutChoice = { scope: string; mode: ReadoutMode };

const balanceColors = { surplus: "var(--data-surplus)", deficit: "var(--data-deficit)", even: "var(--muted)" };
const weightColor = "var(--data-weight)";
const axisGap = 11;
const weightTick = (tick: number, withUnit = true) => tick === 0 ? "0" : (tick > 0 ? "+" : "−") + Math.abs(tick) + (withUnit ? " kg" : "");

export function RelationshipPlot({ days, selected, selection, compactMode, motionRevision, nestedChange = false, bindRangePlot, finishRange, guideRange, suspended = false }: {
  days: OverviewDay[];
  selected: string;
  selection: ReturnType<typeof useChartDateSelection>;
  compactMode?: boolean;
  motionRevision?: number;
  nestedChange?: boolean;
  bindRangePlot?: (node: HTMLDivElement | null) => void;
  finishRange?: () => void;
  guideRange?: string;
  suspended?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const bindContainer = useCallback((node: HTMLDivElement | null) => {
    container.current = node;
    bindRangePlot?.(node);
  }, [bindRangePlot]);
  const plot = useRef<HTMLDivElement>(null);
  const id = useId().replaceAll(":", "");
  const mobile = useMobileMode();
  const [shortViewport, setShortViewport] = useState<boolean | null>(null);
  const [readout, setReadout] = useState<ReadoutChoice | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-height: 600px)");
    const update = () => setShortViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const entries = days.map(day => ({ day, recorded: hasEnergyRecord(day) }));
  const hasEnergy = entries.some(({ recorded }) => recorded);
  const hasWeight = days.some(day => day.weightChangeKg !== null);
  const balanceScale = chartScale(days.map(day => day.energyBalance));
  const weightScale = morningChangeScale(days.map(day => day.weightChangeKg));
  const { width, left: measuredLeft } = useChartViewport(container, [...balanceScale.ticks, ...weightScale.ticks.map(tick => weightTick(tick))], 49);
  const w = width || 280;
  const compact = compactMode ?? mobile ?? w < 650;
  const desktopLeft = measuredLeft + axisGap - 8;
  const left = compact ? 13 : desktopLeft;
  const right = w - 13;
  const { top, energyBottom, weightTop, weightBottom, height } = relationshipFrame(compact, !!shortViewport);
  const balanceY = (n: number) => energyBottom - (n - balanceScale.min) / (balanceScale.max - balanceScale.min) * (energyBottom - top);
  const weightY = (n: number) => weightBottom - (n - weightScale.min) / (weightScale.max - weightScale.min) * (weightBottom - weightTop);
  const balanceZero = balanceY(0);
  const weightZero = weightY(0);
  const slot = (right - left) / days.length;
  const x = (index: number) => left + (index + .5) * slot;
  const selectedIndex = Math.max(0, days.findIndex(day => day.date === selected));
  const entry = entries[selectedIndex];
  const lastIndex = days.length - 1;
  const guideStride = Math.max(1, Math.ceil(lastIndex / 6));
  const stride = w < 440 ? Math.max(1, Math.ceil(lastIndex / 3)) : guideStride;
  const isDateTick = (index: number, step: number) =>
    index === lastIndex || (index % step === 0 && lastIndex - index >= step / 2);
  const longRangeGuides = guideRange === "90" ? new Set([0, 1, 2, 3, 4].map(part => Math.round(lastIndex * part / 4))) : null;
  const showsGuide = (index: number) => guideRange === "7" || (guideRange === "30" && isDateTick(index, guideStride)) || longRangeGuides?.has(index);
  const scope = [days[0]?.date, days.at(-1)?.date, days.length, motionRevision].join(":");
  const mode = !suspended && readout?.scope === scope ? readout.mode : null;
  const ready = !!width && (compactMode !== undefined || mobile !== null) && (!compact || shortViewport !== null);
  const hasReadout = entry.recorded || entry.day.morning !== null || entry.day.nextMorning !== null || entry.day.ambiguous;
  const showReadout = ready && hasReadout && mode !== null && (mode !== "hover" || selection.origin === "pointer");
  const show = (mode: ReadoutMode) => setReadout(current => current?.scope === scope && current.mode === mode ? current : { scope, mode });

  useEffect(() => {
    if (!showReadout) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !plot.current?.contains(event.target)) setReadout(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      setReadout(null);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [showReadout]);

  const drag = useChartDrag(days.map(day => day.date), w, left, w - right, date => {
    setReadout(null);
    selection.choose(date);
  });
  function activate(date: string) {
    if (showReadout && mode === "pinned" && selected === date) {
      setReadout(null);
      return;
    }
    selection.activate(date);
    show("pinned");
  }

  const canGrow = motionRevision !== undefined;
  useChartMotion(container, ready && canGrow && !nestedChange && (hasEnergy || hasWeight) ? w + ":" + height : "pending",
    "overview-relationship:" + motionRevision, motionRevision ? 220 : 600);
  const tipId = id + "-day";
  const tipWidth = Math.min(compact ? 212 : 226, w - 16);

  const barWidth = Math.min(compact ? (guideRange === "7" ? 14 : 6.4) : 17, slot * .65);
  const weightRadius = Math.min(compact ? 2.2 : 2.8, slot * .42);

  function axisMarks(axis: "balance" | "weight", scale: ChartScale, position: (value: number) => number, height: number) {
    const energy = axis === "balance";
    const reference = compact ? compactReferenceTick(scale, height) : null;
    const ticks = compact ? [...new Set([scale.min, 0, scale.max, ...(reference === null ? [] : [reference])])]
      : spacedTicks(scale, height, energy ? 48 : 18);
    return ticks.map(tick => {
      const y = position(tick);
      const zero = tick === 0;
      const isReference = compact && tick === reference;
      const label = energy ? (compact && tick < 0 ? "−" + Math.abs(tick) : String(tick)) : weightTick(tick);
      let labelX = left + 6;
      if (isReference) {
        const width = label.length * 7.3;
        const clearance = (energy ? barWidth / 2 : weightRadius) + 3;
        const baseline = position(0);
        for (const [index, day] of days.entries()) {
          const value = energy ? day.energyBalance : day.weightChangeKg;
          if (value == null) continue;
          const end = position(value);
          const center = x(index);
          if (Math.min(end, baseline) < y - 2 && Math.max(end, baseline) > y - 16
              && labelX < center + clearance && labelX + width > center - clearance) {
            labelX = center + clearance;
          }
        }
        if (labelX + width > right) labelX = left + 6;
      }
      return <g key={tick} data-axis-tick={tick}>
        <line data-range-mark={axis + "-axis:" + tick} x1={left} x2={right} y1={y} y2={y}
          data-balance-zero={energy && zero ? "" : undefined} data-overview-zero={!energy && zero ? "" : undefined}
          className={zero ? styles.zeroLine : isReference ? styles.referenceLine : styles.grid} />
        {(!compact || zero || isReference) && <text data-range-mark={axis + "-tick:" + tick}
          data-reference-tick={isReference ? "" : undefined}
          x={isReference ? labelX : left - (compact ? 5 : axisGap)}
          y={isReference ? y - 4 : y + 4}
          textAnchor={isReference ? "start" : "end"} className={styles.axis}>{label}</text>}
      </g>;
    });
  }

  function balanceMark(day: OverviewDay, index: number, balance: number) {
    const end = balanceY(balance);
    const kind = balance === 0 ? "even" : balance < 0 ? "deficit" : "surplus";
    return <rect key={day.date} data-range-mark={"balance:" + day.date} data-plot-date={day.date} data-series="balance" data-balance-kind={kind} data-overview-value={balance}
      x={x(index) - barWidth / 2} y={balance === 0 ? balanceZero - .85 : Math.min(balanceZero, end)}
      width={barWidth} height={balance === 0 ? 1.7 : Math.abs(end - balanceZero)}
      rx={Math.min(.7, barWidth / 2)} fill={balanceColors[kind]} />;
  }

  function weightPoint(day: OverviewDay, index: number, weight: number) {
    return <circle key={day.date} data-range-mark={"weight-point:" + day.date} data-plot-date={day.date} data-series="weight-change" data-overview-value={weight}
      cx={x(index)} cy={weightY(weight)} r={weightRadius} fill={weightColor} />;
  }

  return <div ref={bindContainer} role="group" aria-label="热量收支与次晨体重变化" className={styles.relationship} data-nested-chart=""
    onPointerDownCapture={finishRange} onFocusCapture={finishRange} onKeyDownCapture={finishRange}
    style={relationshipFrameStyle} data-compact={compactMode ?? mobile ?? undefined}>
    <div ref={plot} className={styles.plot} aria-busy={!ready}
      onPointerLeave={event => { if (event.pointerType === "mouse" && mode === "hover") setReadout(null); }}
      onBlur={event => { if (mode === "focus" && !event.currentTarget.contains(event.relatedTarget)) setReadout(null); }}>
      <ChartPreparation active={!ready}/>
      <svg viewBox={["0", "0", w, height].join(" ")} style={{ visibility: ready ? undefined : "hidden" }}
        role="group" aria-label="双层日期关联图" aria-describedby={id + "-help"} {...drag}
        onPointerMove={event => {
          drag.onPointerMove(event);
          if (event.pointerType !== "mouse" || suspended || mode === "pinned" || container.current?.hasAttribute("data-chart-range-motion")) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const localX = (event.clientX - bounds.left) * w / bounds.width;
          const localY = (event.clientY - bounds.top) * height / bounds.height;
          if (localY < top || localY > weightBottom || localX < left || localX > right) return;
          const date = days[Math.min(days.length - 1, Math.floor((localX - left) / slot))].date;
          if (selection.locked) {
            if (date === selected) return;
            selection.release();
          }
          selection.preview(date);
          show("hover");
        }}>
        <desc id={id + "-help"}>上下两图使用同一日期。净收支以零线为基准，无法计算的日期留空。点按、悬停或使用方向键查看单日读数，点击可锁定日期。查看记录按钮打开当日记录。次晨变化使用相邻两次实测晨重。</desc>
        {(guideRange === "7" || guideRange === "30" || guideRange === "90") && <g aria-hidden="true" pointerEvents="none" className={styles.grid}>
          {days.map((day, index) => {
            if (!showsGuide(index)) return null;
            const center = x(index);
            return <g key={day.date} data-overview-guide-date={day.date}>
              <line data-range-mark={"date-guide:energy:" + day.date} x1={center} x2={center} y1={top} y2={energyBottom} />
              <line data-range-mark={"date-guide:weight:" + day.date} x1={center} x2={center} y1={weightTop} y2={weightBottom} />
            </g>;
          })}
        </g>}
        <ChartSelectionColumn x={x(selectedIndex)} date={selected} column={{ left: x(selectedIndex) - slot / 2, right: x(selectedIndex) + slot / 2 }}
          plot={{ left, right, top, bottom: weightBottom }} resetKey={[w, height, scope].join(":")} direct={selection.direct} rangeMotion />
        <g data-overview-panel="energy">
          {axisMarks("balance", balanceScale, balanceY, energyBottom - top)}
          <g className={styles.plotData}>
            {days.map((day, index) => day.energyBalance === 0 ? balanceMark(day, index, 0) : null)}
          </g>
          <g data-chart-grow-from={canGrow && entries.some(({ day }) => day.energyBalance) ? balanceZero : undefined} className={styles.plotData}>
            {entries.map(({ day }, index) => day.energyBalance ? balanceMark(day, index, day.energyBalance) : null)}
          </g>
          {!hasEnergy && <text x={(left + right) / 2} y={(top + energyBottom) / 2} textAnchor="middle" className={styles.emptyPlot}>此区间暂无热量记录</text>}
        </g>
        <g data-overview-panel="weight">
          {axisMarks("weight", weightScale, weightY, weightBottom - weightTop)}
          <g className={styles.plotData}>
            {days.map((day, index) => day.weightChangeKg === 0
              ? weightPoint(day, index, 0) : null)}
          </g>
          <g data-chart-grow-from={canGrow && days.some(day => day.weightChangeKg) ? weightZero : undefined} className={styles.plotData}>
            {days.map((day, index) => {
              const weight = day.weightChangeKg;
              if (!weight) return null;
              const center = x(index);
              return <g key={day.date}>
                <line data-range-mark={"weight-stem:" + day.date} x1={center} x2={center} y1={weightZero} y2={weightY(weight)} stroke={weightColor} strokeWidth="1.1" strokeOpacity=".58" />
                {weightPoint(day, index, weight)}
              </g>;
            })}
          </g>
          {!hasWeight && <text x={(left + right) / 2} y={weightTop + 24} textAnchor="middle" className={styles.emptyPlot}>暂无相邻两日晨重</text>}
        </g>
        {days.map((day, index) => {
          const balance = day.energyBalance;
          const active = day.date === selected;
          return <g key={day.date} role="button" tabIndex={active ? 0 : -1} data-overview-date={day.date} data-selected={active} aria-pressed={active}
            data-balance={balance ?? undefined} data-meal-day-status={day.mealDayStatus} data-chart-date={day.date}
            aria-label={day.date + " · " + balanceLabel(balance) + (balance ? " " + Math.abs(balance) + " 千卡" : "")}
            aria-describedby={active && showReadout ? tipId : undefined}
            onFocus={event => {
              selection.focus(event, day.date);
              if (event.currentTarget.matches(":focus-visible") && mode !== "pinned") show("focus");
            }}
            onClick={() => activate(day.date)}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activate(day.date);
              } else {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) show("focus");
                selection.keyDown(event, day.date);
              }
            }}>
            <rect x={left + index * slot} y={top} width={slot} height={weightBottom - top} className={styles.plotHit} />
          </g>;
        })}
        {days.map((day, index) => {
          if (!isDateTick(index, stride)) return null;
          return <text key={day.date} x={x(index)} y={height - 5} textAnchor={days.length === 1 ? "middle" : index === 0 ? "start" : index === lastIndex ? "end" : "middle"}
            data-overview-date-label="" data-range-mark={"date-tick:" + day.date} className={styles.axis}
            aria-hidden="true" onClick={() => activate(day.date)}>
            {w < 440 && days.length <= 7 ? day.date.slice(8) : days.length > 366 ? day.date.slice(2, 7).replace("-", ".") : shortDate(day.date)}
          </text>;
        })}
      </svg>
      {showReadout && <DayReadout day={entry.day} id={tipId} style={{
        width: tipWidth,
        left: dayReadoutLeft(x(selectedIndex), w, tipWidth, compact),
        bottom: height - energyBottom + (compact ? 6 : 10),
      }} />}
    </div>
  </div>;
}
