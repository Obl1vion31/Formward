"use client";
import {LocalLoading} from "./local-loading";
import {PlotLoadingGuides} from "./chart-preparation";
import {ChartSelectionColumn} from "./chart-selection-marker";
import {TrendAxes} from "./trend-axes";
import {addCalendarDays,linkedDate} from "@/features/measurements/calendar";
import bodyStyles from "@/features/measurements/measurements-view.module.css";
import {useContext,useLayoutEffect,useRef,useState} from 'react';
import {useSearchParams,useRouter} from 'next/navigation';
import {RecordWorkspace,RecordTrendPanel,InlineChartControls,type RecordMetric} from './record-trend-panel';
import {useChartTransition} from './chart-transition-state';
import {ChartRanges} from './chart-ranges';
import {useChartViewport} from './use-chart-viewport';
import {useMobileMode} from './use-mobile-mode';
import {WorkspacePending} from "@/features/dashboard/workspace-cache";
import {DailyRecords} from './daily-records';
import {WorkspaceSourceContext} from './workspace-frame-state';
import {EnergySourceStatusSkeleton} from '@/features/data-sources/energy-status';
import {NutritionLegend,EnergyLegend} from './chart-legend';
import {MetricCardRailPending} from './metric-card-rail';
import {TrendGlyph} from './trend-glyph';
import {linkedTrend} from './metric-trend-model';
import {OverviewTrendLayout} from '@/features/dashboard/overview-trend-layout';
import measurementStyles from '@/features/measurements/measurements-view.module.css';
import {NutritionComposition} from "@/features/meals/nutrition-composition";
import {EnergyComposition} from '@/features/activities/energy-composition';
import {EnergyPlotFrame} from '@/features/activities/energy-plot-frame';
import {relationshipFrameStyle} from "@/features/dashboard/relationship-frame";
import {formatRecordNumber} from "./number-format";
import {formatNutrition,macroComposition} from "@/features/meals/model";
import overview from '@/features/dashboard/overview.module.css';
export function WorkspaceLoading({kind,returnShell=false,destination}:{kind:'overview'|'nutrition'|'energy'|'body';returnShell?:boolean;destination?:string}){
 const sourcePilot=useContext(WorkspaceSourceContext);
 const {preview,previewReadings,returningToOverview,sceneLeaving,recallOverview}=useChartTransition(),ref=useRef<HTMLDivElement>(null),router=useRouter(),[attempt,setAttempt]=useState(0),routeParams=useSearchParams(),mobile=useMobileMode(),params=destination?new URL(destination,'https://formward.invalid').searchParams:routeParams;
 const model=preview&&((kind==='nutrition'&&preview.kind==='intake')||(kind==='body'&&preview.kind==='morning-weight')||(kind==='energy'&&preview.kind==='energy'))?preview:null;
 const linkedRange=linkedTrend(Object.fromEntries(params)),linked=!!linkedRange,shared=kind!=="overview",adaptive=mobile||shared;
 const tickLabels=kind==='body'?(model?.ticks??[]).map(value=>value.toFixed(1)):model?.ticks??[];
 const {width:measured,left,height:measuredHeight,fontSize}=useChartViewport(ref,tickLabels,kind==='body'?48:50),width=measured||280,right=kind==='body'?16:10,top=kind==='body'?14:20,plotWidth=width-left-right;
 const waiting=(!returnShell||returningToOverview)&&!(destination&&sceneLeaving);
 const entryOpen=params.has('entry');
 const retry=()=>{setAttempt(value=>value+1);if(kind==='overview'&&returningToOverview)router.push('/dashboard',{scroll:false});else router.refresh();};
 const readingStatus=waiting&&!entryOpen?<LocalLoading key={attempt} onRetry={retry}/>:null;
 const body=kind==='body',title={overview:'总览',nutrition:'饮食',energy:'消耗',body:'身体'}[kind];
 const labels=kind==='nutrition'?['热量','蛋白质','碳水','脂肪']:body?['晨间体重','晨间体脂率','7日平均体重']:['总消耗','静息','活动'];
 const range=params.get('view')==='trend'?'custom':mobile?'7':'30',date=kind==='overview'?'':linkedDate(params.get('date'))??'';
 const readings=model&&previewReadings?.kind===model.kind&&previewReadings.date===date?previewReadings:null;
 const metrics:RecordMetric[]=labels.map((label,index)=>({label,value:'',pending:true,tone:kind==='energy'?index===1?'blue':index===2?'red':undefined:kind==='nutrition'&&index===0?'blue':undefined,action:body&&index===0?<button type="button" onClick={()=>window.dispatchEvent(new Event('formward-open-body-settings'))}>身体设置</button>:undefined,reserveNote:kind==='nutrition'&&index>0,inlineUnit:body||kind==='nutrition'&&index>0,unit:body?index===1?'%':'kg':kind==='nutrition'&&index>0?'g':'kcal'}));
 if(readings?.kind==='intake'){
   const shares=macroComposition(readings.totals);
   (["caloriesKcal","proteinG","carbsG","fatG"] as const).forEach((key,index)=>{
     const value=readings.totals.values[key];
     metrics[index]={...metrics[index],value:formatNutrition(value,key),pending:value==null,note:value==null?undefined:readings.totals.incomplete[key]?"已知部分":index>0&&shares.kind==='known'?((shares.segments.find(segment=>segment.metric===key)?.ratio??0)*100).toFixed(1)+'%':undefined};
   });
 }else if(readings?.kind==='energy'){
   [readings.totalKcal,readings.restingKcal,readings.activeKcal].forEach((value,index)=>{metrics[index]={...metrics[index],value:formatNutrition(value??null,'caloriesKcal'),pending:value==null};});
 }else if(readings?.kind==='morning-weight')metrics[0]={...metrics[0],value:formatRecordNumber(readings.weightKg),pending:readings.weightKg==null};
 const detailStatus=metrics[0]?.pending?null:readingStatus;
 const primaryStatus=metrics[0]?.pending?readingStatus:null;
 const mobileMetrics=body?[metrics[0],{label:'较前一日',value:'',pending:true,unit:'kg',inlineUnit:true},metrics[2]]:undefined;
 const svgHeight=measuredHeight>0?measuredHeight:kind==='nutrition'?(adaptive?top+(width-50-right)/2+32:194):kind==='energy'?(adaptive?top+plotWidth/2+32:width<650?198:254):shared?top+(width-(kind==='body'?48:50)-right)/2+32:mobile?180:252;
 const dates=model?.points.map(point=>point.date)??(linkedRange?Array.from({length:Math.round((Date.parse(linkedRange.to)-Date.parse(linkedRange.from))/86400000)+1},(_,index)=>addCalendarDays(linkedRange.from,index)):[]);
 const plotKind=kind==='body'?'morning-weight':kind==='energy'?'energy':'intake';
 const selectedIndex=dates.indexOf(date);
 const dayWidth=dates.length?plotWidth/dates.length:0;
 const selectedX=selectedIndex<0?null:left+(selectedIndex+.5)*dayWidth;
 const content=<div data-workspace-reading={!returnShell||returningToOverview||undefined} aria-busy={waiting||undefined} aria-label={title}>
 {kind==='overview'?<OverviewLoading date={date} rangeMode={recallOverview()?.mode??undefined} readingStatus={readingStatus}/>:<RecordWorkspace title={title}>
 <div data-record-trend>
 <RecordTrendPanel chartSummary={body?<span aria-hidden="true"> </span>:undefined} date={date} view={()=>{}} presentation={kind} loading
  metrics={metrics} mobileMetrics={mobileMetrics} readingStatus={primaryStatus}
  title={kind==='nutrition'?'每日摄入':body?'体重 · kg':'每日消耗'} unit={body?undefined:'千卡'} range={<ChartRanges value={range} change={()=>{}} loading/>}
  options={kind==='nutrition'?<InlineChartControls><div role="group" aria-label="营养占比口径"><button type="button" disabled aria-pressed>克数占比</button><button type="button" disabled aria-pressed={false}>能量占比</button></div></InlineChartControls>:body?<PendingEvening linked={linked}/>:undefined}
  legend={kind==='nutrition'?<NutritionLegend/>:body?<><span><i style={{background:'var(--data-weight)',borderRadius:'50%'}}/>晨间空腹</span>{params.get('view')!=='trend'&&<span><i style={{background:'var(--data-deficit)',borderRadius:'50%'}}/>晚间</span>}</>:<EnergyLegend/>}
  graphic={kind==="energy"?<EnergyComposition resting={readings?.kind==="energy"?readings.restingKcal:null} active={readings?.kind==="energy"?readings.activeKcal:null} loading={readings?.kind!=="energy"||readings.restingKcal==null||readings.activeKcal==null}/>:kind==="nutrition"?<NutritionComposition totals={readings?.kind==="intake"?readings.totals:null} loading={readings?.kind!=="intake"||macroComposition(readings.totals).kind==="unknown"}/>:undefined}>
 <PendingPlotFrame kind={kind} frameRef={ref} shared={shared} linked={linked} adaptive={mobile===null&&!shared?'auto':adaptive} short={model?model.points.length<=7:linkedRange?(Date.parse(linkedRange.to)-Date.parse(linkedRange.from))/86400000<7:range==="7"} axisLeft={"max("+(kind==="body"?48:50)+"px, calc("+Math.max(...tickLabels.map(value=>String(value).length))+"ch + 12px))"}>
  {waiting&&!entryOpen&&!linked&&!model&&<PlotLoadingGuides top={top} right={right} bottom={32} left={left}/>}
  <svg preserveAspectRatio="none" viewBox={'0 0 '+width+' '+svgHeight} aria-hidden="true">
   {dates.length>0&&<TrendAxes kind={plotKind} dates={dates} model={model} width={width} left={left} right={right} top={top} bottom={svgHeight-32} fontSize={fontSize} axisClass="pending-axis" gridClass="pending-grid"/>}
   {model&&!body&&selectedX!==null&&<ChartSelectionColumn x={selectedX} date={date} column={{left:selectedX-dayWidth/2,right:selectedX+dayWidth/2}} plot={{left,right:width-right,top,bottom:svgHeight-32}} resetKey={date} direct baselineTick/>}
   {model&&<TrendGlyph detail target={measured>0} skeleton model={model} x={left} y={top} width={plotWidth} height={svgHeight-top-32}/>}
  </svg>
 </PendingPlotFrame>{body&&<output className={measurementStyles.plotHint} aria-hidden="true"> </output>}
 </RecordTrendPanel></div>
 <DailyRecords loading readingStatus={detailStatus} kind={body?"body":undefined} actions={kind==='nutrition'?<button type="button" disabled>食材库</button>:undefined}/>
 {kind==='energy'&&sourcePilot&&<EnergySourceStatusSkeleton/>}
 </RecordWorkspace>}
 </div>;
 // 返回意图先于URL提交，明确读取总览自己的真实快照，不借用仍在地址栏中的详情条件。
 // 前进完成后预备隐藏的本人缓存，避免点击返回时才构建整页。专属预备标记
 // 阻止注册图形、消费焦点与提示；刷新上下文阻止它冒充真实读取完成。
 if(destination)return content;
 return kind==='overview'&&(returnShell||returningToOverview)
  ?returningToOverview||!sceneLeaving?<WorkspacePending path="/dashboard" query="">{content}</WorkspacePending>:content
  :<WorkspacePending>{content}</WorkspacePending>;
}
function OverviewLoading({date,rangeMode,readingStatus}:{date:string;rangeMode?:string;readingStatus?:React.ReactNode}){return <RecordWorkspace title="总览" className={overview.workspace}>
 <MetricCardRailPending readingStatus={readingStatus}/>
 <OverviewTrendLayout date={date} range={rangeMode??"30"} mobileRange={rangeMode??"7"} changeRange={()=>{}}>
  <div className={overview.relationship+" "+overview.waitingPlot} style={relationshipFrameStyle}/>
 </OverviewTrendLayout>
 </RecordWorkspace>;}
