import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChartRanges } from "@/components/chart-ranges";
import { PlotLoadingGuides } from "@/components/chart-preparation";
import { OverviewLegend } from "@/components/chart-legend";
import { signedRecordNumber } from "@/components/number-format";
import { addCalendarDays } from "../measurements/calendar";
import { BalanceReading } from "./day-readout";
import { morningChangeReading, shortDate } from "./day-readings";
import type { OverviewDay, OverviewWeek } from "./model";
import { relationshipFrame } from "./relationship-frame";
import styles from "./overview.module.css";

export function OverviewPlotLoadingGuides({ left = 52 }: { left?: number }) {
  const { top, energyBottom, weightTop, weightBottom, height } = relationshipFrame(false);
  return <>
    <PlotLoadingGuides desktopOnly top={top} bottom={height - energyBottom} left={left} right={13}/>
    <PlotLoadingGuides desktopOnly top={weightTop} bottom={height - weightBottom} left={left} right={13}/>
  </>;
}

function positionStatistics(button: HTMLButtonElement, panel: HTMLDivElement) {
  const edge = 12;
  const gap = 6;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(340, viewportWidth - 2 * edge);
  const anchor = button.getBoundingClientRect();
  const above = Math.max(0, anchor.top - gap - edge);
  const below = Math.max(0, viewportHeight - anchor.bottom - gap - edge);
  const opensAbove = below < 140 && above > below;
  panel.style.setProperty("--statistics-width", width + "px");
  panel.style.setProperty("--statistics-left", Math.max(edge, Math.min(anchor.right - width, viewportWidth - edge - width)) + "px");
  panel.style.setProperty("--statistics-top", opensAbove ? "auto" : anchor.bottom + gap + "px");
  panel.style.setProperty("--statistics-bottom", opensAbove ? viewportHeight - anchor.top + gap + "px" : "auto");
  panel.style.setProperty("--statistics-max-height", (opensAbove ? above : below) + "px");
}

