import assert from "node:assert/strict";
import { test } from "node:test";
import { assignMeasurement } from "./assignment";

test("凌晨分界前属于前一天晚间，06:00 起属于当天白天", () => {
  assert.equal(assignMeasurement("2025-05-10 05:59:59").analysisDate, "2025-05-09");
  assert.equal(assignMeasurement("2025-05-10 05:59:59").period, "evening");
  assert.equal(assignMeasurement("2025-05-10 06:00:00").analysisDate, "2025-05-10");
  assert.equal(assignMeasurement("2025-05-10 06:00:00").period, "daytime");
});

test("中午仍为白天，18:00 起为当天晚间，保留真实日历日期", () => {
  assert.equal(assignMeasurement("2025-05-10 12:30:00").period, "daytime");
  assert.equal(assignMeasurement("2025-05-10 17:59:59").period, "daytime");
  const result = assignMeasurement("2025-05-11 00:10:00");
  assert.equal(result.localDate, "2025-05-11");
  assert.equal(result.analysisDate, "2025-05-10");
  assert.equal(assignMeasurement("2025-05-10 18:00:00").analysisDate, "2025-05-10");
  assert.equal(assignMeasurement("2025-05-10 18:00:00").period, "evening");
  assert.ok(!("fasting" in result), "归属规则不推断空腹状态");
});

test("跨月、跨年及闰日按真实日历退一天", () => {
  assert.equal(assignMeasurement("2025-01-01 00:10:00").analysisDate, "2024-12-31");
  assert.equal(assignMeasurement("2024-03-01 00:10:00").analysisDate, "2024-02-29");
  assert.equal(assignMeasurement("2025-03-01 00:10:00").analysisDate, "2025-02-28");
});

test("手动归属优先且记录方式，原始日期不被覆盖", () => {
  const result = assignMeasurement("2025-05-10 05:00:00", { analysisDate: "2025-05-10", period: "daytime" });
  assert.equal(result.analysisDate, "2025-05-10");
  assert.equal(result.localDate, "2025-05-10");
  assert.equal(result.period, "daytime");
  assert.equal(result.assignmentMethod, "manual");
});

test("无效日期、时间与手动归属被拒绝", () => {
  for (const value of ["", "2025-02-29 00:00:00", "2025-04-31 00:00:00", "2025-13-01 00:00:00", "2025-05-10 24:00:00", "2025-05-10 12:60:00", "2025-05-10 12:00:60", "2025-05-10"]) {
    assert.throws(() => assignMeasurement(value));
  }
  assert.throws(() => assignMeasurement("2025-05-10 12:00:00", { analysisDate: "2025-02-29", period: "daytime" }));
});
