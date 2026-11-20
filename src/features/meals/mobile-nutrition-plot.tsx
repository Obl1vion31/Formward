"use client";
import {TrendAxes} from "@/components/trend-axes";
import {ChartPreparation} from "@/components/chart-preparation";
import {useChartMotion} from "@/components/use-chart-motion";
import { useRef } from "react";
import { metricTrendModel } from "@/components/metric-trend-model";
import { TrendGlyph } from "@/components/trend-glyph";
import { useChartViewport } from "@/components/use-chart-viewport";
import { useChartDrag } from "@/components/use-chart-drag";
import { ChartSelectionColumn } from "@/components/chart-selection-marker";
import type { useChartDateSelection } from "@/components/use-chart-date-selection";
import { dailyTotals, formatNutrition, type MacroMode } from "./model";
import { intakeTrendPoint } from "./trend-preview";
import styles from "./meals.module.css";

export function MobileNutritionPlot({dates,groups,mode,selection,linked=false,compact=false}:{dates:string[];groups:ReturnType<typeof dailyTotals>;mode:MacroMode;selection:ReturnType<typeof useChartDateSelection>;linked?:boolean;compact?:boolean}) {
  const viewport=useRef<HTMLDivElement>(null), byDate=new Map(groups.map(group=>[group.date,group]));
  const model=metricTrendModel("intake",dates.map(date=>{const group=byDate.get(date);return intakeTrendPoint(date,group?.totals,group?.day.status,mode);}));
  const {width:measured,left,fontSize,height:measuredHeight}=useChartViewport(viewport,model.ticks,50), width=measured||280,right=10,top=20,plotWidth=width-left-right,plotHeight=measuredHeight?measuredHeight-top-32:plotWidth/2,bottom=top+plotHeight,height=bottom+32;
  useChartMotion(viewport,measured?JSON.stringify(model):"pending",dates[0]+":"+dates.at(-1)+":"+mode);
  const slot=plotWidth/dates.length,x=(index:number)=>left+(index+.5)*slot;
  const drag=useChartDrag(dates,width,left,right,selection.choose), selected=dates.indexOf(selection.selected);
  return <div className={styles.barViewport+(linked?" linked-trend-plot":compact?" detail-trend-plot":"")} ref={viewport} data-chart-density={dates.length<=7?"short":"full"} data-chart-arrival data-linked-plot={linked||undefined}>
    <ChartPreparation active={!measured} guideInsets={linked?undefined:{top,right,bottom:32,left}}/>
    <svg {...drag} className={styles.chart} style={{height:"auto",maxHeight:"none",touchAction:"pan-y",visibility:measured?undefined:"hidden"}} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="每日摄入，kcal；P、C、F 组成">
      <TrendAxes kind="intake" dates={dates} model={model} width={width} left={left} right={right} top={top} bottom={bottom} fontSize={fontSize} axisClass={styles.axis} gridClass={styles.grid}/>
      <ChartSelectionColumn x={x(selected)} date={selection.selected} column={{left:x(selected)-slot/2,right:x(selected)+slot/2}} plot={{left,right:width-right,top,bottom}} resetKey={`${width}:${dates.join("|")}`} direct={selection.direct} baselineTick/>
      <TrendGlyph rangeMotion target={measured>0} model={model} x={left} y={top} width={plotWidth} height={plotHeight}/>
      {dates.map((date,index)=>{const group=byDate.get(date), value=group?.totals.values.caloriesKcal;return <g key={date} role="button" data-bar-date={date} data-chart-date={date} aria-pressed={selection.selected===date} tabIndex={selection.selected===date?0:-1} aria-label={`${date}，摄入 ${formatNutrition(value??null,"caloriesKcal")} kcal${group&&group.day.status!=="complete"?"，当天"+(group.day.status==="incomplete"?"未记全":"待确认"):""}`} onMouseMove={()=>selection.preview(date)} onFocus={event=>selection.focus(event,date)} onClick={()=>selection.activate(date)} onKeyDown={event=>selection.keyDown(event,date)}>
        <rect className={styles.barHit} x={left+index*slot} y={top} width={slot} height={plotHeight+4}/>
      </g>;})}
    </svg>
  </div>;
}
