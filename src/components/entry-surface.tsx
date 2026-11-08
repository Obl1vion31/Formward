"use client";
import {useSearchParams,usePathname,useRouter} from 'next/navigation';
import {useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Inspector} from './inspector';
import {EntrySurfaceContext,type EntryMetadata,type EntryGuards} from './entry-surface-state';
import {DraftGuardContext,DraftCloseContext,InspectorBusyContext} from './draft-guard';
import {SkeletonBlock} from './skeleton-block';
import {useChartTransition} from './chart-transition-state';
import {useRepeatedRecordTask} from './record-intent-client';
export function EntrySurface({children}:{children:ReactNode}){
 const path=usePathname(),query=useSearchParams(),router=useRouter(),entry=query.get('entry'),routeKey=path+'?'+query.toString();
 const requested=!!entry&&['/dashboard/meals','/dashboard/measurements','/dashboard/energy'].includes(path),[closed,setClosed]=useState('');
 const [intent,setIntent]=useState({url:routeKey,requested,id:0});
 useRepeatedRecordTask(path,task=>{if(task.intent!=='create')return false;setIntent(current=>({...current,id:current.id+1}));});
 if(intent.url!==routeKey||intent.requested!==requested)setIntent({url:routeKey,requested,id:intent.id+1});
 const key=routeKey+'#'+intent.id;
 const [binding,setBinding]=useState<{key:string;meta:EntryMetadata}|null>(null),[slot,setSlot]=useState<HTMLElement|null>(null),[headerSlot,setHeaderSlot]=useState<HTMLElement|null>(null),[guards,setGuards]=useState<EntryGuards|null>(null);
 const closeHost=useRef<()=>void>(()=>{}),[seen,setSeen]=useState(''),active=requested&&closed!==key,meta=binding?.key===key?binding.meta:null;
 const {invalidate}=useChartTransition();
 useLayoutEffect(()=>{if(active)invalidate();},[active,invalidate]);
 const [failure,setFailure]=useState<{key:string;reset:()=>void}|null>(null);
 const reportFailure=useCallback((reset:()=>void)=>setFailure({key,reset}),[key]);
 const register=useCallback((value:EntryMetadata)=>{setSeen(key);setBinding({key,meta:value});return()=>setBinding(current=>current?.key===key&&current.meta===value?null:current);},[key]);
 useEffect(()=>{if(active&&seen===key&&!meta){closeHost.current();}},[active,key,meta,seen]);
 const context=useMemo(()=>({active,slot,headerSlot,guards,register,reportFailure}),[active,slot,headerSlot,guards,register,reportFailure]);
 const done=()=>{setClosed(key);if(meta)meta.close();else if(seen!==key)router.replace(path);};
 const title=path.endsWith('/meals')?'记录一餐':path.endsWith('/energy')?'每日消耗':'身体录入';
 return <EntrySurfaceContext value={context}>{children}{active&&<Inspector title={meta?.title??title} titleParts={meta?.titleParts} wide={meta?.wide??path.endsWith('/meals')} stableScroll={meta?.stableScroll} compact={meta?.compact} className={meta?.className} busy={meta?.busy??false} closeLabel={meta?.closeLabel} close={done} onCloseReady={close=>{closeHost.current=close;meta?.onCloseReady?.(close);}} onSavedCloseReady={close=>meta?.onSavedCloseReady?.(close)} header={meta?.customHeader?<div ref={setHeaderSlot}/>:undefined}>
  <CaptureGuards change={setGuards}/><div ref={setSlot} data-entry-surface-slot>{!meta&&seen!==key&&<PendingFields key={key} date={query.get('date')} failed={failure?.key===key} retry={()=>{if(failure?.key===key)failure.reset();else router.refresh();setFailure(null);}}/>}</div>
 </Inspector>}</EntrySurfaceContext>;
}
function CaptureGuards({change}:{change:(value:EntryGuards|null)=>void}){const register=useContext(DraftGuardContext),close=useContext(DraftCloseContext),busy=useContext(InspectorBusyContext);useLayoutEffect(()=>{if(register&&close)change({register,close,busy});return()=>change(null);},[register,close,busy,change]);return null;}
function PendingFields({date,failed,retry}:{date:string|null;failed:boolean;retry:()=>void}){const[slow,setSlow]=useState(false);useEffect(()=>{const timer=setTimeout(()=>setSlow(true),8000);return()=>clearTimeout(timer);},[]);return <div className="pending-entry-fields" aria-busy={!failed} aria-label="读取录入所需数据"><time>{date?.replaceAll('-','.')}</time>{failed?<p role="alert">暂时无法读取已保存的值，请重试。</p>:<><SkeletonBlock height={44}/><SkeletonBlock height={44}/><SkeletonBlock width="70%" height={44}/><p>{slow?'读取时间较长，可以重试或关闭面板返回。':'正在读取已保存的值…'}</p></>}{(failed||slow)&&<button type="button" onClick={retry}>重新读取</button>}</div>;}
