"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {RecordWorkspace,RecordTrendPanel} from './record-trend-panel';
import {TrendBackLink} from './chart-transition';
import {useChartTransition} from './chart-transition-state';
import {ChartRanges} from './chart-ranges';
import {TrendGlyph} from './trend-glyph';
import {useChartViewport} from './use-chart-viewport';
export function WorkspaceSkeleton({kind}:{kind:'overview'|'nutrition'|'energy'|'body'}){
 const {preview}=useChartTransition(),ref=useRef<HTMLDivElement>(null),router=useRouter(),[slow,setSlow]=useState(false);
 const model=preview&&((kind==='nutrition'&&preview.kind==='intake')||(kind==='body'&&preview.kind==='morning-weight'))?preview:null;
 const {width:measured,left}=useChartViewport(ref,model?.ticks??[0,1000],kind==='body'?48:50),width=measured||280,right=kind==='body'?16:10,top=kind==='body'?14:20,plotWidth=width-left-right;
 useEffect(()=>{const timer=setTimeout(()=>setSlow(true),8000);return()=>clearTimeout(timer);},[]);
 const title={overview:'总览',nutrition:'饮食',energy:'消耗',body:'身体'}[kind];
 const labels=kind==='nutrition'?['热量','蛋白质','碳水','脂肪']:kind==='body'?['晨间体重','较前一日','7日变化','7日平均体重']:['总消耗','静息','活动'];
 return <main className="dashboard-page workspace-skeleton" aria-busy="true" aria-label={title+'加载中'}><RecordWorkspace title={title}>
 {kind==='overview'?<div className="skeleton-home"><div className="skeleton-line"/><div className="skeleton-actions"/><div className="skeleton-card"/></div>:null}
 {model&&<div className="trend-return"><TrendBackLink/></div>}{kind==='body'&&<div className="body-preference" aria-hidden="true"><label>显示体脂率<span style={{width:44,height:26,display:'inline-block'}}/></label></div>}
 <RecordTrendPanel date="" view={()=>{}} presentation={kind==='overview'?undefined:kind} loading metrics={labels.map(label=>({label,value:'0000',reserveNote:kind==='nutrition',unit:kind==='body'?'kg':kind==='nutrition'&&label!=='热量'?'g':'kcal'}))} title={kind==='nutrition'?'每日摄入':kind==='body'?'体重':kind==='energy'?'每日消耗':'能量与次晨变化'} range={<ChartRanges value="" change={()=>{}}/>} options={kind==='nutrition'?<div style={{height:44,width:140}}/>:kind==='body'?<div style={{height:44,width:80}}/>:undefined} legend={<div className="skeleton-line"/>}>
 <div ref={ref} className="skeleton-plot"><svg viewBox={'0 0 '+width+' '+(top+plotWidth/2+32)} aria-hidden="true">{model?<TrendGlyph model={model} skeleton target={measured>0} x={left} y={top} width={plotWidth} height={plotWidth/2}/>:<rect x={left} y={top} width={plotWidth} height={plotWidth/2} rx="8" fill="var(--line-soft)"/>}</svg></div>
 </RecordTrendPanel>{slow&&<div className="skeleton-retry" role="status">读取时间较长。<button onClick={()=>router.refresh()}>重试</button><button onClick={()=>router.push('/dashboard')}>返回总览</button></div>}
 </RecordWorkspace></main>;
}
