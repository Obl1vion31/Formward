"use client";
import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {animateSurface} from '@/components/surface-motion';
import {LoadingLink} from '@/components/loading-link';
import {lockPageScroll} from '@/components/scroll-lock';
import {useMobileMode} from '@/components/use-mobile-mode';
import {assistantQuickActions,assistantTools,type AssistantContext,type AssistantItem} from './model';
import {localMeasurementDate} from '../measurements/entry-state';
import {AssistantIcon} from './icon';
import styles from './surface.module.css';
export function AssistantSurface({data,error,loading,automatic,close,presented,retry,changeAutomatic,dismissReady}:{data:AssistantContext|null;error:string;loading:boolean;automatic:boolean;close:()=>void;presented:()=>void;retry:()=>void;changeAutomatic:(value:boolean)=>void;dismissReady:(callback:(()=>Promise<void>)|null)=>void}){
 const mobile=useMobileMode(),dialog=useRef<HTMLDialogElement>(null),button=useRef<HTMLButtonElement>(null),pending=useRef<Promise<void>|null>(null),[closing,setClosing]=useState(false);
 const dismiss=useCallback(()=>{if(pending.current)return pending.current;if(!dialog.current)return Promise.resolve();setClosing(true);const task=animateSurface(dialog.current,'close',null,'anchored').then(finished=>{if(finished)close();pending.current=null;});pending.current=task;return task;},[close]);
 useLayoutEffect(()=>{dismissReady(dismiss);return()=>dismissReady(null);},[dismissReady,dismiss]);
 useLayoutEffect(()=>{
  const node=dialog.current;if(!node||mobile===null)return;
  const trigger=document.querySelector<HTMLElement>(mobile?'button[aria-label^="助手"]':'button[aria-label="打开小助手"]'),previous=document.activeElement;
  if(mobile)node.showModal();else node.show();
  const unlock=mobile?lockPageScroll():()=>{};
  void animateSurface(node,'open',trigger,'anchored');button.current?.focus({preventScroll:true});presented();
  const outside=(event:PointerEvent)=>{if(!node.contains(event.target as Node)&&!(event.target as Element).closest('[aria-label="打开小助手"]'))void dismiss();};
  if(!mobile)document.addEventListener('pointerdown',outside);
  return()=>{document.removeEventListener('pointerdown',outside);node.close();node.getAnimations().forEach(a=>a.cancel());unlock();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
 },[mobile,presented,dismiss]);
 if(mobile===null)return null;
 const today=data?.localDate??localMeasurementDate(new Date());
 const items=(rows:AssistantItem[])=><ul className={styles.items}>{rows.map(item=><li key={item.id}><div><strong>{item.title}</strong><time dateTime={item.date}>{item.date.replaceAll('-','.')}</time></div><p>{item.detail}</p><LoadingLink prefetch={false} href={item.action.href} beforeNavigate={dismiss}>{item.action.label}<span> →</span></LoadingLink></li>)}</ul>;
 return <dialog ref={dialog} className={styles.surface} data-assistant-surface data-closing={closing} aria-labelledby="assistant-title" aria-modal={mobile||undefined} onCancel={event=>{event.preventDefault();void dismiss();}} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)void dismiss();}}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();void dismiss();}if(!mobile||event.key!=='Tab')return;const nodes=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,summary')].filter(e=>e.getClientRects().length>0&&!e.closest('details:not([open]) :not(summary)'));const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}>
  <header className={styles.heading}><div><AssistantIcon/><h2 id="assistant-title">小助手</h2></div><button ref={button} type="button" aria-label="收起小助手" onClick={()=>void dismiss()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
  <div className={styles.content}><time className={styles.date} dateTime={today}>今天 · {today.replaceAll('-','.')}</time><div className={styles.introduction} aria-live="polite" aria-busy={loading}>{error?<><p role="alert">{error}</p>{error.includes('登录')?<LoadingLink href="/" beforeNavigate={dismiss}>重新登录 →</LoadingLink>:<button type="button" onClick={retry}>重新核对</button>}</>:!data?<div className="skeleton-card"/>:<p className={styles.lead}>{data.pending.length?'有 '+data.pending.length+' 条记录需要核对':'当前没有需要核对的记录'}</p>}</div>
   {!error&&data&&<>{items(data.pending)}{data.suggestions.length>0&&<details className={styles.disclosure}><summary>可补充记录</summary>{items(data.suggestions)}</details>}</>}
   <section className={styles.quick}><h3>现在想记录什么</h3><div>{assistantQuickActions(today).map(action=><LoadingLink prefetch={false} key={action.label} href={action.href} beforeNavigate={dismiss}>{action.label}</LoadingLink>)}</div></section>
   <details className={styles.disclosure}><summary>常用功能</summary><nav className={styles.tools} aria-label="教程、连接与导出">{assistantTools.map(action=><LoadingLink key={action.label} href={action.href} beforeNavigate={dismiss}>{action.label}<span>→</span></LoadingLink>)}</nav></details>
  </div><footer className={styles.footer}><label><input type="checkbox" checked={automatic} onChange={event=>changeAutomatic(event.target.checked)}/><span>有待处理事项时，每天自动出现一次</span></label><button type="button" onClick={()=>void dismiss()}>先继续浏览</button></footer>
 </dialog>;
}