"use client";

import { useId, useState } from "react";
import { addCalendarDays, calendarOrdinal } from "@/features/measurements/calendar";
import styles from "./chart-date-controls.module.css";

/** 只选择当前图表区间内的日期，不创建记录或改变图表范围。 */
export function ChartDateControls({ value, min, max, onChange, label }: {
  value: string; min: string; max: string; onChange: (date: string) => void; label: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState({ base: value, value });
  if (draft.base !== value) setDraft({ base: value, value });
  function select(date: string) {
    try { calendarOrdinal(date); } catch { return; }
    if (date >= min && date <= max) onChange(date);
  }
  return <div className={styles.controls} role="group" aria-label={label}>
    <button type="button" aria-label={`${label}前一天`} disabled={value <= min} onClick={() => select(addCalendarDays(value, -1))}>前一天</button>
    <label className={styles.label} htmlFor={id}>{label}</label>
    <input id={id} aria-label={label} type="date" value={draft.base === value ? draft.value : value} min={min} max={max} onChange={event => { setDraft({ base: value, value: event.target.value }); select(event.target.value); }} onBlur={() => setDraft({ base: value, value })} />
    <button type="button" aria-label={`${label}后一天`} disabled={value >= max} onClick={() => select(addCalendarDays(value, 1))}>后一天</button>
  </div>;
}
