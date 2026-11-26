"use client";
import {linkedDate} from "@/features/measurements/calendar";
import {useRouter} from 'next/navigation';
import {useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Inspector} from './inspector';
import {EntrySurfaceContext,type EntryMetadata,type EntryGuards} from './entry-surface-state';
import {DraftGuardContext,DraftCloseContext,InspectorBusyContext,InspectorStepContext} from './draft-guard';
import {MealEditor} from "@/features/meals/meal-editor";
import {MeasurementEntry,MeasurementEntryHeader} from "@/features/measurements/measurement-entry";
import {localMeasurementDate} from "@/features/measurements/entry-state";
import bodyStyles from "@/features/measurements/measurements-view.module.css";
import {EnergyEditor} from "@/features/activities/energy-editor";
import {WorkspaceSourceContext} from "./workspace-frame-state";
import {useChartTransitionActions} from './chart-transition-state';
import {useRepeatedRecordTask} from './record-intent-client';
import {useWorkspaceReturn} from './workspace-return';
export function EntrySurface({children,path,query}:{children:ReactNode;path:string;query:URLSearchParams}){
 const router=useRouter(),entry=query.get('entry'),routeKey=path+'?'+query.toString();
 const requested=query.getAll('entry').length===1&&query.getAll('date').length<=1&&(!query.has('date')||linkedDate(query.get('date'))!==null)&&(path==='/dashboard/measurements'?(entry==='daytime'||entry==='evening'):['/dashboard/meals','/dashboard/energy'].includes(path)&&entry==='1'),[closed,setClosed]=useState('');
 const [intent,setIntent]=useState({url:routeKey,requested,id:0});
 useRepeatedRecordTask(path,task=>{if(task.intent!=='create')return false;setIntent(current=>({...current,id:current.id+1}));});
 if(intent.url!==routeKey||intent.requested!==requested)setIntent({url:routeKey,requested,id:intent.id+1});
 const key=routeKey+'#'+intent.id;
 const [binding,setBinding]=useState<{key:string;meta:EntryMetadata}|null>(null),[slot,setSlot]=useState<HTMLElement|null>(null),[headerSlot,setHeaderSlot]=useState<HTMLElement|null>(null),[guards,setGuards]=useState<EntryGuards|null>(null);
 const closeHost=useRef<()=>void>(()=>{}),[seen,setSeen]=useState(''),active=requested&&closed!==key,meta=binding?.key===key?binding.meta:null;
 const {invalidate}=useChartTransitionActions();
 const {watchEntry,entryClosed}=useWorkspaceReturn()??{};
 useLayoutEffect(()=>active?watchEntry?.(()=>closeHost.current()):undefined,[active,watchEntry]);
 useLayoutEffect(()=>{if(active)invalidate();},[active,invalidate]);
 const [failure,setFailure]=useState<{key:string;reset:()=>void}|null>(null);
 const reportFailure=useCallback((reset:()=>void)=>setFailure({key,reset}),[key]);
 const register=useCallback((value:EntryMetadata)=>{setSeen(key);setBinding({key,meta:value});return()=>setBinding(current=>current?.key===key&&current.meta===value?null:current);},[key]);
 useEffect(()=>{if(active&&seen===key&&!meta){closeHost.current();}},[active,key,meta,seen]);
 const context=useMemo(()=>({active,slot,headerSlot,guards,register,reportFailure}),[active,slot,headerSlot,guards,register,reportFailure]);
 const done=()=>{setClosed(key);meta?.close();if(entryClosed)entryClosed(path);else router.replace(path);};
 const estimate=path==="/dashboard/energy"&&query.get("mode")==="estimate";
 const title=path.endsWith('/meals')?'记录一餐':path.endsWith('/energy')?estimate?'估算全天消耗':'每日消耗':'身体录入';
 return <EntrySurfaceContext value={context}>{children}{active&&<Inspector title={meta?.title??title} titleParts={meta?.titleParts} wide={meta?.wide??path.endsWith('/meals')} stableScroll={meta?.stableScroll} compact={meta?.compact} fitContent={meta?.fitContent??path.endsWith("/measurements")} className={meta?.className??(path.endsWith("/measurements")?bodyStyles.drawer:undefined)} busy={meta?.busy??false} closeLabel={meta?.closeLabel} close={done} onCloseReady={close=>{closeHost.current=close;meta?.onCloseReady?.(close);}} onSavedCloseReady={close=>meta?.onSavedCloseReady?.(close)} header={meta?.customHeader?<div ref={setHeaderSlot}/>:path.endsWith("/measurements")?<MeasurementEntryHeader date={query.get("date")??localMeasurementDate()}/>:undefined}>
  <CaptureGuards change={setGuards}/><div ref={setSlot} data-entry-surface-slot>{!meta&&seen!==key&&<PendingFields key={key} path={path} date={query.get('date')} estimate={estimate} period={entry==="evening"?"evening":"daytime"} failed={failure?.key===key} retry={()=>{if(failure?.key===key)failure.reset();else router.refresh();setFailure(null);}}/>}</div>
 </Inspector>}</EntrySurfaceContext>;
}
function CaptureGuards({change}:{change:(value:EntryGuards|null)=>void}){const register=useContext(DraftGuardContext),close=useContext(DraftCloseContext),busy=useContext(InspectorBusyContext),step=useContext(InspectorStepContext);useLayoutEffect(()=>{if(register&&close)change({register,close,busy,step});return()=>change(null);},[register,close,busy,step,change]);return null;}
function PendingFields({path,date,period,estimate,failed,retry}:{path:string;date:string|null;period:"daytime"|"evening";estimate:boolean;failed:boolean;retry:()=>void}){
 const sourcePilot=useContext(WorkspaceSourceContext);
 const[slow,setSlow]=useState(false),[attempt,setAttempt]=useState(0);useEffect(()=>{const timer=setTimeout(()=>setSlow(true),8000);return()=>clearTimeout(timer);},[attempt]);
 const onRetry=failed||slow?()=>{setSlow(false);setAttempt(value=>value+1);retry();}:undefined,error=failed?"读取失败，请重试。":"";
 return <div className={path.endsWith("/meals")?"pending-entry-fields pending-meal-fields":"pending-entry-fields"} aria-busy={!failed} aria-label="读取录入所需数据">{path.endsWith("/meals")?<MealEditor pending onRetry={onRetry} initial={{date:date??localMeasurementDate(),mealType:"",items:[]}} foods={[]} error={error} busy={false} save={async()=>{}}/>:path.endsWith("/energy")?<EnergyEditor pending quickStart={estimate} onRetry={onRetry} initial={{kind:"save_energy_day",date:date??localMeasurementDate(),entryMode:estimate?"total":"components",...(estimate?{calculation:{kind:"daily",method:"auto"}}:{})}} stepsEnabled={sourcePilot} sources={[]} removeSource={async()=>({ok:false,error:"正在读取"})} busy={false} error={error} save={()=>{}}/>:<div className={bodyStyles.drawerContent} data-record-intent="create"><MeasurementEntry pending onRetry={onRetry} readError={error} date={date??localMeasurementDate()} timezone="Asia/Shanghai" records={[]} sources={[]} choices={{}} initialPeriod={period} actions={{save:async()=>({ok:false,error:"正在读取"}),removeSource:async()=>({ok:false,error:"正在读取"})}} onUpdated={()=>{}} onChoose={()=>{}}/></div>}</div>;
}
