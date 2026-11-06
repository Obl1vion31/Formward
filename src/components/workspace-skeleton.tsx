"use client";
import {useEffect,useRef,useState} from 'react';
import {useSearchParams,useRouter} from 'next/navigation';
import {RecordTrendPanel,ChartOptions,InlineChartControls} from './record-trend-panel';
import {useChartTransition} from './chart-transition-state';
import {ChartRanges} from './chart-ranges';
import {TrendGlyph} from './trend-glyph';
import {useChartViewport} from './use-chart-viewport';
import {useMobileMode} from './use-mobile-mode';
import {SkeletonBlock} from './skeleton-block';
import {OverviewReadings} from '@/features/dashboard/overview-trend';
import measurementStyles from '@/features/measurements/measurements-view.module.css';
import overview from '@/features/dashboard/overview.module.css';
export function WorkspaceSkeleton({kind}:{kind:'overview'|'nutrition'|'energy'|'body'}){
 const {preview}=useChartTransition(),ref=useRef<HTMLDivElement>(null),router=useRouter(),[slow,setSlow]=useState(false),params=useSearchParams(),mobile=useMobileMode();
 const model=preview&&((kind==='nutrition'&&preview.kind==='intake')||(kind==='body'&&preview.kind==='morning-weight'))?preview:null;
 const {width:measured,left}=useChartViewport(ref,model?.ticks??[0,1000],kind==='body'?48:50),width=measured||280,right=kind==='body'?16:10,top=kind==='body'?14:20,plotWidth=width-left-right;
 useEffect(()=>{const timer=setTimeout(()=>setSlow(true),8000);return()=>clearTimeout(timer);},[]);
 const body=kind==='body',title={overview:'总览',nutrition:'饮食',energy:'消耗',body:'身体'}[kind];
 const labels=kind==='nutrition'?['热量','蛋白质','碳水','脂肪']:body?['晨间体重']:['总消耗','静息','活动'];
 const range=params.get('view')==='trend'?'custom':mobile?'7':'30';
 const svgHeight=kind==='nutrition'?(mobile?top+plotWidth/2+32:194):kind==='energy'?(width<650?198:254):mobile&&params.get('view')==='trend'?top+plotWidth/2+32:mobile?180:252;
 return <div className="workspace-skeleton" aria-busy="true" aria-label={title+'数据加载中'}>
 {kind==='overview'?<OverviewSkeleton/>:<>
 {body&&<div className="body-metric-picker" aria-hidden="true"><span>体重</span></div>}
 <RecordTrendPanel date="" view={()=>{}} presentation={kind} loading metrics={labels.map((label,index)=>({label,value:'',reserveNote:kind==='nutrition'&&index>0||body,inlineUnit:body||kind==='nutrition'&&index>0,unit:body?'kg':kind==='nutrition'&&index>0?'g':'kcal'}))} title={kind==='nutrition'?'每日摄入':body?'体重 · kg':'每日消耗'} unit={body?undefined:'kcal'} range={<ChartRanges value={range} change={()=>{}}/>} options={kind==='nutrition'?<InlineChartControls><div role="group" aria-label="营养占比口径"><button type="button" aria-pressed>克数占比</button><button type="button" aria-pressed={false}>能量占比</button></div></InlineChartControls>:body?<ChartOptions label="图表选项"><span/></ChartOptions>:undefined} legend={kind==='nutrition'?<><span>蛋白质</span><span>碳水</span><span>脂肪</span></>:body?<><span>晨间空腹</span><span>晚间</span></>:<><span>静息</span><span>活动</span><span>录入总数</span></>} graphic={kind==='nutrition'?<SkeletonBlock width={84} height={84} radius={42}/>:kind==='energy'?<SkeletonBlock width={112} height={42} radius={8}/>:undefined}>
 <div ref={ref} className="skeleton-plot" data-chart-arrival data-plot-kind={kind} data-shared-plot={model||params.get('view')==='trend'?'true':undefined}><svg viewBox={'0 0 '+width+' '+svgHeight} aria-hidden="true">{model&&<TrendGlyph model={model} skeleton target={measured>0} x={left} y={top} width={plotWidth} height={plotWidth/2}/>}</svg></div>{body&&<output className={measurementStyles.plotHint} aria-hidden="true"> </output>}
 </RecordTrendPanel></>}
 {slow&&<div className="skeleton-retry" role="status">读取时间较长。<button onClick={()=>router.refresh()}>重试</button><button onClick={()=>router.push('/dashboard')}>返回总览</button></div>}
 </div>;
}
function OverviewSkeleton(){return <>
 <div className="skeleton-rail mobile-only"><div><span>今日摄入</span><SkeletonBlock width={120} height={32}/><SkeletonBlock width={90} height={14}/></div><div><span>最近晨重</span><SkeletonBlock width={100} height={32}/></div></div>
 <div className={overview.mobileTrend+' mobile-only'}><div className={overview.mobileTrendHeading}><h2>能量与次晨变化</h2><button disabled>查看记录 →</button></div><ChartRanges value="7" change={()=>{}}/><div className={overview.mobileSelected}><SkeletonBlock width={90} height={16}/><SkeletonBlock width={115} height={20}/></div><div className={overview.mobileLegend}><span>摄入</span><span>消耗</span><span>金／蓝填色：盈余／缺口</span></div><div className="skeleton-relationship"><SkeletonBlock height={132}/><SkeletonBlock height={68}/></div></div>
 <div className="desktop-only"><RecordTrendPanel date="" view={()=>{}} loading metrics={['摄入','消耗','收支','晨重','次晨','次晨变化'].map((label,index)=>({label,value:'',unit:index<3?'kcal':'kg'}))} title="热量收支" unit="kcal" supplementary={<div className="skeleton-week"><OverviewReadings mobile={false} variants={[]}/></div>} range={<ChartRanges value="30" change={()=>{}}/>} options={<InlineChartControls><label><input type="checkbox" disabled aria-label="显示体重估计"/>显示体重估计</label></InlineChartControls>} legend={<><span><i/>摄入</span><span><i/>消耗</span><span><i/>盈余</span><span><i/>缺口</span><span><i style={{background:"transparent",border:"1px solid var(--data-blue)",borderRadius:"50%",width:7,height:7}}/>空心点：未记全／待确认</span></>}><div className="skeleton-relationship"><SkeletonBlock height={220}/><SkeletonBlock height={112}/></div></RecordTrendPanel></div>
 </>;}
