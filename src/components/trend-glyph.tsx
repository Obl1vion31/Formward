"use client";
import { useLayoutEffect, useRef } from "react";
import type { MetricTrendModel } from "./metric-trend-model";
import { trendColor, trendKey, trendRangeKey } from "./metric-trend-model";
import { useChartTransition } from "./chart-transition-state";

/** 缩略图与业务页共用 2:1 数据平面；文字、坐标和命中区不参与缩放。 */
export function TrendGlyph({ model, target = false, skeleton = false, x, y, width, height, className }: {
  model: MetricTrendModel; target?: boolean; skeleton?: boolean; x?: number; y?: number; width?: number | string; height?: number | string; className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null), {register} = useChartTransition(), key = trendKey(model);
  useLayoutEffect(() => {
    if (!target || !ref.current) return;
    const snapshot=JSON.parse(key) as MetricTrendModel;return register({ kind: snapshot.kind, element: ref.current, model:snapshot, skeleton });
  }, [target, skeleton, key, register]);
  const color = trendColor(model.kind), count = model.points.length, slot = 240 / Math.max(1, count);
  const pointX = (index: number) => model.kind === "morning-weight" ? count > 1 ? 5 + index / (count - 1) * 230 : 120 : (index + .5) * slot;
  const pointY = (value: number) => 115 - (value - model.min) / (model.max - model.min || 1) * 110;
  const barY = (value: number) => 120-value/model.max*120;
  return <svg ref={ref} className={className} data-trend-glyph={model.kind} data-trend-range={trendRangeKey(model)} data-trend-ready={target || undefined} x={x} y={y} width={width ?? "100%"} height={height ?? "100%"} viewBox="0 0 240 120" fill="none" aria-hidden="true" style={{ overflow: "visible", pointerEvents: "none" }}>
    {model.kind === "morning-weight" ? <>
      {model.points.slice(1).map((point, index) => { const before = model.points[index]; return point.value !== null && before.value !== null ? <line key={point.date} x1={pointX(index)} x2={pointX(index+1)} y1={pointY(before.value)} y2={pointY(point.value)} stroke={color} strokeWidth="3" strokeLinecap="round"/> : null; })}
      {model.points.map((point, index) => point.value !== null && <circle key={point.date} cx={pointX(index)} cy={pointY(point.value)} r="3.6" fill={color}/>)}
    </> : model.kind==='energy'?model.points.map((point,index)=>(point.value!==null||point.segments?.length)&&<g key={point.date}>
      {point.segments?.map((segment,j)=>{const below=point.segments!.slice(0,j).reduce((sum,item)=>sum+item.value,0);return <rect key={j} data-energy-series={segment.series} data-value={segment.value} x={pointX(index)-Math.min(12,slot*.3)} y={barY(below+segment.value)} width={Math.min(24,slot*.6)} height={segment.value/model.max*120} fill={segment.color} opacity={segment.opacity}/>;})}
      {!point.segments?.length&&point.value!==null&&point.value>0&&<rect x={pointX(index)-Math.min(12,slot*.3)} y={barY(point.value)} width={Math.min(24,slot*.6)} height={point.value/model.max*120} fill={color}/>}
      {point.value===0&&<line x1={pointX(index)-4} x2={pointX(index)+4} y1="120" y2="120" stroke={point.segments?.[0]?.color??color} strokeWidth="2"/>}
      {point.totalMarker!=null&&<line data-energy-total={point.totalMarker} x1={pointX(index)-Math.min(12,slot*.3)-2} x2={pointX(index)+Math.min(12,slot*.3)+2} y1={barY(point.totalMarker)} y2={barY(point.totalMarker)} stroke="var(--gold)" strokeWidth="2"/>}
    </g>):model.points.map((point, index) => point.value !== null && <g key={point.date}>
      {point.value > 0 ? point.segments?.length?point.segments.map((segment,j)=>{const below=point.segments!.slice(0,j).reduce((sum,item)=>sum+item.value,0);return <rect key={j} x={pointX(index)-Math.min(12,slot*.3)} y={barY(below+segment.value)} width={Math.min(24,slot*.6)} height={segment.value/model.max*120} fill={segment.color}/>;}):<rect x={pointX(index)-Math.min(12,slot*.3)} y={barY(point.value)} width={Math.min(24,slot*.6)} height={120-barY(point.value)} rx="2" fill={color}/>
        : <line x1={pointX(index)-4} x2={pointX(index)+4} y1="120" y2="120" stroke={color} strokeWidth="2"/>}
      {point.partial && point.value > 0 && <line x1={pointX(index)-Math.min(12,slot*.3)} x2={pointX(index)+Math.min(12,slot*.3)} y1={barY(point.value)} y2={barY(point.value)} stroke="var(--warm-white)" strokeWidth="2" strokeDasharray="3 3"/>}
    </g>)}
  </svg>;
}
