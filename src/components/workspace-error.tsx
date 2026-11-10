"use client";
import {LoadingLink} from './loading-link';
import {useContext,useEffect,useLayoutEffect} from 'react';
import {EntrySurfaceContext} from './entry-surface-state';
import {useChartTransition} from './chart-transition-state';
export function WorkspaceError({retry}:{retry:()=>void}){
 const {active,reportFailure}=useContext(EntrySurfaceContext);
 const {invalidate,overviewReady}=useChartTransition();
 useLayoutEffect(()=>{invalidate();overviewReady?.();},[invalidate,overviewReady]);
 useEffect(()=>{if(active)reportFailure(retry);},[active,reportFailure,retry]);
 return <><section className="skeleton-retry" role="alert"><p>暂时无法读取页面，已保存的记录保持。请重试。</p><button onClick={retry}>重新读取</button><LoadingLink href="/dashboard">返回总览</LoadingLink></section></>;
}
