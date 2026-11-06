"use client";
import {LoadingLink} from './loading-link';
export function WorkspaceError({reset}:{reset:()=>void}){
 return <main className="dashboard-page"><section className="skeleton-retry" role="alert"><p>暂时无法读取页面，已保存的记录保持。请重试。</p><button onClick={reset}>重新读取</button><LoadingLink href="/dashboard">返回总览</LoadingLink></section></main>;
}
