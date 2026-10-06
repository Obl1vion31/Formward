import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMeasurementTime } from "./time";
import { assignMeasurement } from "./assignment";

test("相同当地钟点在不同测量地具有相同归属、不同 UTC 时刻", () => {
  const local = "2025-07-10 01:15:00";
  assert.equal(resolveMeasurementTime(local, "Asia/Shanghai").occurredAt?.toISOString(), "2025-07-09T17:15:00.000Z");
  assert.equal(resolveMeasurementTime(local, "America/New_York").occurredAt?.toISOString(), "2025-07-10T05:15:00.000Z");
  assert.equal(assignMeasurement(local).analysisDate, "2025-07-09");
  assert.equal(resolveMeasurementTime(local, "America/Los_Angeles").utcOffsetMinutes, -420);
});

test("时区未知保留空值，不伪造 UTC；无效时区与偏移被拒绝", () => {
  assert.equal(resolveMeasurementTime("2025-05-10 12:00:00", null).occurredAt, null);
  assert.throws(() => resolveMeasurementTime("2025-05-10 12:00:00", "invalid-zone"));
  assert.throws(() => resolveMeasurementTime("2025-05-10 12:00:00", "Asia/Shanghai", 0));
  assert.throws(() => resolveMeasurementTime("2025-05-10 12:00:00", null, 480));
});

test("夏令时跳过的钟点拒绝，重复钟点须明确来源偏移", () => {
  assert.throws(() => resolveMeasurementTime("2025-03-09 02:30:00", "America/New_York"));
  assert.throws(() => resolveMeasurementTime("2025-11-02 01:30:00", "America/New_York"));
  assert.equal(resolveMeasurementTime("2025-11-02 01:30:00", "America/New_York", -240).occurredAt?.toISOString(), "2025-11-02T05:30:00.000Z");
  assert.equal(resolveMeasurementTime("2025-11-02 01:30:00", "America/New_York", -300).occurredAt?.toISOString(), "2025-11-02T06:30:00.000Z");
});
