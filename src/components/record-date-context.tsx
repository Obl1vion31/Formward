"use client";
import { useLocalToday } from "./use-local-today";
import { recordDateLabel } from "./record-dates";
export function RecordDateContext({ date, openedOn }: { date: string; openedOn: string }) {
  const today = useLocalToday(openedOn);
  return <p className="record-date-context" aria-live="polite"><strong>{recordDateLabel(date, today)}</strong>{date < today && <span> · 补录</span>}{today !== openedOn && <span> · 已跨零点，这份记录仍保存到 {date}</span>}</p>;
}
