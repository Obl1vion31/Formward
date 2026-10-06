import { assignMeasurement } from "./assignment";

/** 解析每次测量的 IANA 时区；夏令时重复钟点须附原始偏移，缺失钟点拒绝。 */
export function resolveMeasurementTime(sourceLocalTime: string, timezone: string | null, utcOffsetMinutes?: number) {
  assignMeasurement(sourceLocalTime);
  if (timezone === null) {
    if (utcOffsetMinutes !== undefined) throw new Error("偏移量须与来源时区一起提供。");
    return { occurredAt: null, timezone: null, utcOffsetMinutes: null };
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    throw new Error("来源时区无效，须使用 IANA 时区名称。");
  }
  if (utcOffsetMinutes !== undefined && (!Number.isInteger(utcOffsetMinutes) || Math.abs(utcOffsetMinutes) > 840)) {
    throw new Error("来源 UTC 偏移量无效。");
  }
  const source = sourceLocalTime.replace("T", " ");
  const nominal = Date.parse(`${source.replace(" ", "T")}Z`);
  const format = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  };
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = nominal + hours * 3_600_000;
    offsets.add((Date.parse(`${format(probe).replace(" ", "T")}Z`) - probe) / 60_000);
  }
  const candidates = [...offsets].filter((offset) =>
    (utcOffsetMinutes === undefined || offset === utcOffsetMinutes) && format(nominal - offset * 60_000) === source,
  );
  if (candidates.length === 0) throw new Error("来源时间在该时区不存在，或与提供的 UTC 偏移不一致。");
  if (candidates.length > 1) throw new Error("来源时间位于夏令时重复钟点，请提供原始 UTC 偏移。");
  return { occurredAt: new Date(nominal - candidates[0] * 60_000), timezone, utcOffsetMinutes: candidates[0] };
}
