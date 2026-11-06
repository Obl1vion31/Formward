"use client";
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

export function MobileNutritionPlot({dates,groups,mode,selection}:{dates:string[];groups:ReturnType<typeof dailyTotals>;mode:MacroMode;selection:ReturnType<typeof useChartDateSelection>}) {
  const viewport=useRef<HTMLDivElement>(null), byDate=new Map(groups.map(group=>[group.date,group]));
  const model=metricTrendModel("intake",dates.map(date=>{const group=byDate.get(date);return intakeTrendPoint(date,group?.totals,group?.day.status,mode);}));
  const {width:measured,left}=useChartViewport(viewport,model.ticks,50), width=measured||280,right=10,top=20,plotWidth=width-left-right,plotHeight=plotWidth/2,bottom=top+plotHeight;
  const slot=plotWidth/dates.length,x=(index:number)=>left+(index+.5)*slot,y=(value:number)=>bottom-value/model.max*plotHeight;
  const drag=useChartDrag(dates,width,left,right,selection.choose), selected=dates.indexOf(selection.selected),stride=Math.max(1,Math.ceil((dates.length-1)/3));
  return <div className={styles.barViewport} ref={viewport} data-chart-arrival>
    <svg {...drag} className={styles.chart} style={{height:"auto",maxHeight:"none",touchAction:"pan-y",visibility:measured?undefined:"hidden"}} viewBox={`0 0 ${width} ${bottom+32}`} role="group" aria-label="每日摄入，kcal；P、C、F 组成">
      {model.ticks.filter((_,index)=>index%Math.max(1,Math.ceil(24*(model.ticks.length-1)/plotHeight))===0).map(tick=><g key={tick}><line className={styles.grid} x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text className={styles.axis} x={left-8} y={y(tick)+4} textAnchor="end">{tick}</text></g>)}
      <ChartSelectionColumn x={x(selected)} date={selection.selected} column={{left:x(selected)-slot/2,right:x(selected)+slot/2}} plot={{left,right:width-right,top,bottom}} resetKey={`${width}:${dates.join("|")}`} direct={selection.direct} baselineTick/>
      <TrendGlyph target={measured>0} model={model} x={left} y={top} width={plotWidth} height={plotHeight}/>
      {dates.map((date,index)=>{const group=byDate.get(date), value=group?.totals.values.caloriesKcal;return <g key={date} role="button" data-bar-date={date} data-chart-date={date} aria-pressed={selection.selected===date} tabIndex={selection.selected===date?0:-1} aria-label={`${date}，摄入 ${formatNutrition(value??null,"caloriesKcal")} kcal${group&&group.day.status!=="complete"?"，当天"+(group.day.status==="incomplete"?"未记全":"待确认"):""}`} onMouseMove={()=>selection.preview(date)} onFocus={event=>selection.focus(event,date)} onClick={()=>selection.activate(date)} onKeyDown={event=>selection.keyDown(event,date)}>
        <rect className={styles.barHit} x={left+index*slot} y={top} width={slot} height={plotHeight+4}/>
        {(index%stride===0&&dates.length-1-index>=stride/2||index===dates.length-1)&&<text className={styles.axis} x={x(index)} y={bottom+25} textAnchor={index===0?"start":index===dates.length-1?"end":"middle"}>{date.slice(5).replace("-",".")}</text>}
      </g>;})}
    </svg>
  </div>;
}
