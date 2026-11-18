"use client";
import {TrendAxes} from "@/components/trend-axes";
import {ChartPreparation} from "@/components/chart-preparation";
import {useChartMotion} from "@/components/use-chart-motion";
import { useRef } from 'react';
import { metricTrendModel } from '@/components/metric-trend-model';
import { TrendGlyph } from '@/components/trend-glyph';
import { useChartViewport } from '@/components/use-chart-viewport';
import { useChartDrag } from '@/components/use-chart-drag';
import { ChartSelectionColumn } from '@/components/chart-selection-marker';
import type { useChartDateSelection } from '@/components/use-chart-date-selection';
import { energyTrendPoint } from './trend-preview';
import type { EnergyDay } from './model';
import styles from './energy.module.css';
import { EnergyPlotFrame } from './energy-plot-frame';

export function MobileEnergyPlot({days,selected,selection,linked=false,compact=false}:{days:EnergyDay[];selected:string;selection:ReturnType<typeof useChartDateSelection>;linked?:boolean;compact?:boolean}) {
  const viewport=useRef<HTMLDivElement>(null),model=metricTrendModel('energy',days.map(day=>energyTrendPoint(day.date,day)));
  const {width:measured,left,fontSize,height:measuredHeight}=useChartViewport(viewport,model.ticks,50),width=measured||280,right=10,top=20,plotWidth=width-left-right,plotHeight=measuredHeight ? measuredHeight-top-32 : plotWidth/2,bottom=top+plotHeight;
  useChartMotion(viewport,measured?JSON.stringify(model):"pending",days[0]?.date+":"+days.at(-1)?.date);
  const dates=days.map(day=>day.date),slot=plotWidth/days.length,x=(i:number)=>left+(i+.5)*slot;
  const drag=useChartDrag(dates,width,left,right,selection.choose),index=dates.indexOf(selected);
  return <EnergyPlotFrame frameRef={viewport} compact={days.length<=7} adaptive className={linked ? "linked-trend-plot" : compact ? "detail-trend-plot" : ""}>
    <ChartPreparation active={!measured}/>
    <svg {...drag} style={{touchAction:'pan-y',visibility:measured?undefined:'hidden'}} viewBox={`0 0 ${width} ${bottom+32}`} role="group" aria-label="每日消耗柱状图">
      <TrendAxes kind="energy" dates={dates} model={model} width={width} left={left} right={right} top={top} bottom={bottom} fontSize={fontSize} axisClass={styles.axis} gridClass={styles.grid}/>
      <ChartSelectionColumn x={index<0?null:x(index)} date={selected} column={index<0?null:{left:x(index)-slot/2,right:x(index)+slot/2}} plot={{left,right:width-right,top,bottom}} resetKey={`${width}:${dates.join('|')}`} direct={selection.direct} baselineTick/>
      <TrendGlyph target={measured>0} model={model} x={left} y={top} width={plotWidth} height={plotHeight}/>
      {days.map((day,i)=><g key={day.date} role="button" tabIndex={selected===day.date?0:-1} data-chart-date={day.date} data-energy-date={day.date} data-selected={selected===day.date} aria-pressed={selected===day.date} aria-label={`${day.date} · 总消耗 ${day.totalKcal??'未填写'} 千卡`} onMouseMove={()=>selection.preview(day.date)} onFocus={event=>selection.focus(event,day.date)} onClick={()=>selection.activate(day.date)} onKeyDown={event=>selection.keyDown(event,day.date)}>
        <rect className={styles.hit} x={left+i*slot} y={top} width={slot} height={plotHeight+4}/>
      </g>)}
    </svg>
  </EnergyPlotFrame>;
}
