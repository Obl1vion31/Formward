import type { EnergyDay, EnergyRecord } from "./model";
import { publicCalculation } from "./calculation-model";
export function publicEnergyRecord(record:EnergyRecord|undefined|null) {
 if(!record)return record;
 if(!("restingKcal" in record)||!("date" in record))return record;
 const {calculationSnapshot,...rest}=record;
 return {...rest,calculation:publicCalculation(calculationSnapshot)};
}
export function publicEnergyDay(day:EnergyDay){return {...day,record:publicEnergyRecord(day.record),calculation:publicCalculation(day.record?.calculationSnapshot)};}
