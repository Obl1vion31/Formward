"use client";
import { useRef } from "react";
import { metricTrendModel } from "@/components/metric-trend-model";
import { TrendGlyph } from "@/components/trend-glyph";
import { useChartViewport } from "@/components/use-chart-viewport";
import { useChartDrag } from "@/components/use-chart-drag";
import { ChartSelectionColumn } from "@/components/chart-selection-marker";
import type { useChartDateSelection } from "@/components/use-chart-date-selection";
import { formatRecordNumber } from "@/components/number-format";
import { addCalendarDays, calendarOrdinal, measurementTrend, normalScale, type MeasurementInterval } from "./trend";
import type { MeasurementDisplay } from "./entry-state";
import styles from "./measurements-view.module.css";

export function MorningWeightPlot({records,interval,selection,choices,linked=false,compact=false}:{records:MeasurementDisplay[];interval:MeasurementInterval;selection:ReturnType<typeof useChartDateSelection>;choices:Record<string,string>;linked?:boolean;compact?:boolean}) {
  const viewport=useRef<HTMLDivElement>(null), dates=Array.from({length:calendarOrdinal(interval.end)-calendarOrdinal(interval.start)+1},(_,i)=>addCalendarDays(interval.start,i));
  const {points}=measurementTrend(records,"weightKg",false,choices), byDate=new Map(points.map(row=>[row.recordDate,row]));
  const scale=normalScale(points.map(row=>Number(row.weightKg))),model=metricTrendModel("morning-weight",dates.map(date=>({date,value:byDate.get(date)?.weightKg!=null?Number(byDate.get(date)!.weightKg):null})),scale);
  const {width:measured,left}=useChartViewport(viewport,scale.ticks.map(value=>value.toFixed(1)),48),width=measured||280,right=16,top=14,plotWidth=width-left-right,plotHeight=plotWidth/2,bottom=top+plotHeight;
  const x=(index:number)=>left+(dates.length>1?(5+index/(dates.length-1)*230)/240: .5)*plotWidth,y=(value:number)=>top+(5+scale.position(value)*110)/120*plotHeight;
  const drag=useChartDrag(dates,width,left,right,selection.choose),slot=plotWidth/Math.max(1,dates.length-1),index=dates.indexOf(selection.selected),stride=Math.max(1,Math.ceil((dates.length-1)/3));
  return <div className={styles.plotViewport+(linked?" linked-trend-plot":compact?" detail-trend-plot":"")} ref={viewport} data-chart-arrival data-linked-plot={linked||undefined}>
    <svg {...drag} className={styles.plot} style={{height:"auto",maxHeight:"none",touchAction:"pan-y",visibility:measured?undefined:"hidden"}} viewBox={`0 0 ${width} ${bottom+32}`} role="group" aria-label="晨间空腹体重趋势，kg，缺测断开">
      {scale.ticks.filter((_,i)=>i%Math.max(1,Math.ceil(24*(scale.ticks.length-1)/plotHeight))===0).map(tick=><g key={tick}><line className={styles.grid} x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text className={styles.axis} x={left-8} y={y(tick)+4} textAnchor="end">{tick.toFixed(1)}</text></g>)}
      <ChartSelectionColumn x={x(index)} date={selection.selected} column={{left:Math.max(left,x(index)-slot/2),right:Math.min(width-right,x(index)+slot/2)}} plot={{left,right:width-right,top,bottom}} resetKey={`${width}:${dates.join("|")}`} direct={selection.direct}/>
      <TrendGlyph target={measured>0} model={model} x={left} y={top} width={plotWidth} height={plotHeight}/>
      {dates.map((date,i)=><g key={date} role="button" tabIndex={selection.selected===date?0:-1} data-chart-date={date} data-date={date} aria-pressed={selection.selected===date} aria-label={`${date}，晨间体重 ${formatRecordNumber(byDate.get(date)?.weightKg)} kg`} onMouseMove={()=>selection.preview(date)} onFocus={event=>selection.focus(event,date)} onClick={()=>selection.activate(date)} onKeyDown={event=>selection.keyDown(event,date)}>
        <rect x={Math.max(left,x(i)-slot/2)} y={top} width={Math.min(width-right,x(i)+slot/2)-Math.max(left,x(i)-slot/2)} height={plotHeight} fill="transparent"/>
        {(i%stride===0&&dates.length-1-i>=stride/2||i===dates.length-1)&&<text className={styles.axis} x={x(i)} y={bottom+25} textAnchor={i===0?"start":i===dates.length-1?"end":"middle"}>{date.slice(5).replace("-",".")}</text>}
      </g>)}
    </svg>
  </div>;
}
