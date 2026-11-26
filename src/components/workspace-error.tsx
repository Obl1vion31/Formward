"use client";
import {WorkspacePending} from '@/features/dashboard/workspace-cache';
import {LoadingLink} from './loading-link';
import {useContext,useEffect,useLayoutEffect} from 'react';
import {EntrySurfaceContext} from './entry-surface-state';
import {useChartTransition} from './chart-transition-state';
import {usePathname} from 'next/navigation';
import {WorkspaceLoading, type WorkspaceReadingKind} from './workspace-loading';
import styles from './local-loading.module.css';
export function WorkspaceError({retry}:{retry:()=>void}){
 const path=usePathname();
 const {active,reportFailure}=useContext(EntrySurfaceContext);
 const {invalidate,overviewReady}=useChartTransition();
 useLayoutEffect(()=>{invalidate();overviewReady?.();},[invalidate,overviewReady]);
 useEffect(()=>{if(active)reportFailure(retry);},[active,reportFailure,retry]);
 const kind:WorkspaceReadingKind|undefined=path==="/dashboard"?"overview":path.endsWith("/meals")?"nutrition":path.endsWith("/energy")?"energy":path.endsWith("/measurements")?"body":undefined;
 const failure=<span role="alert" className={styles.failure}><span>暂时无法读取页面，已保存的记录保持。请重试。</span><button type="button" onClick={retry}>重新读取</button></span>;
 if(kind&&!active)return <WorkspacePending failed fallback={<WorkspaceLoading kind={kind} failure={failure} retry={retry}/>}>{failure}</WorkspacePending>;
 return <WorkspacePending failed><section className="workspace-retry" role="alert"><p>暂时无法读取页面，已保存的记录保持。请重试。</p><button onClick={retry}>重新读取</button><LoadingLink href="/dashboard">返回总览</LoadingLink></section></WorkspacePending>;
}
