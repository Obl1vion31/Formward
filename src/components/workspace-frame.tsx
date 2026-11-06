"use client";
import {usePathname} from 'next/navigation';
import {useEffect,useState,type ReactNode} from 'react';
import {LoadingLink} from './loading-link';
import {useMobileMode} from './use-mobile-mode';
import {WorkspaceSkeleton} from './workspace-skeleton';
import {EntrySurface} from './entry-surface';
import {Inspector} from './inspector';
import {BodySettings} from '@/features/measurements/body-settings';
import {useLocalToday} from './use-local-today';
import {workspacePages} from './workspace-pages';
import styles from './workspace-frame.module.css';
export function WorkspaceFrame({children,today}:{children:ReactNode;today:string}){
 const path=usePathname(),mobile=useMobileMode(),localToday=useLocalToday(today),[settings,setSettings]=useState(false);
 const page=workspacePages.find(([href])=>href===path),kind=path==='/dashboard'?'overview':path.endsWith('/meals')?'nutrition':path.endsWith('/energy')?'energy':'body';
 useEffect(()=>{const open=()=>setSettings(true);window.addEventListener("formward-open-body-settings",open);return()=>window.removeEventListener("formward-open-body-settings",open);},[]);
 if(!page)return children;
 const isBody=kind==='body';
 return <main className="dashboard-page" data-workspace-frame={kind}><EntrySurface><div className={styles.frame}>
  <header className={styles.heading} data-body={isBody||undefined}><h1>{page[1]}</h1>{isBody&&<button type="button" onClick={()=>setSettings(true)}>身体设置 <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M7 3h6l.6 2 1.9 1.1 2 .5v6.8l-2 .5-1.9 1.1-.6 2H7l-.6-2-1.9-1.1-2-.5V6.6l2-.5L6.4 5Z"/><circle cx="10" cy="10" r="3"/></svg></button>}</header>
  {kind==='overview'&&<div className={styles.home}><div className={styles.intro}><h2>今天</h2><time dateTime={localToday}>{localToday.replaceAll('-','.')}</time></div><nav aria-label="快捷记录" className={styles.actions}>{[['meals','1','饮食'],['measurements','daytime','测量'],['energy','1','消耗']].map(([route,entry,label])=><LoadingLink key={route} href={`/dashboard/${route}?date=${localToday}&entry=${entry}`}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>记录{label}</LoadingLink>)}</nav></div>}
  {mobile===null?<WorkspaceSkeleton kind={kind}/>:children}
  {settings&&isBody&&<Inspector title="身体设置" close={()=>setSettings(false)}><BodySettings/></Inspector>}
 </div></EntrySurface></main>;
}
