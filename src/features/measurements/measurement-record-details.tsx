import {DailyRecordRow} from "@/components/daily-records";
import {formatRecordNumber} from "@/components/number-format";
import {displayRecordDate} from "@/components/record-dates";
import {useId} from "react";
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

export function MeasurementFacts({row, showFat}: {row: MeasurementDisplay; showFat: boolean}) {
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
    {showFat && row.weightKg != null && row.bodyFatPercent != null &&
      <div><dt>体脂</dt><dd>{formatRecordNumber(row.bodyFatPercent)}%</dd></div>}
    {(time || zone) && <div className={styles.factTime}>
      <dt>{time ? "测量时间" : "时区"}</dt>
      <dd>{[time, zone].filter(Boolean).join(" · ")}</dd>
    </div>}
    <div><dt>来源</dt><dd data-measurement-source>{source}</dd></div>
    {row.sourceSystem && row.sourceSystem !== source && <div><dt>来源系统</dt><dd>{row.sourceSystem}</dd></div>}
  </dl>;
}

export function BodyRecordRow({date, today, records, morning, evening, showFat, open, onToggle, onEntry}: {
  date: string; today: string; records: MeasurementDisplay[];
  morning: MeasurementDisplay | null; evening: MeasurementDisplay | null;
  showFat: boolean; open: boolean;
  onToggle: (trigger: HTMLButtonElement) => void;
  onEntry: (editing: boolean, period: EntryPeriod) => void;
}) {
  const detailsId = useId();
  const action = measurementDayAction(records, date, today);
  const hasRecord = !!(morning || evening);
  return <DailyRecordRow layout="body" date={date} today={today} value={<>
    <MeasurementReading row={morning} period="daytime" showFat={showFat}/>
    <MeasurementReading row={evening} period="evening" showFat={showFat}/>
  </>} disclosure={hasRecord && <button type="button" className={styles.detailsToggle}
    aria-expanded={open} aria-controls={detailsId} aria-label={(open ? "收起详情 " : "详情 ") + date}
    onClick={event => onToggle(event.currentTarget)}>
    {open ? "收起" : "详情"}
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
  </button>} details={hasRecord && <div id={detailsId} className={styles.rowDetails} data-body-row-details hidden={!open}>
    {open && <>
      {morning && <MeasurementFacts row={morning} showFat={showFat}/>}
      {evening && <MeasurementFacts row={evening} showFat={showFat}/>}
    </>}
  </div>}>
    <button type="button" data-record-action="edit" aria-label={action + " " + date}
      onClick={event => {
        event.currentTarget.focus({preventScroll: true});
        onEntry(action === "编辑", !morning && evening ? "evening" : "daytime");
      }}>{action}</button>
  </DailyRecordRow>;
}
