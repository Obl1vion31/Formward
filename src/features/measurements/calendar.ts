const DAY_MS = 86_400_000;

/** UTC 仅用于日历运算，避免时区和夏令时改变日数。 */
export function calendarOrdinal(date: string) {
  const stamp = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date) throw new Error("日期无效。");
  return stamp / DAY_MS;
}

export function addCalendarDays(date: string, offset: number) {
  return new Date((calendarOrdinal(date) + offset) * DAY_MS).toISOString().slice(0, 10);
}

/** 保留已有日期；漏记日期从账号、记录、已保存日期中最早一天补到今天。 */
export function measurementCalendarRange(today: string, accountDate: string, recordedDates: string[], savedDates: string[]) {
  const dates = [today, ...recordedDates, ...savedDates].filter(Boolean).sort();
  const starts = [...dates, accountDate].filter(Boolean).sort();
  return { start: starts[0] ?? "", end: dates.at(-1) ?? "" };
}

/** 只生成当前批次的日期，长历史不会一次创建所有空行。 */
export function measurementCalendarPage(interval: { start: string; end: string }, limit: number, offset = 0) {
  if (!interval.start || !interval.end || interval.start > interval.end) return [];
  const count = Math.max(0, Math.min(limit, calendarOrdinal(interval.end) - calendarOrdinal(interval.start) + 1 - offset));
  return Array.from({ length: count }, (_, index) => addCalendarDays(interval.end, -offset - index));
}
