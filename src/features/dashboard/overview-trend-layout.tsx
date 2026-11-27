import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChartRanges } from "@/components/chart-ranges";
import { OverviewLegend } from "@/components/chart-legend";
import { formatIntegerNumber, formatRecordNumber, signedRecordNumber } from "@/components/number-format";
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

export function OverviewTrendLayout({ date, day, today, range, changeRange, view, custom, children }: {
  date: string;
  day?: OverviewDay;
  range: string;
  today?: string;
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
    <SelectedDayRow date={date} day={day} today={today} view={view} pending={pending}/>
    <div id={statisticsId} ref={statisticsPanel} className={styles.statisticsPanel} data-overview-statistics
      popover="auto" onToggle={event => setStatisticsOpen(event.newState === "open")}>
      <OverviewComparison date={date} day={day} pending={pending}/>
      {coverage !== undefined && coverage < 7 && <p className={styles.statisticsBasis}>已计 {coverage}/7 天</p>}
    </div>
    <div className={styles.overviewToolbar} data-overview-toolbar data-guide-flow>
      <div className={styles.overviewLegend} data-overview-legend><OverviewLegend/><span>千卡</span></div>

    </div>
    <div data-overview-plot data-guide-target="overview-trend" data-guide-flow>{children}</div>

  </>;
}

function SelectedDayRow({date, day, today, view, pending}:{date:string;day?:OverviewDay;today?:string;view?:()=>void;pending:boolean}) {
  const balance = day?.energyBalance ?? null;
  const weight = day?.weightChangeKg ?? null;
  const intake = day?.nutrition?.values.caloriesKcal ?? null;
  const expenditure = day?.energy.totalKcal ?? null;
  const weightPair = day?.morning?.weightKg != null && day.nextMorning?.weightKg != null && !day.ambiguous;
  const [year, month, dateOfMonth] = date.split("-").map(Number);
  const label = year ? month + "月" + dateOfMonth + "日" : "选中日期";
  return <section className={styles.selectedDay} data-overview-comparison data-overview-day data-selected-date={date}
    aria-label="选中日读数" aria-busy={pending || undefined}>
    <time className={styles.selectedDate} dateTime={date || undefined}>{label}</time>
    <div className={styles.selectedMetric} data-overview-day-energy>
      <span className={styles.metricLabel}>当天热量</span>
      <ComparisonBalance balance={balance} pending={pending} reason={day&&missingBalanceReason(day)}/>
      <span className={styles.metricDetail}>
        {!pending && (intake!==null || expenditure!==null) && <>
          <span>{day?.mealDayStatus==="complete"&&!day.nutrition?.incomplete.caloriesKcal?"摄入":"已记摄入"} {day?.displayEnergy?.intake??formatIntegerNumber(intake)}</span>
          <span>{day?.energy.cumulative?"消耗累计":"消耗"} {day?.displayEnergy?.expenditure??formatIntegerNumber(expenditure)}</span>
        </>}
      </span>
    </div>
    <div className={styles.selectedMetric} data-overview-day-weight>
      <span className={styles.metricLabel}>次晨体重</span>
      <span className={styles.comparisonValue}>{pending ? "—" : weight === null
        ? (today && date>=today ? "次晨未到" : day ? morningChangeReading(day) : "无晨重记录")
        : weight === 0 ? "持平" : <b aria-label={(weight<0?"下降 ":"上升 ")+formatRecordNumber(Math.abs(weight))+" kg"}>
          {weight<0?"↓":"↑"} {formatRecordNumber(Math.abs(weight))} <small>kg</small>
        </b>}</span>
      <span className={styles.metricDetail}>{!pending&&weightPair&&<> {formatRecordNumber(day.morning!.weightKg)} → {formatRecordNumber(day.nextMorning!.weightKg)} kg</>}</span>
    </div>
    <button type="button" className={styles.selectedRecord} data-guide-target="overview-record" disabled={pending||!date} onClick={view}>查看记录 <span aria-hidden="true">›</span></button>
  </section>;
}

function OverviewComparison({ date, day, pending }: { date: string; day?: OverviewDay; pending: boolean }) {
  const week = day?.week;
  const from = week?.from ?? (date ? addCalendarDays(date, -6) : "");
  const missing = week?.missingMorningDates ?? [];
  const weekWeightStatus = missing.length > 1 ? "缺首尾晨重"
    : missing.length === 1 ? "缺 " + shortDate(missing[0]) + " 晨重" : "晨重待核对";
  const weekDates = <span className={styles.comparisonDates}>{from && date
    ? <><time dateTime={from}>{shortDate(from)}</time>—<time dateTime={date}>{shortDate(date)}</time></> : "—"}</span>;
  return <div className={styles.overviewComparison} role="group" aria-label="日期对照" data-selected-date={date} data-overview-comparison>
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
