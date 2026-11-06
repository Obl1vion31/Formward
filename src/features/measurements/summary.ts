import { buildMeasurementDays, type DailyMeasurement } from "./days";
import { addCalendarDays, type MeasurementMetric } from "./trend";

/** 摘要始终取最新空腹状态，不随图表历史区间变化；每个归属日最多一个代表值。 */
export function measurementSummary<T extends DailyMeasurement>(records: T[], metric: MeasurementMetric, choices: Record<string, string> = {}) {
  const fasting = buildMeasurementDays(records.filter((row) => row.recordKind !== "estimated"), choices).map((day) => day.daytimeRecord)
    .filter((row): row is T => row !== null && row.fasting === true);
  const valid = fasting.filter((row) => row[metric] !== null);
  const current = valid[0] ?? null;
  const companionMetric: MeasurementMetric = metric === "weightKg" ? "bodyFatPercent" : "weightKg";
  const companion = fasting.find((row) => row[companionMetric] !== null) ?? null;
  const start = current ? addCalendarDays(current.recordDate, -6) : null;
  const window = start ? valid.filter((row) => row.recordDate >= start) : [];
  const first = window.at(-1) ?? null;
  const cents = window.map((row) => Math.round(Number(row[metric]) * 100));
  return {
    current, companion, companionMetric, start, end: current?.recordDate ?? null,
    changeStart: window.length >= 2 ? first!.recordDate : null,
    change: window.length >= 2 ? (cents[0] - cents.at(-1)!) / 100 : null,
    average: cents.length ? Math.round(cents.reduce((sum, value) => sum + value, 0) / cents.length) / 100 : null,
    coverage: window.length,
  };
}

/** 同一日历锚点的实测摘要；不以最近两条冒充相邻日。 */
export function measurementSummaryAt<T extends DailyMeasurement>(records:T[],metric:MeasurementMetric,date:string,choices:Record<string,string>={}){
 const valid=buildMeasurementDays(records.filter(r=>r.recordKind!=='estimated'),choices,metric).map(day=>day.daytimeRecord).filter((row):row is T=>!!row&&row.fasting===true&&row[metric]!==null);
 const start=addCalendarDays(date,-6),window=valid.filter(r=>r.recordDate>=start&&r.recordDate<=date).sort((a,b)=>a.recordDate.localeCompare(b.recordDate));
 const current=valid.find(r=>r.recordDate===date),previous=valid.find(r=>r.recordDate===addCalendarDays(date,-1));
 const value=current?Number(current[metric]):null,values=window.map(r=>Math.round(Number(r[metric])*100));
 return {value,previousChange:current&&previous?(Math.round(Number(current[metric])*100)-Math.round(Number(previous[metric])*100))/100:null,
 average:values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length)/100:null,change:values.length>1?(values.at(-1)!-values[0])/100:null,coverage:values.length,start:window[0]?.recordDate??null,end:window.at(-1)?.recordDate??null};
}
