import { useId, useRef, type ReactNode } from "react";
import { ChartRanges } from "@/components/chart-ranges";
import { OverviewLegend } from "@/components/chart-legend";
import { signedRecordNumber } from "@/components/number-format";
import { addCalendarDays } from "../measurements/calendar";
import { BalanceReading } from "./day-readout";
import { morningChangeReading, shortDate } from "./day-readings";
import type { OverviewDay, OverviewWeek } from "./model";
import styles from "./overview.module.css";

export function OverviewTrendLayout({ date, day, range, mobileRange, changeRange, view, custom, children }: {
  date: string;
  day?: OverviewDay;
  range: string;
  mobileRange?: string;
  changeRange: (range: string) => void;
  view?: () => void;
  custom?: ReactNode;
  children: ReactNode;
}) {
  const pending = !view;
  return <>
    <div data-overview-range>
      {mobileRange && mobileRange !== range ? <>
        <div className="mobile-only"><ChartRanges value={mobileRange} change={changeRange} loading={pending}/></div>
        <div className="desktop-only"><ChartRanges value={range} change={changeRange} loading={pending}/></div>
      </> : <ChartRanges value={range} change={changeRange} loading={pending}/>}
    </div>
    {custom}
    <OverviewComparison date={date} day={day} pending={pending}/>
    <div className={styles.overviewToolbar} data-overview-toolbar>
      <div className={styles.overviewLegend} data-overview-legend><OverviewLegend/><span>千卡</span></div>
      <button type="button" disabled={pending || !date} onClick={view}>查看记录 →</button>
    </div>
    <div data-overview-plot>{children}</div>
  </>;
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
      {week ? <WeekCoverage week={week}>{weekDates}</WeekCoverage>
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
      : <><b>{signedRecordNumber(value)}</b> <small>kg</small></>}
  </div>;
}
