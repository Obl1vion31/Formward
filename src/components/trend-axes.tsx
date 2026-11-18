import {measurementDateTicks} from "@/features/measurements/trend";
import type {MetricTrendModel,TrendKind} from "./metric-trend-model";
import {shortRecordDate} from "./record-dates";

export function TrendAxes({kind,dates,model,width,left,right,top,bottom,fontSize,axisClass,gridClass}:{
  kind: TrendKind;
  dates: string[];
  model?: Pick<MetricTrendModel,"min"|"max"|"ticks"> | null;
  width: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  fontSize: number;
  axisClass?: string;
  gridClass?: string;
}){
  const plotWidth=width-left-right, plotHeight=bottom-top;
  if(plotWidth<=0||plotHeight<=0)return null;
  const body=kind==="morning-weight";
  const tickCount=Math.max(2,Math.min(4,Math.floor(plotWidth/(fontSize*3+16))));
  const stride=Math.max(1,Math.ceil((dates.length-1)/(kind==="energy"?3:tickCount-1)));
  const x=(index:number)=>left+plotWidth*(body?(dates.length>1?(5+index/(dates.length-1)*230)/240:.5):(index+.5)/dates.length);
  const labelDates=body&&dates.length ? measurementDateTicks({start:dates[0],end:dates.at(-1)!},tickCount) : dates.filter((_,index)=>index%stride===0&&dates.length-1-index>=stride/2||index===dates.length-1);
  const density=kind==="energy"?24:Math.max(24,fontSize*1.6);
  const scale=model?.ticks ?? [];
  const valueStride=Math.max(1,Math.ceil(density*(scale.length-1)/plotHeight));
  const y=(tick:number)=>{
    const ratio=(tick-model!.min)/(model!.max-model!.min||1);
    return body?top+(5+(1-ratio)*110)/120*plotHeight:bottom-ratio*plotHeight;
  };
  return <g data-trend-axes aria-hidden="true">
    {scale.filter((_,index)=>index%valueStride===0).map(tick=><g key={tick}>
      <line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)} className={gridClass} data-axis-grid/>
      <text x={left-8} y={y(tick)+4} textAnchor="end" className={axisClass} data-value-tick>{body?tick.toFixed(1):tick}</text>
    </g>)}
    {labelDates.map(date=><text key={date} x={x(dates.indexOf(date))} y={bottom+(body?22:25)} textAnchor={dates.length===1?"middle":date===dates[0]?"start":date===dates.at(-1)?"end":"middle"} className={axisClass} data-date-tick>{shortRecordDate(date)}</text>)}
  </g>;
}
