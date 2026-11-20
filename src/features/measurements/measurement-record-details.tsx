import {DailyRecordRow} from "@/components/daily-records";
import {formatRecordNumber} from "@/components/number-format";
import {displayRecordDate} from "@/components/record-dates";
import {useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent} from "react";
import {trackPopoverPosition} from "@/components/anchored-popover";
import {measurementDayAction, type EntryPeriod, type MeasurementDisplay} from "./entry-state";
import {gmtOffsetLabel, timezoneLabel} from "./timezone";
import styles from "./measurements-view.module.css";

export function MeasurementReading({row, period, showFat}: {
  row: MeasurementDisplay | null; period: EntryPeriod; showFat: boolean;
}) {
  const value = row?.weightKg != null
    ? {number: row.weightKg, unit: "kg", label: "体重"}
    : showFat && row?.bodyFatPercent != null
      ? {number: row.bodyFatPercent, unit: "%", label: "体脂率"}
      : null;
  return <div className={styles.periodReading} data-reading-period={period}>
    <span>{period === "evening" ? "晚间" : row && row.fasting !== true ? "白天" : "晨间"}</span>
    {value
      ? <strong className={period === "daytime" ? styles.dayValue : styles.nightValue} title={value.label}>
        {formatRecordNumber(value.number)} <small>{value.unit}</small>
      </strong>
      : <span>{row ? "已记录" : "未记录"}</span>}
  </div>;
}

export function MeasurementFacts({row, showFat, labeled = false}: {row: MeasurementDisplay; showFat: boolean; labeled?: boolean}) {
  const preciseTime = row.timePrecision === "second" ? row.sourceLocalTime : "";
  const [localDate, clock] = preciseTime.split(/[ T]/);
  const time = clock ? (localDate === row.recordDate ? "" : displayRecordDate(localDate) + " ") + clock.replace(/:00$/, "") : "";
  const zone = (row.timezone
    ? row.timezoneLabel ?? timezoneLabel(row.timezone, row.recordDate, row.utcOffsetMinutes)
    : row.utcOffsetMinutes != null ? gmtOffsetLabel(row.utcOffsetMinutes) : "").replace(/（[^）]+）/g, "");
  const source = row.deviceLabel || row.sourceSystem || (row.entryChannel === "development_backend" ? "维护录入"
    : row.entryChannel === "manual" || row.sourceType === "manual" ? "手动录入"
    : row.entryChannel === "api" ? "外部录入" : row.sourceType === "import" ? "导入 · 来源系统未提供" : row.sourceType);

  return <dl className={styles.measurementFacts} data-fact-period={row.period} aria-label={row.period === "evening" ? "晚间测量信息" : row.fasting ? "晨间测量信息" : "白天测量信息"}>
    <div><dt>来源</dt><dd data-measurement-source>{source}</dd></div>
    {labeled ? <>
      {zone && <div><dt>时区</dt><dd>{zone}</dd></div>}
      {time && <div><dt>时间</dt><dd>{time}</dd></div>}
    </> : (time || zone) && <div className={styles.factTime}>
      <dt>{time ? "测量时间" : "时区"}</dt>
      <dd>{[time, zone].filter(Boolean).join(" · ")}</dd>
    </div>}
    {showFat && row.weightKg != null && row.bodyFatPercent != null &&
      <div><dt>体脂</dt><dd>{formatRecordNumber(row.bodyFatPercent)}%</dd></div>}
    {row.sourceSystem && row.sourceSystem !== source && <div><dt>来源系统</dt><dd>{row.sourceSystem}</dd></div>}
  </dl>;
}

function MeasurementInfo({id, date, morning, evening, showFat}: {
  id: string; date: string; morning: MeasurementDisplay | null; evening: MeasurementDisplay | null; showFat: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const openedByHover = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useLayoutEffect(() => {
    if (open && trigger.current && panel.current) {
      return trackPopoverPosition(panel.current, trigger.current, {width: 308, align: "end"});
    }
  }, [open]);

  function openOnHover(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    const popover = panel.current;
    if (!popover || popover.matches(":popover-open")) return;
    openedByHover.current = true;
    popover.showPopover();
  }

  function closeAfterHover(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || !openedByHover.current) return;
    window.clearTimeout(closeTimer.current);
    // Allow the pointer to cross the gap between the icon and the popover.
    closeTimer.current = window.setTimeout(() => {
      if (openedByHover.current) panel.current?.hidePopover();
    }, 160);
  }

  return <>
    <button ref={trigger} type="button" className={styles.recordInfoButton}
      aria-label={"测量来源 " + date} aria-expanded={open} aria-controls={id} popoverTarget={id}
      onPointerEnter={openOnHover} onPointerLeave={closeAfterHover}
      onClick={event => event.currentTarget.focus({preventScroll: true})}>
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25"/><path d="M8 7.1v4.15M8 4.7v.9"/>
      </svg>
    </button>
    <section id={id} ref={panel} role="group" aria-label={displayRecordDate(date) + "测量来源"}
      popover="auto" className={styles.infoPopover} data-body-row-details
      onPointerEnter={event => {
        if (event.pointerType === "mouse") window.clearTimeout(closeTimer.current);
      }}
      onPointerLeave={closeAfterHover}
      onToggle={event => {
        const visible = event.currentTarget.matches(":popover-open");
        if (!visible) {
          openedByHover.current = false;
          window.clearTimeout(closeTimer.current);
        }
        setOpen(visible);
      }}>
      {morning && <section><h3>{morning.fasting ? "晨间" : "白天"}</h3><MeasurementFacts row={morning} showFat={showFat} labeled/></section>}
      {evening && <section><h3>晚间</h3><MeasurementFacts row={evening} showFat={showFat} labeled/></section>}
    </section>
  </>;
}

export function BodyRecordRow({date, today, records, morning, evening, showFat, onEntry}: {
  date: string; today: string; records: MeasurementDisplay[];
  morning: MeasurementDisplay | null; evening: MeasurementDisplay | null;
  showFat: boolean;
  onEntry: (editing: boolean, period: EntryPeriod) => void;
}) {
  const action = measurementDayAction(records, date, today);
  const infoId = useId();
  return <DailyRecordRow layout="body" date={date} today={today} value={<>
    <MeasurementReading row={morning} period="daytime" showFat={showFat}/>
    <MeasurementReading row={evening} period="evening" showFat={showFat}/>
  </>}>
    {(morning || evening) && <MeasurementInfo id={infoId} date={date} morning={morning} evening={evening} showFat={showFat}/>}
    <button type="button" className={styles.recordEditAction} data-record-action="edit" aria-label={action + " " + date}
      onClick={event => {
        const info = document.getElementById(infoId);
        if (info?.matches(":popover-open")) info.hidePopover();
        event.currentTarget.focus({preventScroll: true});
        onEntry(action === "编辑", !morning && evening ? "evening" : "daytime");
      }}><span>{action}</span></button>
  </DailyRecordRow>;
}
