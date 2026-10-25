import type { MeasurementDisplay } from "../measurements/entry-state";
import { energyDays, type EnergySnapshot } from "./model";

/** 只在服务端调用：客户端接收既定读数，不执行默认值、公式或最终取值。 */
export function energyPresentation(snapshot: EnergySnapshot, records: MeasurementDisplay[], today: string, sources: string[] = []) {
  const dates = [...new Set([today, ...snapshot.days.map(day => day.date), ...snapshot.activities.map(row => row.date)])].sort();
  const { defaults, ...visible } = snapshot; void defaults;
  return { snapshot: {...visible,profiles: []}, days: energyDays(snapshot, records, dates), formula: null, today, sources };
}
export type EnergyPresentation = ReturnType<typeof energyPresentation>;
