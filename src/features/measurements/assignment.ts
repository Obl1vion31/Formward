export type MeasurementPeriod = "daytime" | "evening";

export const ASSIGNMENT_RULE_VERSION = "06-18-v1";

export type MeasurementAssignment = {
  localDate: string;
  recordDate: string;
  period: MeasurementPeriod;
  assignmentMethod: "clock_rule" | "manual";
  assignmentRuleVersion: string;
};

/** 按来源的本地时间分组；不转换时区、不修改原始发生时间，也不推断空腹。 */
export function assignMeasurement(
  sourceLocalTime: string,
  override?: { recordDate: string; period: MeasurementPeriod },
): MeasurementAssignment {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(sourceLocalTime);
  if (!match) throw new Error("测量时间须包含有效日期和时分秒。");
  const [, localDate, hourText, minuteText, secondText] = match;
  const day = parseLocalDate(localDate);
  const hour = Number(hourText);
  if (hour > 23 || Number(minuteText) > 59 || Number(secondText) > 59) {
    throw new Error("测量时间超出有效范围。");
  }
  if (override) {
    parseLocalDate(override.recordDate);
    if (override.period !== "daytime" && override.period !== "evening") {
      throw new Error("测量时段须为白天或晚间。");
    }
    return {
      localDate, ...override, assignmentMethod: "manual", assignmentRuleVersion: ASSIGNMENT_RULE_VERSION,
    };
  }
  // UTC 仅用于纯日历减一天；这里的 Date 不代表实际测量的 UTC 时刻。
  const recordDate = hour < 6
    ? new Date(day.getTime() - 86_400_000).toISOString().slice(0, 10)
    : localDate;
  return {
    localDate, recordDate, period: hour < 6 || hour >= 18 ? "evening" : "daytime",
    assignmentMethod: "clock_rule", assignmentRuleVersion: ASSIGNMENT_RULE_VERSION,
  };
}

function parseLocalDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) {
    throw new Error("测量日期无效。");
  }
  const day = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value) {
    throw new Error("测量日期无效。");
  }
  return day;
}
