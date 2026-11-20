"use client";
import {usePathname,useSearchParams} from 'next/navigation';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {LoadingLink} from './loading-link';
import {WorkspaceLoading} from './workspace-loading';
import {EntrySurface} from './entry-surface';
import {Inspector} from './inspector';
import {BodySettings} from '@/features/measurements/body-settings';
import {useLocalToday} from './use-local-today';
import {workspacePages} from './workspace-pages';
import {animateWorkspaceScene,createWorkspaceMotion,workspaceMotionDirection} from './workspace-motion';
import styles from './workspace-frame.module.css';
import {useChartTransition,chartDestinationSearch} from './chart-transition-state';
import {WorkspaceSourceContext,WorkspaceTodayContext} from './workspace-frame-state';
import {useAssistant} from '@/features/assistant/context';
import {TrainingSkeleton} from '@/features/training/loading';

type WorkspaceKind = "overview" | "nutrition" | "training" | "energy" | "body";

function WorkspaceRouteContent({children,kind,cover,coverOldRoute}:{
 children:ReactNode;kind:WorkspaceKind;cover:"forward"|"return"|null;coverOldRoute:boolean;
}){
 const slot=useRef<HTMLDivElement>(null);
 const [empty,setEmpty]=useState(false);
 useLayoutEffect(()=>{
  const node=slot.current;
  if(!node||cover)return;

  const isEmpty=()=>[...node.children].every(child=>
   child.matches("script,style,template,[hidden]")||
   (child instanceof HTMLElement&&child.style.display==="none"));
  let missing=isEmpty();
  setEmpty(missing);

  // App Router 可能单独提交撤下等待内容的更新。先用同页外壳接住这段空档。
  const observe=()=>{
   observer.disconnect();
   observer.observe(node,{childList:true});
   for(const child of node.children)observer.observe(child,{attributes:true,attributeFilter:["hidden","style"]});
  };
  const observer=new MutationObserver(records=>{
   if(records.some(record=>record.type==="childList"))observe();
   const next=isEmpty();
   if(next===missing)return;
   missing=next;
   flushSync(()=>setEmpty(next));
  });
  observe();
  return()=>observer.disconnect();
 },[cover]);

 return <>
  <div ref={slot} data-route-content data-forward-covered={cover==="forward"||undefined}
   data-forward-old-route={coverOldRoute||undefined} data-return-covered={cover==="return"||undefined}
   aria-hidden={!!cover||undefined} inert={!!cover||undefined}>{children}</div>
  {!cover&&empty&&<div data-route-handoff>
   {kind==="training"?<TrainingSkeleton/>:<WorkspaceLoading key={kind} kind={kind}/>}
  </div>}
 </>;
}

