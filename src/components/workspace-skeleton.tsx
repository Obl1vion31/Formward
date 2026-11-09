"use client";
import bodyStyles from "@/features/measurements/measurements-view.module.css";
import {useContext,useEffect,useRef,useState} from 'react';
import {useSearchParams,useRouter} from 'next/navigation';
import {RecordWorkspace,RecordTrendPanel,InlineChartControls} from './record-trend-panel';
import {useChartTransition} from './chart-transition-state';
import {ChartRanges} from './chart-ranges';
import {TrendGlyph} from './trend-glyph';
import {useChartViewport} from './use-chart-viewport';
import {useMobileMode} from './use-mobile-mode';
import {SkeletonBlock} from './skeleton-block';
import {DailyRecords} from './daily-records';
import {WorkspaceSourceContext} from './workspace-frame-state';
import {EnergySourceStatusSkeleton} from '@/features/data-sources/energy-status';
import {OverviewLegend,NutritionLegend,EnergyLegend} from './chart-legend';
import {MetricCardRailSkeleton} from './metric-card-rail';
import {linkedTrend} from './metric-trend-model';
import {linkedDate} from '@/features/measurements/calendar';
import {OverviewReadings} from '@/features/dashboard/overview-trend';
import measurementStyles from '@/features/measurements/measurements-view.module.css';
import {EnergyComposition} from '@/features/activities/energy-composition';
import {EnergyPlotFrame} from '@/features/activities/energy-plot-frame';
import overview from '@/features/dashboard/overview.module.css';
export function WorkspaceSkeleton({kind}:{kind:'overview'|'nutrition'|'energy'|'body'}){
 const sourcePilot=useContext(WorkspaceSourceContext);
 const {preview}=useChartTransition(),ref=useRef<HTMLDivElement>(null),router=useRouter(),[slow,setSlow]=useState(false),params=useSearchParams(),mobile=useMobileMode();
 const model=preview&&((kind==='nutrition'&&preview.kind==='intake')||(kind==='body'&&preview.kind==='morning-weight')||(kind==='energy'&&preview.kind==='energy'))?preview:null;
 const linked=!!linkedTrend(Object.fromEntries(params)),shared=kind!=="overview",adaptive=mobile||shared;
 const tickLabels=kind==='body'?(model?.ticks??[0,99]).map(value=>value.toFixed(1)):model?.ticks??[0,1000];
 const {width:measured,left,height:measuredHeight}=useChartViewport(ref,tickLabels,kind==='body'?48:50),width=measured||280,right=kind==='body'?16:10,top=kind==='body'?14:20,plotWidth=width-left-right;
 useEffect(()=>{const timer=setTimeout(()=>setSlow(true),8000);return()=>clearTimeout(timer);},[]);
 const body=kind==='body',title={overview:'总览',nutrition:'饮食',energy:'消耗',body:'身体'}[kind];
 const labels=kind==='nutrition'?['热量','蛋白质','碳水','脂肪']:body?['晨间体重','','7日平均体重']:['总消耗','静息','活动'];
 const range=params.get('view')==='trend'?'custom':mobile?'7':'30',date=linkedDate(params.get('date'))??'';
 const svgHeight=kind==='energy'&&measuredHeight>0?measuredHeight:kind==='nutrition'?(adaptive?top+plotWidth/2+32:194):kind==='energy'?(adaptive?top+plotWidth/2+32:width<650?198:254):shared?top+plotWidth/2+32:mobile?180:252;
 return <div className="workspace-skeleton" aria-busy="true" aria-label={title+'数据加载中'}>
 {kind==='overview'?<OverviewSkeleton date={date}/>:<RecordWorkspace title={title}>
 <RecordTrendPanel chartSummary={body?<SkeletonBlock width={180} height={14}/>:undefined} date={date} view={()=>{}} presentation={kind} loading
  metrics={labels.map((label,index)=>({label,value:'',tone:kind==='energy'?index===1?'blue':index===2?'red':undefined:kind==='nutrition'&&index===0?'blue':undefined,action:body&&index===0?<button type="button" onClick={()=>window.dispatchEvent(new Event('formward-open-body-settings'))}>身体设置</button>:undefined,reserveNote:kind==='nutrition'&&index>0,inlineUnit:body||kind==='nutrition'&&index>0,unit:body?index===1?'':'kg':kind==='nutrition'&&index>0?'g':'kcal'}))}
  title={kind==='nutrition'?'每日摄入':body?'体重 · kg':'每日消耗'} unit={body?undefined:'kcal'} range={<ChartRanges value={range} change={()=>{}} loading/>}
  options={kind==='nutrition'?<InlineChartControls><div role="group" aria-label="营养占比口径"><button type="button" disabled aria-pressed>克数占比</button><button type="button" disabled aria-pressed={false}>能量占比</button></div></InlineChartControls>:body?<label className={bodyStyles.toggle}><span>晚间</span><input aria-label="晚间数据" type="checkbox" disabled checked={params.get("view")!=="trend"} readOnly/></label>:undefined}
  legend={kind==='nutrition'?<NutritionLegend/>:body?<><span><i style={{background:'var(--gold)',borderRadius:'50%'}}/>晨间空腹</span>{params.get('view')!=='trend'&&<span><i style={{background:'var(--data-deficit)',borderRadius:'50%'}}/>晚间</span>}</>:<EnergyLegend/>}
  graphic={kind==='nutrition'?<SkeletonBlock width={84} height={84} radius={42}/>:kind==='energy'?<EnergyComposition resting={null} active={null}/>:<div className="body-spark"><SkeletonBlock height={32}/></div>}>
 <SkeletonPlotFrame kind={kind} frameRef={ref} shared={shared} linked={linked} adaptive={mobile===null&&!shared?'auto':adaptive} axisLeft={"max("+(kind==="body"?48:50)+"px, calc("+Math.max(...tickLabels.map(value=>String(value).length))+"ch + 12px))"}>
  <svg preserveAspectRatio="none" viewBox={'0 0 '+width+' '+svgHeight} aria-hidden="true"><g data-chart-placeholder stroke="var(--line-soft)">{[0,.33,.66,1].map(part=><line key={part} x1={left} x2={width-right} y1={top+(svgHeight-top-32)*part} y2={top+(svgHeight-top-32)*part}/>)}</g>
  {!model&&<g className="skeleton-chart-geometry" fill="var(--line-soft)" data-chart-placeholder>{kind==='body'?<rect x={left+8} y={top+(svgHeight-top-32)/2} width={plotWidth-16} height={9} rx={4.5}/>:Array.from({length:7},(_,i)=><rect key={i} x={left+plotWidth/7*(i+.24)} y={top+24} width={plotWidth/7*.52} height={Math.max(30,svgHeight-top-70)} rx={4}/>)}{[0,1,2,3].map(i=><rect key={i} x={left+(plotWidth-26)*i/3} y={svgHeight-16} width={26} height={7} rx={3}/>)}</g>}
  {model&&<TrendGlyph model={model} skeleton target={measured>0} x={left} y={top} width={plotWidth} height={plotWidth/2}/>}</svg>
 </SkeletonPlotFrame>{body&&<output className={measurementStyles.plotHint} aria-hidden="true"> </output>}
 </RecordTrendPanel>
 {kind==='energy'&&sourcePilot&&<EnergySourceStatusSkeleton/>}
 <DailyRecords loading actions={kind==='nutrition'?<button type="button" disabled>食材库</button>:undefined}/>
 </RecordWorkspace>}
 {slow&&<div className="skeleton-retry" role="status">读取时间较长。<button onClick={()=>router.refresh()}>重试</button><button onClick={()=>router.push('/dashboard')}>返回总览</button></div>}
 </div>;
}
function OverviewSkeleton({date}:{date:string}){return <RecordWorkspace title="总览" className={overview.workspace}>
 <MetricCardRailSkeleton/>
 <div className={overview.mobileTrend+' mobile-only'}><div className={overview.mobileTrendHeading}><h2>能量与次晨变化</h2><button type="button" disabled>查看记录 →</button></div><ChartRanges value="7" change={()=>{}} loading/><div className={overview.mobileSelected}>{date?<time>{date}</time>:<SkeletonBlock width={90} height={16}/>}<SkeletonBlock width={115} height={20}/></div><div className={overview.mobileLegend}><OverviewLegend compact/></div><div className="skeleton-relationship"><SkeletonBlock height={132}/><SkeletonBlock height={68}/></div></div>
 <div className="desktop-only"><RecordTrendPanel date={date} view={()=>{}} loading metrics={['摄入','消耗','收支','晨重','次晨','次晨变化'].map((label,index)=>({label,value:'',unit:index<3?'kcal':'kg',inlineUnit:index>=3}))} title="热量收支" unit="kcal" supplementary={<div className="skeleton-week"><OverviewReadings mobile={false} variants={[]}/></div>} range={<ChartRanges value="30" change={()=>{}} loading/>}  legend={<OverviewLegend/>}><div className="skeleton-relationship"><SkeletonBlock height={220}/><SkeletonBlock height={112}/></div></RecordTrendPanel></div>
 </RecordWorkspace>;}
function SkeletonPlotFrame({children,kind,frameRef,shared,linked,adaptive,axisLeft}:{children:React.ReactNode;kind:string;frameRef:React.RefObject<HTMLDivElement|null>;shared:boolean;linked:boolean;adaptive:boolean|'auto';axisLeft:string}){
 if(kind==='energy')return <EnergyPlotFrame frameRef={frameRef} adaptive={adaptive} className={linked?'linked-trend-plot':'detail-trend-plot'}>{children}</EnergyPlotFrame>;
 return <div ref={frameRef} className={'skeleton-plot'+(linked?' linked-trend-plot':' detail-trend-plot')} style={shared?{"--skeleton-axis-left":axisLeft} as React.CSSProperties:undefined} data-chart-arrival data-plot-kind={kind} data-shared-plot={shared?'true':undefined}>{children}</div>;
}
