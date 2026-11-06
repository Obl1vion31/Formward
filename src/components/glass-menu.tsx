"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {animateSurface,rememberSurfaceOrigin} from './surface-motion';
export function GlassMenu({children,icon,onOpen}:{children:ReactNode;icon:ReactNode;onOpen:()=>void}){
 const [open,setOpen]=useState(false),ref=useRef<HTMLDetailsElement>(null),surface=useRef<HTMLDivElement>(null),trigger=useRef<HTMLElement>(null),pathname=usePathname(),closing=useRef(false),generation=useRef(0);
 function close(){if(!open||!surface.current||closing.current)return;const ticket=++generation.current;closing.current=true;if(ref.current)ref.current.dataset.closing='true';void animateSurface(surface.current,'close').then(()=>{if(ticket!==generation.current)return;setOpen(false);closing.current=false;delete ref.current?.dataset.closing;});}
 useEffect(()=>{if(open&&surface.current){onOpen();void animateSurface(surface.current,'open',trigger.current);}},[open,onOpen]);
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))close();};document.addEventListener('pointerdown',outside);window.addEventListener('formward-close-account-menu',close);return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('formward-close-account-menu',close);};});
 useEffect(()=>{const frame=requestAnimationFrame(()=>setOpen(false));return()=>cancelAnimationFrame(frame);},[pathname]);
 return <details className="dashboard-menu glass-menu" ref={ref} open={open} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close();trigger.current?.focus();}}}><summary ref={trigger} aria-label="账号菜单" onClick={e=>{e.preventDefault();if(open&&!closing.current)close();else{generation.current++;closing.current=false;delete ref.current?.dataset.closing;setOpen(true);if(surface.current)void animateSurface(surface.current,'open',trigger.current);}}}>{icon}</summary><div ref={surface} onClickCapture={e=>{const target=(e.target as Element).closest('button,a');if(target)rememberSurfaceOrigin(target);}} onClick={e=>{if((e.target as Element).closest('button,a'))close();}}>{children}</div></details>;
}
