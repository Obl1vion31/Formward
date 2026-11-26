import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChartRanges } from "@/components/chart-ranges";
import { OverviewLegend } from "@/components/chart-legend";
import { signedRecordNumber } from "@/components/number-format";
import { addCalendarDays } from "../measurements/calendar";
import { BalanceReading } from "./day-readout";
import { missingBalanceReason, morningChangeReading, shortDate } from "./day-readings";
import type { OverviewDay } from "./model";
import styles from "./overview.module.css";

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

export function OverviewTrendLayout({ date, day, range, mobile, changeRange, view, custom, children }: {
  date: string;
  day?: OverviewDay;
  range: string;
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
    if (!statisticsOpen || !button || !panel) return;
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
  }, [statisticsOpen]);
  const coverage = day?.week?.coveredDays;
  return <>
    <div className={styles.overviewRanges} data-overview-range>
      <ChartRanges className={styles.overviewRangeButtons} value={range} change={changeRange} loading={pending}/>
      <button type="button" ref={statisticsButton} className={styles.statisticsButton} data-overview-statistics-trigger disabled={pending}
        popoverTarget={statisticsId} aria-controls={statisticsId} aria-expanded={statisticsOpen}
        onClick={event => { if (statisticsPanel.current) positionStatistics(event.currentTarget, statisticsPanel.current); }}>
        统计
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
    {custom}
    {mobile!==true&&<div className="desktop-only"><div className={styles.overviewComparison} aria-label="选中日读数" data-selected-date={date} data-overview-comparison><SelectedDayRow date={date} day={day} pending={pending}/></div></div>}
    <div id={statisticsId} ref={statisticsPanel} className={styles.statisticsPanel} data-overview-statistics
      popover="auto" onToggle={event => setStatisticsOpen(event.newState === "open")}>
      <OverviewComparison date={date} day={day} pending={pending} mobile={!!mobile}/>
      {coverage !== undefined && coverage < 7 && <p className={styles.statisticsBasis}>已计 {coverage}/7 天</p>}
    </div>
    <div className={styles.overviewToolbar} data-overview-toolbar>
      <div className={styles.overviewLegend} data-overview-legend><OverviewLegend/><span>千卡</span></div>
      <button type="button" disabled={pending || !date} onClick={view}>查看记录 →</button>
    </div>
    <div data-overview-plot>{children}</div>
    {!pending&&<div className={styles.phoneReadout}>
      <button type="button" disabled={pending||!date} onClick={view} aria-label={date?"查看 "+date+" 当日记录":"查看当日记录"}>
        <strong>{date?shortDate(date):"—"}</strong>
        <span><span>当天收支 <ComparisonBalance balance={day?.energyBalance??null} pending={pending} reason={day&&missingBalanceReason(day)}/></span>
          <span><ComparisonWeight label="次晨" value={day?.weightChangeKg??null} status={day?morningChangeReading(day):"无晨重记录"} pending={pending}/></span></span>
        <span aria-hidden="true">›</span>
      </button>
    </div>}
  </>;
}

function SelectedDayRow({date,day,pending}:{date:string;day?:OverviewDay;pending:boolean}){
  if (pending && !date) return <div className={styles.comparisonRow} data-overview-day aria-busy="true"/>;
  return <div className={styles.comparisonRow} data-overview-day>
    <div className={styles.comparisonPeriod}><span>选中</span><time className={styles.comparisonDates} dateTime={date||undefined} title={date||undefined}>{date?shortDate(date):"—"}</time></div>
    <div data-overview-day-energy><ComparisonBalance balance={day?.energyBalance??null} pending={pending} reason={day&&missingBalanceReason(day)}/></div>
    <div data-overview-day-weight><ComparisonWeight label="次晨" value={day?.weightChangeKg??null} status={day?morningChangeReading(day):"无晨重记录"} pending={pending}/></div>
  </div>;
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
    {mobile&&<SelectedDayRow date={date} day={day} pending={pending}/>}
    <div className={styles.comparisonRow} data-overview-week>
      <div className={styles.comparisonPeriod}><span>近 7 天</span>{weekDates}</div>
      <div data-overview-week-energy><ComparisonBalance balance={week?.energyBalance ?? null} pending={pending}/></div>
      <div data-overview-week-weight>
        <ComparisonWeight label="体重" value={week?.weightChangeKg ?? null} status={week ? weekWeightStatus : "无晨重记录"} pending={pending}/>
      </div>
    </div>
  </div>;
}

function ComparisonBalance({ balance, pending, reason }: { balance: number | null; pending: boolean; reason?: string }) {
  return <span className={styles.comparisonValue} data-tone={balance === null || balance === 0 ? undefined : balance < 0 ? "deficit" : "surplus"}>
    {pending ? "—" : reason ?? <BalanceReading balance={balance}/>}
  </span>;
}

function ComparisonWeight({ label, value, status, pending }: { label: string; value: number | null; status: string; pending: boolean }) {
  return <span className={styles.comparisonValue}>
    {label} {pending ? <span>—</span> : value === null || value === 0 ? <span>{value === 0 ? "无变化" : status}</span>
      : <span className={styles.comparisonAmount}><b>{signedRecordNumber(value)}</b> <small>kg</small></span>}
  </span>;
}
