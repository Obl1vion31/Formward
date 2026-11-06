"use client";
import {LoadingLink} from './loading-link';
import {useContext,useEffect} from 'react';
import {EntrySurfaceContext} from './entry-surface-state';
export function WorkspaceError({reset}:{reset:()=>void}){
 const {active,reportFailure}=useContext(EntrySurfaceContext);
 useEffect(()=>{if(active)reportFailure(reset);},[active,reportFailure,reset]);
 return <><section className="skeleton-retry" role="alert"><p>暂时无法读取页面，已保存的记录保持。请重试。</p><button onClick={reset}>重新读取</button><LoadingLink href="/dashboard">返回总览</LoadingLink></section></>;
}
