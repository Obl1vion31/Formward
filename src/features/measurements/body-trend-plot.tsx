"use client";
import {useId,useRef,useState} from "react";
import {useChartViewport} from "@/components/use-chart-viewport";
import {useChartMotion} from "@/components/use-chart-motion";
import {useChartDrag} from "@/components/use-chart-drag";
import type {useChartDateSelection} from "@/components/use-chart-date-selection";
import {ChartSelectionColumn,ChartSelectionPoint} from "@/components/chart-selection-marker";
import {formatRecordNumber} from "@/components/number-format";
import {displayRecordDate,shortRecordDate} from "@/components/record-dates";
import {TrendGlyph} from "@/components/trend-glyph";
import {metricTrendModel} from "@/components/metric-trend-model";
import {useMobileMode} from "@/components/use-mobile-mode";
import {addCalendarDays,calendarOrdinal,measurementDateTicks,measurementTrend,normalScale,type MeasurementInterval,type MeasurementMetric} from "./trend";
import type {MeasurementDisplay} from "./entry-state";
import styles from "./measurements-view.module.css";
const unitFor=(metric:MeasurementMetric)=>metric==="weightKg"?"kg":"%";
const metricName=(metric:MeasurementMetric)=>metric==="weightKg"?"体重":"体脂率";

