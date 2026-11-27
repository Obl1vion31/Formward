import type { ReactNode } from "react";
import { ChartRanges } from "@/components/chart-ranges";
import { OverviewLegend } from "@/components/chart-legend";
import { formatRecordNumber } from "@/components/number-format";
import { addCalendarDays } from "../measurements/calendar";
import { BalanceReading } from "./day-readout";
import { missingBalanceReason, morningChangeReading, shortDate } from "./day-readings";
import type { OverviewDay } from "./model";
import styles from "./overview.module.css";

export function OverviewTrendLayout({ date, day, today, range, changeRange, view, custom, children }: {
  date: string;
  day?: OverviewDay;
  today?: string;
  range: string;
  changeRange: (range: string) => void;
  view?: () => void;
  custom?: ReactNode;
  children: ReactNode;
}) {
  const pending = !view;
  return <>
    <div className={styles.overviewRanges} data-overview-range>
      <ChartRanges className={styles.overviewRangeButtons} value={range} change={changeRange} loading={pending}/>
    </div>
    {custom}
    <div className={styles.overviewToolbar} data-overview-toolbar data-guide-flow>
      <div className={styles.overviewLegend} data-overview-legend><OverviewLegend/><span>千卡</span></div>
    </div>
    <div data-overview-plot data-guide-target="overview-trend" data-guide-flow>{children}</div>
    <div className={styles.chartReadings} data-overview-readings>
      <SelectedDayRow date={date} day={day} today={today} view={view} pending={pending}/>
      <WeekRow date={date} week={day?.week} pending={pending}/>
    </div>
  </>;
}

function SelectedDayRow({ date, day, today, view, pending }: {
  date: string; day?: OverviewDay; today?: string; view?: () => void; pending: boolean;
}) {
  const morningStatus = today && date >= today ? "次晨未到" : day ? morningChangeReading(day) : "无晨重记录";
  return <section className={styles.selectedDay} data-overview-day data-selected-date={date}
    aria-label="选中日读数" aria-busy={pending || undefined}>
    <time dateTime={date || undefined}>{date ? shortDate(date) : "选中日期"}</time>
    <div data-overview-day-energy>
      <ComparisonBalance balance={day?.energyBalance ?? null} pending={pending} reason={day && missingBalanceReason(day)}/>
    </div>
    <div data-overview-day-weight>
      <WeightChange label="次晨" weight={day?.weightChangeKg ?? null} missing={pending ? "次晨 —" : morningStatus}/>
    </div>
    <button type="button" className={styles.selectedRecord} data-guide-target="overview-record"
      aria-label="查看记录" disabled={pending || !date} onClick={view}>
      查看<span className={styles.recordLongLabel}>记录</span><span aria-hidden="true"> ›</span>
    </button>
  </section>;
}

function WeekRow({ date, week, pending }: { date: string; week?: OverviewDay["week"]; pending: boolean }) {
  const from = week?.from ?? (date ? addCalendarDays(date, -6) : "");
  const missing = week?.missingMorningDates ?? [];
  const coverage = week?.coveredDays;
  const weightStatus = missing.length > 1 ? "缺首尾晨重"
    : missing.length === 1 ? "缺 " + shortDate(missing[0]) + " 晨重"
    : week ? "晨重待核对" : "无晨重记录";
  return <section className={styles.weekReading} aria-label="截至选中日的近 7 天读数" data-overview-week
    data-selected-date={date} aria-busy={pending || undefined}>
    <div className={styles.weekPeriod}>
      <span>近 7 天</span>
      {from && date && <span className={styles.weekDates}><time dateTime={from}>{shortDate(from)}</time>—<time dateTime={date}>{shortDate(date)}</time></span>}
    </div>
    <div className={styles.weekEnergy} data-overview-week-energy>
      <ComparisonBalance balance={week?.energyBalance ?? null} pending={pending}/>
      {coverage !== undefined && coverage < 7 && <small className={styles.weekCoverage}>计入 {coverage}/7 天</small>}
    </div>
    <div data-overview-week-weight>
      <WeightChange label="晨重" weight={week?.weightChangeKg ?? null} missing={pending ? "晨重 —" : weightStatus}/>
    </div>
  </section>;
}

function ComparisonBalance({ balance, pending, reason }: { balance: number | null; pending: boolean; reason?: string }) {
  return <span className={styles.comparisonValue} data-tone={balance === null || balance === 0 ? undefined : balance < 0 ? "deficit" : "surplus"}>
    {pending ? "—" : reason ?? <BalanceReading balance={balance}/>}
  </span>;
}

function WeightChange({ label, weight, missing }: { label: string; weight: number | null; missing: string }) {
  if (weight === null) return <span className={styles.comparisonValue}>{missing}</span>;
  if (weight === 0) return <span className={styles.comparisonValue}>{label}持平</span>;
  const value = formatRecordNumber(Math.abs(weight));
  return <span className={styles.comparisonValue}>
    {label} <b aria-label={(weight < 0 ? "下降 " : "上升 ") + value + " kg"}>{weight < 0 ? "↓" : "↑"}{value}</b> <small>kg</small>
  </span>;
}
