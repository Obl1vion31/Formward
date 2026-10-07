import assert from "node:assert/strict";
import { test } from "node:test";
import { measurementCalendarPage, measurementCalendarRange } from "./calendar";
import { recentMeasurementDays } from "./days";

test("日历从账号、已有记录或已保存日期中的最早日补齐，保留已有日期", () => {
  assert.deepEqual(measurementCalendarRange("2025-03-04", "2025-03-01", ["2025-03-03"], []), { start: "2025-03-01", end: "2025-03-04" });
  assert.deepEqual(measurementCalendarRange("2025-03-04", "2025-03-01", ["2025-02-27"], ["2024-02-29"]), { start: "2024-02-29", end: "2025-03-04" });
  assert.deepEqual(measurementCalendarRange("2025-03-04", "2025-03-01", [], []), { start: "2025-03-01", end: "2025-03-04" });
});

test("无测量账号、跨月与闰年只推导空行，不生成读数", () => {
  const days = recentMeasurementDays([], { start: "2024-02-27", end: "2024-03-02" });
  assert.deepEqual(days.map(day => day.date), ["2024-03-02", "2024-03-01", "2024-02-29", "2024-02-28", "2024-02-27"]);
  assert.ok(days.every(day => !day.records.length && day.daytimeRecord === null && day.eveningRecord === null && day.weightDifferenceKg === null));
});

test("历史按 50 日期分页，边界没有重复或漏日，极长区间仅生成当前批次", () => {
  const interval = { start: "2024-01-01", end: "2024-04-15" };
  const pages = [0, 50, 100].map(offset => measurementCalendarPage(interval, 50, offset));
  assert.deepEqual(pages.map(page => page.length), [50, 50, 6]);
  const all = pages.flat();
  assert.equal(new Set(all).size, 106);
  assert.equal(all[0], interval.end); assert.equal(all.at(-1), interval.start);
  assert.deepEqual(measurementCalendarPage(interval, 50, 150), []);
  assert.equal(measurementCalendarPage({ start: "1000-01-01", end: "9999-12-31" }, 50).length, 50);
  assert.deepEqual(measurementCalendarPage({ start: "2025-03-04", end: "2025-03-01" }, 10), []);
});