export function OverviewTrendLayout({ date, day, range, mobileRange, mobile, changeRange, view, custom, children }: {
  date: string;
  day?: OverviewDay;
  range: string;
  mobileRange?: string;
  mobile?: boolean | null;
  changeRange: (range: string) => void;
  view?: () => void;
  custom?: ReactNode;
  children: ReactNode;
}) {
  const pending = !view;
  const statisticsId = useId();
  const statisticsButton = useRef<HTMLButtonElement>(null);
  const statisticsPanel = useRef<HTMLDivElement>(null);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  useEffect(() => {
    const button = statisticsButton.current;
    const panel = statisticsPanel.current;
    if (!mobile || !statisticsOpen || !button || !panel) return;
    const reposition = () => {
      const anchor = button.getBoundingClientRect();
      if (anchor.bottom <= 0 || anchor.top >= window.innerHeight) {
        if (panel.matches(":popover-open")) panel.hidePopover();
        return;
      }
      positionStatistics(button, panel);
    };
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [mobile, statisticsOpen]);
  const coverage = day?.week?.coveredDays;
  return <>
    <div className={styles.overviewRanges} data-overview-range>
      {mobileRange && mobileRange !== range ? <>
        <div className="mobile-only"><ChartRanges className={styles.overviewRangeButtons} value={mobileRange} change={changeRange} loading={pending}/></div>
        <div className="desktop-only"><ChartRanges value={range} change={changeRange} loading={pending}/></div>
      </> : <ChartRanges className={styles.overviewRangeButtons} value={range} change={changeRange} loading={pending}/>}
      <button type="button" ref={statisticsButton} className={styles.statisticsButton} data-overview-statistics-trigger disabled={pending || !mobile}
        popoverTarget={statisticsId} aria-controls={statisticsId} aria-expanded={!!mobile && statisticsOpen}
        onClick={event => { if (statisticsPanel.current) positionStatistics(event.currentTarget, statisticsPanel.current); }}>
        统计
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
    {custom}
    <div id={statisticsId} ref={statisticsPanel} className={styles.statisticsPanel} data-overview-statistics
      popover={mobile ? "auto" : undefined} onToggle={event => setStatisticsOpen(event.newState === "open")}>
      <OverviewComparison date={date} day={day} pending={pending} mobile={!!mobile}/>
      {mobile && coverage !== undefined && coverage < 7 && <p className={styles.statisticsBasis}>已计 {coverage}/7 天</p>}
    </div>
    <div className={styles.overviewToolbar} data-overview-toolbar>
      <div className={styles.overviewLegend} data-overview-legend><OverviewLegend/><span>千卡</span></div>
      <button type="button" disabled={pending || !date} onClick={view}>查看记录 →</button>
    </div>
    <div data-overview-plot>{children}</div>
  </>;
}

function OverviewComparison({ date, day, pending, mobile }: { date: string; day?: OverviewDay; pending: boolean; mobile: boolean }) {
  const week = day?.week;
  const from = week?.from ?? (date ? addCalendarDays(date, -6) : "");
  const missing = week?.missingMorningDates ?? [];
  const weekWeightStatus = missing.length > 1 ? "缺首尾晨重"
    : missing.length === 1 ? "缺 " + shortDate(missing[0]) + " 晨重" : "晨重待核对";
  const weekDates = <span className={styles.comparisonDates}>{from && date
    ? <><time dateTime={from}>{shortDate(from)}</time>—<time dateTime={date}>{shortDate(date)}</time></> : "—"}</span>;
  return <div className={styles.overviewComparison} role="group" aria-label="日期对照" data-selected-date={date} data-overview-comparison>
    <div className={styles.comparisonRow} data-overview-day>
      <div className={styles.comparisonPeriod}>
        <span>当日</span><time className={styles.comparisonDates} dateTime={date || undefined} title={date || undefined}>{date ? shortDate(date) : "—"}</time>
      </div>
      <div data-overview-day-energy><ComparisonBalance balance={day?.energyBalance ?? null} pending={pending}/></div>
      <div data-overview-day-weight>
        <ComparisonWeight label="次晨" value={day?.weightChangeKg ?? null} status={day ? morningChangeReading(day) : "无晨重记录"} pending={pending}/>
      </div>
    </div>
    <div className={styles.comparisonRow} data-overview-week>
      {week && !mobile ? <WeekCoverage week={week}>{weekDates}</WeekCoverage>
        : <div className={styles.comparisonPeriod}><span>近 7 天</span>{weekDates}</div>}
      <div data-overview-week-energy><ComparisonBalance balance={week?.energyBalance ?? null} pending={pending}/></div>
      <div data-overview-week-weight>
        <ComparisonWeight label="体重" value={week?.weightChangeKg ?? null} status={week ? weekWeightStatus : "无晨重记录"} pending={pending}/>
      </div>
    </div>
  </div>;
}

function WeekCoverage({ week, children }: { week: OverviewWeek; children: ReactNode }) {
  const id = useId();
  const note = useRef<HTMLDivElement>(null);
  const preview = useRef(false);
  function position(button: HTMLButtonElement, panel: HTMLDivElement) {
    const box = button.getBoundingClientRect();
    const width = Math.min(224, window.innerWidth - 32);
    panel.style.width = width + "px";
    panel.style.left = Math.max(16, Math.min(box.left, window.innerWidth - width - 16)) + "px";
    const below = box.bottom + 72 <= window.innerHeight;
    panel.style.top = below ? box.bottom + "px" : "auto";
    panel.style.bottom = below ? "auto" : window.innerHeight - box.top + "px";
  }
  function stopPreview(related: EventTarget | null) {
    if (preview.current && note.current && !(related instanceof Node && note.current.contains(related))) {
      preview.current = false;
      note.current.hidePopover();
    }
  }
  return <div>
    <button type="button" className={styles.comparisonInfo} popoverTarget={id} aria-label="近 7 天收支计算依据"
      onClick={event => { preview.current = false; if (note.current) position(event.currentTarget, note.current); }}
      onPointerEnter={event => {
        const panel = note.current;
        if (event.pointerType !== "mouse" || !panel || panel.matches(":popover-open")) return;
        position(event.currentTarget, panel);
        preview.current = true;
        panel.showPopover();
      }}
      onPointerLeave={event => stopPreview(event.relatedTarget)}>
      <span className={styles.comparisonInfoLabel}>近 7 天 <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25"/><path d="M8 7.1v4.15M8 4.7v.9"/>
      </svg></span>{children}
    </button>
    <div id={id} ref={note} popover="auto" className={styles.coveragePopover} data-overview-week-basis onPointerLeave={event => stopPreview(event.relatedTarget)}>
      已计 {week.coveredDays}/7 天
      <p>周收支合计只包含可计算的日期。</p>
    </div>
  </div>;
}

function ComparisonBalance({ balance, pending }: { balance: number | null; pending: boolean }) {
  return <div className={styles.comparisonValue} data-tone={balance === null || balance === 0 ? undefined : balance < 0 ? "deficit" : "surplus"}>
    {pending ? <>收支 <span>—</span></> : <BalanceReading balance={balance}/>}
  </div>;
}

function ComparisonWeight({ label, value, status, pending }: { label: string; value: number | null; status: string; pending: boolean }) {
  return <div className={styles.comparisonValue}>
    {label} {pending ? <span>—</span> : value === null || value === 0 ? <span>{value === 0 ? "无变化" : status}</span>
      : <span className={styles.comparisonAmount}><b>{signedRecordNumber(value)}</b> <small>kg</small></span>}
  </div>;
}
