import { chartScale } from "./chart-scale";

export type TrendKind = "intake" | "morning-weight" | "energy";
export type TrendPoint = { date: string; value: number | null; partial?: boolean; segments?: {value:number;color:string;opacity?:number;series?:string}[]; totalMarker?:number|null };
export type MetricTrendModel = {
  kind: TrendKind; points: TrendPoint[]; min: number; max: number; ticks: number[];
};

/** 只准备绘图坐标；传入的数值已由业务模块计算。空值始终保留空缺。 */
export function metricTrendModel(kind: TrendKind, points: TrendPoint[], scale?: { low: number; high: number; ticks: number[] }): MetricTrendModel {
  if (scale) return { kind, points, min: scale.low, max: scale.high, ticks: scale.ticks };
  const bars = chartScale(points.flatMap(point => kind === 'energy' ? [point.value,point.segments?.length?point.segments.reduce((sum,segment)=>sum+segment.value,0):null] : [point.value]));
  return { kind, points, min: 0, max: bars.max, ticks: bars.ticks };
}

export const trendKey = (model: MetricTrendModel) => JSON.stringify(model);
export const trendRangeKey = (model: MetricTrendModel) => JSON.stringify([model.kind,model.points.map(point=>point.date)]);
export const trendColor = (kind: TrendKind) => kind === "intake" ? "var(--data-blue)" : kind === "energy" ? "var(--data-red)" : "var(--data-weight)";

export type TrendRoute = { from: string; to: string; date: string };
export function linkedTrend(params: { view?: string; from?: string; to?: string; date?: string | string[] }): TrendRoute | null {
  const date = typeof params.date === "string" ? params.date : "";
  const valid = (value?: string) => {if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+"T00:00:00Z");return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;};
  if (params.view !== "trend" || !valid(params.from) || !valid(params.to) || !valid(date)) return null;
  const span = (Date.parse(params.to!) - Date.parse(params.from!)) / 86400000;
  return span >= 0 && span <= 3660 && date >= params.from! && date <= params.to! ? { from: params.from!, to: params.to!, date } : null;
}