export function WorkspaceFrame({children,today,sourcePilot=false}:{children:ReactNode;today:string;sourcePilot?:boolean}){
 // 输入方式只影响控件焦点提示，不参与键盘、视口或面板几何定位。
 useLayoutEffect(()=>{
  const root=document.documentElement;
  // 手机直达／刷新没有先前触摸事件，程序聚焦不先闪出键盘外框。
  root.dataset.inputMethod=matchMedia("(max-width:700px),(hover:none) and (pointer:coarse)").matches?"pointer":"keyboard";
  const pointer=()=>{root.dataset.inputMethod="pointer";};
  const keyboard=(event:KeyboardEvent)=>{if(["Tab","ArrowDown","ArrowUp","ArrowLeft","ArrowRight","Escape"].includes(event.key)||["Enter"," "].includes(event.key)&&event.target instanceof Element&&!event.target.closest("input,textarea,[contenteditable=true]"))root.dataset.inputMethod="keyboard";};
  document.addEventListener("pointerdown",pointer,true);document.addEventListener("keydown",keyboard,true);
  return()=>{document.removeEventListener("pointerdown",pointer,true);document.removeEventListener("keydown",keyboard,true);delete root.dataset.inputMethod;};
 },[]);
 const location=usePathname(),liveParams=useSearchParams(),{source}=useAssistant();
 const actualPath=source?.path??location,params=source?new URLSearchParams(source.query):liveParams;
 const {returningToOverview,forwardDestination,scene,sceneLeaving,revealScene,finishScene}=useChartTransition(),path=returningToOverview?'/dashboard':forwardDestination?new URL(forwardDestination,'https://formward.invalid').pathname:actualPath,search=params.toString(),localToday=useLocalToday(today),[settings,setSettings]=useState(false);
 const frame=useRef<HTMLDivElement>(null),previousLayer=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const layer=previousLayer.current,body=frame.current;
  if(!scene){layer?.replaceChildren();return;}
  if(!layer?.firstElementChild||!body){finishScene(scene.id);return;}
  return animateWorkspaceScene(layer,body,scene.direction,
   ()=>flushSync(()=>revealScene(scene.id)),()=>flushSync(()=>finishScene(scene.id)));
 },[scene,revealScene,finishScene]);
 const sceneActive=!!scene;
 const content=useRef<HTMLDivElement>(null),motion=useRef<ReturnType<typeof createWorkspaceMotion>|null>(null),previous=useRef({path,search,sceneActive});
 useLayoutEffect(()=>{
  const from=previous.current;previous.current={path,search,sceneActive};
  const controller=motion.current??=createWorkspaceMotion();
  if(from.path===path)return;
  if(content.current)controller.play(content.current,workspaceMotionDirection(from,{path,search},from.sceneActive||sceneActive),{distance:matchMedia('(max-width:700px),(hover:none) and (pointer:coarse)').matches?16:12,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches});
  else controller.stop();
 },[path,search,sceneActive]);
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)'),stop=()=>{if(query.matches)motion.current?.stop();};query.addEventListener('change',stop);return()=>{query.removeEventListener('change',stop);motion.current?.stop();};},[]);
 const page=path==="/dashboard/energy"?["/dashboard/energy","消耗"]:workspacePages.find(([href])=>href===path),kind=path==='/dashboard'?'overview':path.endsWith('/meals')?'nutrition':path.endsWith('/energy')?'energy':path.endsWith('/training')?'training':'body';
 useEffect(()=>{const open=()=>setSettings(true);window.addEventListener("formward-open-body-settings",open);return()=>window.removeEventListener("formward-open-body-settings",open);},[]);
 if(!page)return children;
 const isBody=kind==='body';
 const forward=returningToOverview?null:forwardDestination;
 const requested=forward?new URL(forward,'https://formward.invalid'):null;
 const coverOldRoute=!!requested&&(requested.pathname!==actualPath||chartDestinationSearch(requested.search)!==chartDestinationSearch(search));
 return <WorkspaceTodayContext value={localToday}><WorkspaceSourceContext value={sourcePilot}><main className="dashboard-page" data-workspace-frame={kind} data-workspace-scene={scene?.direction} data-scene-leaving={sceneLeaving||undefined} aria-hidden={sceneLeaving||undefined} inert={sceneLeaving||undefined}><EntrySurface path={actualPath} query={params}><div ref={frame} className={styles.frame} data-workspace-body>
  <header className={styles.heading} data-body={isBody||undefined}><div className={styles.pageTitle}><h1>{page[1]}</h1></div>{isBody&&<button type="button" onClick={()=>setSettings(true)}>身体设置 <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M7 3h6l.6 2 1.9 1.1 2 .5v6.8l-2 .5-1.9 1.1-.6 2H7l-.6-2-1.9-1.1-2-.5V6.6l2-.5L6.4 5Z"/><circle cx="10" cy="10" r="3"/></svg></button>}</header>
  {kind==='overview'&&<div className={styles.home}><div className={styles.intro}><h2>今天</h2><time dateTime={localToday}>{localToday.replaceAll('-','.')}</time></div><nav aria-label="快捷记录" className={styles.actions}>{[['meals','1','饮食'],['measurements','daytime','测量'],['energy','1','消耗']].map(([route,entry,label])=><LoadingLink key={route} href={`/dashboard/${route}?date=${localToday}&entry=${entry}`}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>记录{label}</LoadingLink>)}</nav></div>}
  <div ref={content} className={styles.content} data-workspace-content>
   {forward&&<div data-forward-shell><WorkspaceLoading kind={path.endsWith('/meals')?'nutrition':path.endsWith('/energy')?'energy':'body'} destination={forward}/></div>}
   {(returningToOverview||!scene&&actualPath!=="/dashboard"&&params.get("view")==="trend")&&<div className={styles.returnShell} data-return-prepared={!returningToOverview||undefined} hidden={!returningToOverview} aria-hidden={!returningToOverview} inert={!returningToOverview}><WorkspaceLoading kind="overview" returnShell/></div>}
   <WorkspaceRouteContent kind={kind} cover={returningToOverview?"return":forward?"forward":null} coverOldRoute={coverOldRoute}>{children}</WorkspaceRouteContent>
  </div>
  {settings&&isBody&&<Inspector title="身体设置" close={()=>setSettings(false)}><BodySettings/></Inspector>}
 </div></EntrySurface></main><div ref={previousLayer} className={styles.previousScene} data-workspace-previous aria-hidden="true" inert/></WorkspaceSourceContext></WorkspaceTodayContext>;
}
