"use client";
import {usePathname,useSearchParams} from 'next/navigation';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {LoadingLink} from './loading-link';
import {useMobileMode} from './use-mobile-mode';
import {WorkspaceSkeleton} from './workspace-skeleton';
import {EntrySurface} from './entry-surface';
import {Inspector} from './inspector';
import {BodySettings} from '@/features/measurements/body-settings';
import {useLocalToday} from './use-local-today';
import {workspacePages} from './workspace-pages';
import {createWorkspaceMotion,workspaceMotionDirection} from './workspace-motion';
import styles from './workspace-frame.module.css';
import {useChartTransition} from './chart-transition-state';
import {WorkspaceSourceContext} from './workspace-frame-state';
export function WorkspaceFrame({children,today,sourcePilot=false}:{children:ReactNode;today:string;sourcePilot?:boolean}){
 const actualPath=usePathname(),{returningToOverview}=useChartTransition(),path=returningToOverview?'/dashboard':actualPath,params=useSearchParams(),search=params.toString(),mobile=useMobileMode(),localToday=useLocalToday(today),[settings,setSettings]=useState(false);
 const content=useRef<HTMLDivElement>(null),motion=useRef<ReturnType<typeof createWorkspaceMotion>|null>(null),previous=useRef({path,search});
 useLayoutEffect(()=>{
  const from=previous.current;previous.current={path,search};
  const controller=motion.current??=createWorkspaceMotion();
  if(from.path===path)return;
  if(content.current)controller.play(content.current,workspaceMotionDirection(from,{path,search},document.documentElement.hasAttribute('data-chart-travel')),{distance:matchMedia('(max-width:700px),(hover:none) and (pointer:coarse)').matches?16:12,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches});
  else controller.stop();
 },[path,search]);
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)'),stop=()=>{if(query.matches)motion.current?.stop();};query.addEventListener('change',stop);return()=>{query.removeEventListener('change',stop);motion.current?.stop();};},[]);
 const page=path==="/dashboard/energy"?["/dashboard/energy","消耗"]:workspacePages.find(([href])=>href===path),kind=path==='/dashboard'?'overview':path.endsWith('/meals')?'nutrition':path.endsWith('/energy')?'energy':path.endsWith('/training')?'training':'body';
 useEffect(()=>{const open=()=>setSettings(true);window.addEventListener("formward-open-body-settings",open);return()=>window.removeEventListener("formward-open-body-settings",open);},[]);
 if(!page)return children;
 const isBody=kind==='body';
 return <WorkspaceSourceContext value={sourcePilot}><main className="dashboard-page" data-workspace-frame={kind}><EntrySurface><div className={styles.frame}>
  <header className={styles.heading} data-body={isBody||undefined}><div className={styles.pageTitle}><h1>{page[1]}</h1></div>{isBody&&<button type="button" onClick={()=>setSettings(true)}>身体设置 <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M7 3h6l.6 2 1.9 1.1 2 .5v6.8l-2 .5-1.9 1.1-.6 2H7l-.6-2-1.9-1.1-2-.5V6.6l2-.5L6.4 5Z"/><circle cx="10" cy="10" r="3"/></svg></button>}</header>
  {kind==='overview'&&<div className={styles.home}><div className={styles.intro}><h2>今天</h2><time dateTime={localToday}>{localToday.replaceAll('-','.')}</time></div><nav aria-label="快捷记录" className={styles.actions}>{[['meals','1','饮食'],['measurements','daytime','测量'],['energy','1','消耗']].map(([route,entry,label])=><LoadingLink key={route} href={`/dashboard/${route}?date=${localToday}&entry=${entry}`}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>记录{label}</LoadingLink>)}</nav></div>}
  <div ref={content} className={styles.content} data-workspace-content>{returningToOverview&&<WorkspaceSkeleton kind="overview"/>}<div data-route-content data-return-covered={returningToOverview||undefined} aria-hidden={returningToOverview||undefined} inert={returningToOverview||undefined}>{mobile===null&&kind!=="training"?<WorkspaceSkeleton kind={kind}/>:children}</div></div>
  {settings&&isBody&&<Inspector title="身体设置" close={()=>setSettings(false)}><BodySettings/></Inspector>}
 </div></EntrySurface></main></WorkspaceSourceContext>;
}
