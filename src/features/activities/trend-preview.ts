import type { TrendPoint } from '../../components/metric-trend-model';
import type { EnergyDay } from './model';

/** 仅适配已完成的业务汇总；堆叠高度不是对未知总数的补算。 */
export function energyTrendPoint(date:string,day?:EnergyDay):TrendPoint {
  if(!day)return{date,value:null};
  const value=day.totalKcal===null?null:Number(day.totalKcal);
  const segments:NonNullable<TrendPoint['segments']>=[];
  if(day.restingKcal!==null)segments.push({value:Number(day.restingKcal),color:'var(--data-protein)',opacity:day.restingBasis ? .55 : .9,series:'resting'});
  if(day.activeKcal!==null)segments.push({value:Number(day.activeKcal),color:'var(--data-red)',series:'active'});
  if(!segments.length&&value!==null)segments.push({value,color:'var(--data-neutral)',series:'total-only'});
  return{date,value,segments:segments.length?segments:undefined,totalMarker:day.totalSource==='override'?value:null};
}
