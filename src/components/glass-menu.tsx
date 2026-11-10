"use client";
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {animateSurface} from './surface-motion';
export function GlassMenu({children,icon,onOpen,onCloseReady,onEscape,label="账号菜单"}:{label?:string;children:ReactNode;icon:ReactNode;onOpen:()=>void|Promise<void>;onCloseReady?:(close:()=>Promise<void>)=>void;onEscape?:()=>boolean}){
 const [open,setOpen]=useState(false),ref=useRef<HTMLDetailsElement>(null),surface=useRef<HTMLDivElement>(null),trigger=useRef<HTMLElement>(null),pathname=usePathname(),generation=useRef(0),closing=useRef<Promise<void>|null>(null);
 const close=useCallback(()=>{
  if(closing.current)return closing.current;
  if(!surface.current||!ref.current?.open)return Promise.resolve();
  const ticket=++generation.current;ref.current.dataset.closing='true';
  const pending=animateSurface(surface.current,'close',trigger.current,'anchored').then(finished=>{if(finished&&ticket===generation.current){setOpen(false);}if(closing.current===pending)closing.current=null;});closing.current=pending;return pending;
 },[]);
 useEffect(()=>{onCloseReady?.(close);},[onCloseReady,close]);
 useEffect(()=>{if(open&&surface.current)void animateSurface(surface.current,'open',trigger.current,'anchored');},[open]);
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node))void close();};const dismiss=()=>{void close();};document.addEventListener('pointerdown',outside);window.addEventListener('formward-close-account-menu',dismiss);return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('formward-close-account-menu',dismiss);};},[close]);
 useEffect(()=>{const frame=requestAnimationFrame(()=>{void close();});return()=>cancelAnimationFrame(frame);},[pathname,close]);
 return <details className="dashboard-menu glass-menu" ref={ref} open={open} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();if(onEscape?.()){event.stopPropagation();return;}void close();trigger.current?.focus();}}}><summary ref={trigger} aria-label={label} onClick={async event=>{event.preventDefault();if(open&&!closing.current){void close();return;}await onOpen();generation.current++;closing.current=null;delete ref.current?.dataset.closing;if(open&&surface.current)void animateSurface(surface.current,'open',trigger.current,'anchored');else setOpen(true);}}>{icon}</summary><div ref={surface} onClick={event=>{const control=(event.target as Element).closest('button,a');if(control&&!control.hasAttribute('data-menu-stay-open'))void close();}}>{children}</div></details>;
}