function PendingPlotFrame({children,kind,frameRef,shared,linked,adaptive,axisLeft,short}:{children:React.ReactNode;kind:string;frameRef:React.RefObject<HTMLDivElement|null>;shared:boolean;linked:boolean;adaptive:boolean|'auto';axisLeft:string;short:boolean}){
 if(kind==='energy')return <EnergyPlotFrame frameRef={frameRef} compact={short} adaptive={adaptive} className={linked?'linked-trend-plot':'detail-trend-plot'}>{children}</EnergyPlotFrame>;
 return <div ref={frameRef} data-chart-density={short?"short":"full"} className={'pending-plot'+(linked?' linked-trend-plot':' detail-trend-plot')} style={shared?{"--pending-axis-left":axisLeft} as React.CSSProperties:undefined} data-chart-arrival data-plot-kind={kind} data-shared-plot={shared?'true':undefined}>{children}</div>;
}

function PendingEvening({linked}:{linked:boolean}){const input=useRef<HTMLInputElement>(null);useLayoutEffect(()=>{if(input.current)input.current.indeterminate=!linked;},[linked]);return <label className={bodyStyles.toggle}><span>晚间</span><input ref={input} aria-label="晚间数据，正在读取" aria-checked={linked?false:"mixed"} type="checkbox" disabled readOnly/></label>;}
