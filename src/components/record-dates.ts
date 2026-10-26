import { addCalendarDays, calendarOrdinal } from "@/features/measurements/calendar";

/** 只补界面日历空行，不生成任何健康事实。 */
export const recentRecordDates = (today: string, count = 7) => Array.from({ length: count }, (_, i) => addCalendarDays(today, -i));
export const recordDateLabel = (date: string, today: string) => !today ? date : `${date}${date === today ? " · 今天" : date === addCalendarDays(today, -1) ? " · 昨天" : ""}`;
export function rangeContaining(date: string, today: string, base: "7" | "30") {
  const distance = Math.max(1, calendarOrdinal(today) - calendarOrdinal(date) + 1);
  return [Number(base), 30, 90].find(days => days >= distance)?.toString() ?? "all";
}
export function preferredRecordedDate<T extends { date: string }>(rows: T[], today: string, complete: (row: T) => boolean, present: (row: T) => boolean) {
  const past = rows.filter(row => row.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  return past.find(complete)?.date ?? past.find(present)?.date ?? today;
}

/** 今天始终可见；前六天仅保留待处理日。 */
export function pendingRecordDates(today:string, pending:(date:string)=>boolean){return recentRecordDates(today).filter(date=>date===today||pending(date));}
