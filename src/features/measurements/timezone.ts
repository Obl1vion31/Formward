/** 界面使用 GMT 偏移，历史地区标识保持原样。 */
export function validateMeasurementTimezone(value: string | null) {
  if (value === null) return;
  if (typeof value !== "string" || !value.trim()) throw new Error("时区无效。");
  if (/^[+-]/.test(value)) {
    const match = /^([+-])(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new Error("时区偏移须为 +08:00 这样的格式。");
    const minutes = (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "-" ? -1 : 1);
    if (Number(match[3]) >= 60 || minutes < -720 || minutes > 840 || minutes % 15) throw new Error("时区偏移须在 GMT-12 至 GMT+14 之间，精确到一刻钟。");
  }
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); } catch { throw new Error("时区无效。"); }
}

export function offsetTimezone(minutes: number) {
  return `${minutes < 0 ? "-" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
}
export function systemMeasurementTimezone(now = new Date()) {
  return offsetTimezone(-now.getTimezoneOffset());
}
export function gmtOffsetLabel(minutes: number) {
  const hours = Math.floor(Math.abs(minutes) / 60), remainder = Math.abs(minutes) % 60;
  const offset = `GMT${minutes < 0 ? "-" : "+"}${hours}${remainder ? `:${String(remainder).padStart(2, "0")}` : ""}`;
  return remainder ? offset : `${offset}（${minutes === 0 ? "零时区" : `${minutes > 0 ? "东" : "西"}${["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四"][hours]}区`}）`;
}
function offsetAt(zone: string, instant: Date) {
  const part = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(instant).find(part => part.type === "timeZoneName")!.value;
  if (part === "GMT") return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})(?::\d{2})?$/.exec(part);
  if (!match) throw new Error("时区偏移无法识别。");
  return (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "-" ? -1 : 1);
}
const labelsByDate = new Map<string, string>();
export function timezoneLabel(zone: string | null | undefined, date?: string, savedOffset?: number | null) {
  if (!zone) return "未指定";
  try {
    validateMeasurementTimezone(zone);
    if (savedOffset !== null && savedOffset !== undefined) return gmtOffsetLabel(savedOffset);
    if (/^[+-]/.test(zone)) return gmtOffsetLabel(offsetAt(zone, new Date(0)));
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return gmtOffsetLabel(offsetAt(zone, new Date()));
    const cacheKey = `${zone}:${date}`, cached = labelsByDate.get(cacheKey);
    if (cached) return cached;
    // 日期时段没有真实钟点；检查整天的偏移，跨夏令时当天显示所有可能值。
    const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    const nominal = Date.parse(`${date}T00:00:00Z`), offsets = new Set<number>();
    for (let hours = -14; hours <= 38; hours += .5) {
      const instant = new Date(nominal + hours * 3600000);
      const parts = Object.fromEntries(dateFormatter.formatToParts(instant).map(part => [part.type, part.value]));
      if (`${parts.year}-${parts.month}-${parts.day}` === date) offsets.add(offsetAt(zone, instant));
    }
    const label = [...offsets].sort((a, b) => a - b).map(gmtOffsetLabel).join(" / ") || "未指定";
    if (labelsByDate.size >= 256) labelsByDate.delete(labelsByDate.keys().next().value!);
    labelsByDate.set(cacheKey, label);
    return label;
  } catch { return "时区无效"; }
}
export const timezoneOptions = Array.from({ length: 27 }, (_, index) => {
  const minutes = (-12 + index) * 60;
  return { value: offsetTimezone(minutes), label: gmtOffsetLabel(minutes) };
});
