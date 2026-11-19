"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LocalLoading } from "@/components/local-loading";
import { useChartViewport } from "@/components/use-chart-viewport";
import { useChartDrag } from "@/components/use-chart-drag";
import { useMobileMode } from "@/components/use-mobile-mode";
import { ChartSelectionColumn } from "@/components/chart-selection-marker";
import { signedRecordNumber } from "@/components/number-format";
import { chartScale } from "@/components/chart-scale";
import type { useChartDateSelection } from "@/components/use-chart-date-selection";
import { useChartMotion } from "@/components/use-chart-motion";
import { dayReadoutLeft, morningChangeScale, spacedTicks } from "./chart-geometry";
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
const weightTick = (tick: number) => tick > 0 ? "+" + tick : String(tick);

export function RelationshipPlot({ days, selected, selection, compactMode, motionRevision, nestedChange = false, bindRangePlot, finishRange, showDateGuides = false, suspended = false }: {
  days: OverviewDay[];
  selected: string;
  selection: ReturnType<typeof useChartDateSelection>;
  compactMode?: boolean;
  motionRevision?: number;
  nestedChange?: boolean;
  bindRangePlot?: (node: HTMLDivElement | null) => void;
  finishRange?: () => void;
  showDateGuides?: boolean;
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
  const hasPartialEnergy = entries.some(({ day, recorded }) => recorded && day.energyBalance === null);
  const hasWeight = days.some(day => day.weightChangeKg !== null);
  const balanceScale = chartScale(days.map(day => day.energyBalance));
  const weightScale = morningChangeScale(days.map(day => day.weightChangeKg));
  const { width, left: measuredLeft } = useChartViewport(container, [...balanceScale.ticks, ...weightScale.ticks.map(weightTick), "未计"], 49);
  const left = measuredLeft + axisGap - 8;
  const w = width || 280;
  const compact = compactMode ?? mobile ?? w < 650;
  const right = w - 13;
  const { top, energyBottom, weightTop, weightBottom, height } = relationshipFrame(compact, !!shortViewport);
  const coverageTop = energyBottom - (compact ? 9 : 17);
  const coverageHeight = compact ? 15 : 17;
  const coverageY = coverageTop + coverageHeight / 2;
  const balanceBottom = hasPartialEnergy ? coverageTop - (compact ? 9 : 12) : energyBottom;
  const balanceY = (n: number) => balanceBottom - (n - balanceScale.min) / (balanceScale.max - balanceScale.min) * (balanceBottom - top);
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
  const tipBottom = hasPartialEnergy ? coverageTop : energyBottom;

  const barWidth = Math.min(compact ? 6.4 : 17, slot * .65);
  const coverageWidth = Math.min(compact ? 4 : 6, barWidth);
  const weightRadius = Math.min(compact ? 2.2 : 2.8, slot * .42);

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
      {!ready && <div className="chart-preparation"><LocalLoading /></div>}
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
        <desc id={id + "-help"}>上下两图使用同一日期。净收支以零线为基准，灰横表示有记录但未计收支。点按、悬停或使用方向键查看单日读数，点击可锁定日期。查看记录按钮打开当日记录。次晨变化使用相邻两次实测晨重。</desc>
        {showDateGuides && <g aria-hidden="true" pointerEvents="none" className={styles.grid}>
          {days.map((day, index) => {
            if (!isDateTick(index, guideStride)) return null;
            const center = x(index);
            return <g key={day.date} data-overview-guide-date={day.date}>
              <line data-range-mark={"date-guide:energy:" + day.date} x1={center} x2={center} y1={top} y2={balanceBottom} />
              <line data-range-mark={"date-guide:weight:" + day.date} x1={center} x2={center} y1={weightTop} y2={weightBottom} />
            </g>;
          })}
        </g>}
        <ChartSelectionColumn x={x(selectedIndex)} date={selected} column={{ left: x(selectedIndex) - slot / 2, right: x(selectedIndex) + slot / 2 }}
          plot={{ left, right, top, bottom: weightBottom }} resetKey={[w, height, scope].join(":")} direct={selection.direct} rangeMotion />
        <g data-overview-panel="energy">
          {spacedTicks(balanceScale, balanceBottom - top).map(tick => <g key={tick} data-axis-tick={tick}>
            <line data-range-mark={"balance-axis:" + tick} x1={left} x2={right} y1={balanceY(tick)} y2={balanceY(tick)}
              data-balance-zero={tick === 0 ? "" : undefined} className={tick === 0 ? styles.zeroLine : styles.grid} />
            <text data-range-mark={"balance-tick:" + tick} x={left - axisGap} y={balanceY(tick) + 4} textAnchor="end" className={styles.axis}>{tick}</text>
          </g>)}
          {hasPartialEnergy && <g data-overview-coverage>
            <rect data-range-mark="coverage-background" x={left} y={coverageTop} width={right - left} height={coverageHeight} rx="2" className={styles.balanceCoverage} />
            <text data-range-mark="coverage-label" x={left - axisGap} y={coverageY + 4} textAnchor="end" className={styles.axis}>未计</text>
          </g>}
          <g className={styles.plotData}>
            {entries.map(({ day, recorded }, index) => {
              if (day.energyBalance === 0) return balanceMark(day, index, 0);
              if (!recorded || day.energyBalance !== null) return null;
              const center = x(index);
              return <line key={day.date} data-range-mark={"coverage:" + day.date} data-plot-date={day.date} data-balance-coverage="" data-selected={day.date === selected}
                x1={center - coverageWidth / 2} x2={center + coverageWidth / 2}
                y1={coverageY} y2={coverageY} className={styles.coverageMark} />;
            })}
          </g>
          <g data-chart-grow-from={canGrow && entries.some(({ day }) => day.energyBalance) ? balanceZero : undefined} className={styles.plotData}>
            {entries.map(({ day }, index) => day.energyBalance ? balanceMark(day, index, day.energyBalance) : null)}
          </g>
          {!hasEnergy && <text x={(left + right) / 2} y={(top + balanceBottom) / 2} textAnchor="middle" className={styles.emptyPlot}>此区间暂无热量记录</text>}
        </g>
        <g data-overview-panel="weight">
          <text data-weight-readout x={right} y={weightTop - (compact ? 5 : 10)} textAnchor="end" className={styles.axis}>
            {compact ? shortDate(entry.day.nextDate) + " " : ""}次晨变化：{entry.day.ambiguous ? "待核对" : entry.day.weightChangeKg === null ? "未配对" : signedRecordNumber(entry.day.weightChangeKg) + " kg"}
          </text>
          {spacedTicks(weightScale, weightBottom - weightTop).map(tick => <g key={tick} data-axis-tick={tick}>
            <line data-range-mark={"weight-axis:" + tick} data-overview-zero={tick === 0 ? "" : undefined} x1={left} x2={right} y1={weightY(tick)} y2={weightY(tick)}
              className={tick === 0 ? styles.zeroLine : styles.grid} />
            <text data-range-mark={"weight-tick:" + tick} x={left - axisGap} y={weightY(tick) + 4} textAnchor="end" className={styles.axis}>{weightTick(tick)}</text>
          </g>)}
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
        bottom: height - tipBottom + (compact ? 6 : 10),
      }} />}
    </div>
  </div>;
}