/** 晨间、晨晚与体脂共用坐标和读数外壳；共享图形只接管一致的晨重数据。 */
export function BodyTrendPlot({ records, metric, showEvening, interval, selectedDate, selectedPeriod, selection, onPeriod, choices, linked=false }: {
  linked?: boolean;
  records: MeasurementDisplay[]; metric: MeasurementMetric; showEvening: boolean; interval: MeasurementInterval;
  selectedDate: string | null; selectedPeriod?: "daytime" | "evening"; selection:ReturnType<typeof useChartDateSelection>; onPeriod:(period:"daytime"|"evening")=>void; choices: Record<string, string>;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const plotId = useId(), mobile=useMobileMode();
  const span=calendarOrdinal(interval.end)-calendarOrdinal(interval.start),compact=linked||!!mobile||span<31;
  const dates=Array.from({length:span+1},(_,i)=>addCalendarDays(interval.start,i));
  const [hintRecordId, setHintRecordId] = useState<string | null>(null);
  const { points, segments, pairs } = measurementTrend(records, metric, showEvening, choices);
  const scale = normalScale(points.map(row => Number(row[metric])));
  const {width:viewportWidth,left}=useChartViewport(viewport,scale.ticks.map(value=>value.toFixed(1)),48);
  useChartMotion(viewport, viewportWidth ? `${metric}:${showEvening}:${interval.start}:${interval.end}:${JSON.stringify(choices)}:${records.map(record => `${record.id}:${record.updatedAt}`).join("|")}` : "pending");
  const width=viewportWidth||280,leftEdge=left,right=16,top=14,plotWidth=width-leftEdge-right;
  const plotHeight=compact?plotWidth/2:(mobile?180:252)-top-32,height=top+plotHeight+32,plotBottom=top+plotHeight;
  const x=(date:string)=>left+(span?(5+(calendarOrdinal(date)-calendarOrdinal(interval.start))/span*230)/240:.5)*plotWidth;
  const y=(value:string|null)=>top+(5+scale.position(Number(value))*110)/120*plotHeight;
  const canShare=metric==="weightKg"&&!showEvening;
  const byDate=new Map(points.filter(row=>row.period==='daytime').map(row=>[row.recordDate,row]));
  const model=metricTrendModel("morning-weight",dates.map(date=>({date,value:byDate.get(date)?.[metric]!=null?Number(byDate.get(date)![metric]):null})),scale);
  const pointDays = [...new Set(points.map(row => row.recordDate))].sort();
  const hitColumns = new Map(pointDays.map((date, index) => [date, {
    left: index ? (x(pointDays[index - 1]) + x(date)) / 2 : 0,
    right: index < pointDays.length - 1 ? (x(date) + x(pointDays[index + 1])) / 2 : width,
  }]));
  const pointByPeriod = new Map(points.map(row => [`${row.recordDate}:${row.period}`, row]));
  const ticks = measurementDateTicks(interval, 4);
  const unit = unitFor(metric);
  const pointLabel = (row: MeasurementDisplay) => `${displayRecordDate(row.recordDate)} · ${row.period === "daytime" ? "晨间" : "晚间"} · ${formatRecordNumber(row[metric])} ${unit}`;
  const hintedRecord = points.find((row) => row.id === hintRecordId && row.recordDate===selectedDate && selection.active) ?? points.find(row => row.recordDate === selectedDate && row.period === (selectedPeriod ?? "daytime")) ?? points.find(row => row.recordDate === selectedDate);
  const drag=useChartDrag(dates,width,left,right,selection.choose);
  const markerKey=`${width}:${height}:${interval.start}:${interval.end}:${scale?.ticks.join("|")}`;
  const selectedX=selectedDate?x(selectedDate):null,selectedHit=selectedDate?hitColumns.get(selectedDate):null;
  const dayHalfWidth=span?plotWidth/span/2:plotWidth/2;
  const selectedColumn=selectedX===null?null:selectedHit?{left:Math.max(selectedHit.left,selectedX-14),right:Math.min(selectedHit.right,selectedX+14)}:{left:selectedX-dayHalfWidth,right:selectedX+dayHalfWidth};
  const activate = (row: MeasurementDisplay) => {selection.activate(row.recordDate);onPeriod(row.period);};


  return <>
    <div className={styles.plotViewport+(linked?" linked-trend-plot":compact?" detail-trend-plot":"")} ref={viewport} data-chart-arrival data-body-plot data-linked-plot={linked||undefined}>
      <svg {...drag} className={styles.plot} style={{touchAction:"pan-y", height:compact?"auto":undefined, maxHeight:"none", visibility: viewportWidth > 0 ? undefined : "hidden"}} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${metricName(metric)}趋势，数值越高位置越高`}>
        <title>{`${metricName(metric)}趋势`}</title>
        {scale.ticks.filter((_,i)=>i%Math.max(1,Math.ceil(24*(scale.ticks.length-1)/plotHeight))===0).map((value) => <g key={value}><line x1={left} x2={width-right} y1={y(String(value))} y2={y(String(value))} className={styles.grid} /><text x={left-8} y={y(String(value)) + 4} textAnchor="end" className={styles.axis}>{value.toFixed(1)}</text></g>)}
        {ticks.map((date) => <text key={date} x={x(date)} y={height-10} textAnchor={date===interval.start?"start":date===interval.end?"end":"middle"} className={styles.axis}>{shortRecordDate(date)}</text>)}
        <ChartSelectionColumn x={selectedX} date={selectedDate} column={selectedColumn} plot={{left,right:width-right,top,bottom:plotBottom}} resetKey={markerKey} direct={selection.direct}/>
        {(["daytime","evening"] as const).map(period=>{const point=points.find(row=>row.recordDate===selectedDate&&row.period===period);return <ChartSelectionPoint key={period} x={point?x(point.recordDate):null} y={point?y(point[metric]):0} resetKey={markerKey} direct={selection.direct} color={period==="daytime"?"var(--data-weight)":"var(--body-blue)"}/>;})}
        {pairs.map((day) => <line data-pair={day.date} key={day.date} x1={x(day.date)} x2={x(day.date)} y1={y(day.daytimeRecord![metric])} y2={y(day.eveningRecord![metric])} className={styles.pairLine} />)}
        <TrendGlyph detail target={viewportWidth>0&&canShare} model={model} x={left} y={top} width={plotWidth} height={plotHeight}/>
        {segments.filter(segment=>segment.period==='evening').map(({ a, b, period }) => <line data-chart-line key={`${a.id}:${b.id}`} data-segment="continuous" data-period={period} x1={x(a.recordDate)} y1={y(a[metric])} x2={x(b.recordDate)} y2={y(b[metric])} className={`${period === "daytime" ? styles.dayLine : styles.nightLine} `} style={{strokeWidth:span<7?2.5:1.75}} vectorEffect="non-scaling-stroke" />)}
        {[...points].sort((a, b) => Number(a.period === "daytime") - Number(b.period === "daytime")).map((row) => {
          const label = pointLabel(row);
          // 相邻日期与同日晨晚点各用中线划分点击区域，避免透明命中区遮住另一条记录。
          const companion = pointByPeriod.get(`${row.recordDate}:${row.period === "daytime" ? "evening" : "daytime"}`);
          const ownY = y(row[metric]), companionY = companion ? y(companion[metric]) : null;
          const midpoint = companionY === null ? null : (ownY + companionY) / 2;
          const coincident = companionY === ownY;
          const column = hitColumns.get(row.recordDate)!;
          const clipLeft = coincident && row.period === "evening" ? x(row.recordDate) : column.left;
          const clipRight = coincident && row.period === "daytime" ? x(row.recordDate) : column.right;
          const clipTop = midpoint !== null && !coincident && ownY > companionY! ? midpoint : 0;
          const clipBottom = midpoint !== null && !coincident && ownY < companionY! ? midpoint : height;
          const clipId = `${plotId}-${row.id}`;
          return <g key={row.id} data-point-id={row.id} data-date={row.recordDate} data-selected={row.recordDate===selectedDate} data-value={row[metric]} data-period={row.period} data-kind={row.recordKind} role="button" tabIndex={0} aria-label={label} aria-pressed={row.recordDate === selectedDate} data-chart-date={row.recordDate} onMouseMove={() => {if(!selection.locked){setHintRecordId(row.id);selection.preview(row.recordDate);onPeriod(row.period);}}} onMouseLeave={() => setHintRecordId(null)} onFocus={event => {selection.focus(event,row.recordDate);if(event.currentTarget.matches(":focus-visible")){setHintRecordId(row.id);onPeriod(row.period);}}} onBlur={() => setHintRecordId(null)} onClick={() => activate(row)} onKeyDown={(event) => {selection.keyDown(event,row.recordDate);if(event.key==="Enter"||event.key===" ")activate(row);}}>
            <title>{`${row.timePrecision==="second"?row.sourceLocalTime:"无准确时间"} · ${label}`}</title>
            <defs><clipPath id={clipId}><rect x={clipLeft} y={clipTop} width={clipRight - clipLeft} height={clipBottom - clipTop} /></clipPath></defs>
            <circle cx={x(row.recordDate)} cy={ownY} r="14" className={styles.hitTarget} clipPath={`url(#${clipId})`} />
            {row.period==='evening'&&<circle cx={x(row.recordDate)} cy={y(row[metric])} r={span<7?4:3.2} className={styles.nightPoint} />}
          </g>;
        })}
        {!points.length && <text x={width / 2} y="118" textAnchor="middle" className={styles.emptyChart}>{`此区间暂无${showEvening ? "" : "空腹"}${metricName(metric)}记录`}</text>}
      </svg>
    </div>
    <output data-body-plot-readout className={styles.plotHint} aria-live="polite">{hintedRecord?pointLabel(hintedRecord):""}</output>
  </>;
}
