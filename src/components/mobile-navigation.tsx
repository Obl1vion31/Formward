"use client";
import {useCallback,useEffect,useRef,useTransition} from "react";
import {useRouter} from "next/navigation";
import {LoadingLink} from "./loading-link";

import {confirmDraftDiscard,draftIsBusy} from "./draft-guard";
import {workspacePages as pages} from "./workspace-pages";
import styles from "./mobile-navigation.module.css";
export function NavigationIcon({index}:{index:number}){
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{index===0?<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="18" width="7" height="3" rx="1"/></>:index===1?<><path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 2-5 5-5 9h5"/></>:index===2?<path d="M12 3c1 5 6 6 6 11a6 6 0 0 1-12 0c0-2 1-4 3-6 0 4 2 4 3 5 2-2 1-6 0-10Z"/>:<><circle cx="12" cy="4" r="2"/><path d="m5 9 7 2 7-2M12 11v5m0 0-4 5m4-5 4 5"/></>}</svg>;
}
export function MobileNavigation({pathname,onSelect}:{pathname:string;onSelect?:(href:string)=>void}){
 const router=useRouter(),nav=useRef<HTMLElement>(null),lens=useRef<HTMLSpanElement>(null),drag=useRef<{x:number;left:number;width:number;moved:boolean}|null>(null),suppress=useRef(0),motion=useRef({x:0,v:0,frame:0}),[,startTransition]=useTransition();
 const index=Math.max(0,pages.findIndex(([href])=>href===pathname));

 const settle=useCallback((target:number)=>{
  const state=motion.current;cancelAnimationFrame(state.frame);let previous=performance.now();
  const draw=()=>{if(lens.current)lens.current.style.transform=`translateX(${state.x}px) scale(${1+Math.min(.13,Math.abs(state.v)*.0002)},${1-Math.min(.05,Math.abs(state.v)*.00007)})`;};
  if(matchMedia("(prefers-reduced-motion: reduce)").matches){state.x=target;state.v=0;draw();return;}
  const tick=(now:number)=>{const dt=Math.min((now-previous)/1000,.024);previous=now;state.v+=(-430*(state.x-target)-31*state.v)*dt;state.x+=state.v*dt;draw();if(Math.abs(state.v)<.25&&Math.abs(state.x-target)<.15){state.x=target;state.v=0;draw();return;}state.frame=requestAnimationFrame(tick);};state.frame=requestAnimationFrame(tick);
 },[]);
 useEffect(()=>{const node=nav.current;if(!node)return;const sync=()=>settle(index*(node.clientWidth-12)/4);sync();const observer=new ResizeObserver(sync);observer.observe(node);const query=matchMedia("(prefers-reduced-motion: reduce)");query.addEventListener("change",sync);const state=motion.current;return()=>{observer.disconnect();query.removeEventListener("change",sync);cancelAnimationFrame(state.frame);};},[index,settle]);
 return <nav ref={nav} className={"mobile-bottom-nav "+styles.mobileNav+(onSelect?" "+styles.previewNav:"")} aria-label="主导航" onDragStart={event=>event.preventDefault()} onClickCapture={event=>{if(performance.now()<suppress.current){event.preventDefault();event.stopPropagation();}}}
 onPointerDown={event=>{suppress.current=0;if(event.button!==0||!event.isPrimary)return;const r=event.currentTarget.getBoundingClientRect();drag.current={x:event.clientX,left:r.left,width:r.width,moved:false};}}
 onPointerMove={event=>{const d=drag.current;if(!d)return;d.moved ||= Math.abs(event.clientX-d.x)>7;if(!d.moved)return;event.currentTarget.setPointerCapture(event.pointerId);cancelAnimationFrame(motion.current.frame);const step=(d.width-12)/4,next=Math.max(-4,Math.min(step*3+4,event.clientX-d.left-6-step/2));motion.current.v=(next-motion.current.x)*35;motion.current.x=next;if(lens.current)lens.current.style.transform=`translateX(${next}px)${matchMedia("(prefers-reduced-motion: reduce)").matches?"":" scale(1.08,.97)"}`;}}
 onPointerCancel={()=>{drag.current=null;settle(index*((nav.current?.clientWidth??0)-12)/4);}}
 onPointerUp={event=>{const d=drag.current;drag.current=null;if(!d?.moved)return;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);suppress.current=performance.now()+350;const step=(d.width-12)/4,target=Math.max(0,Math.min(3,Math.round(motion.current.x/step)));void(async()=>{if(draftIsBusy()||!await confirmDraftDiscard()){settle(index*step);return;}settle(target*step);if(onSelect)onSelect(pages[target][0]);else startTransition(()=>router.push(pages[target][0]));})();}}>
  <span ref={lens} className={styles.navLens} aria-hidden="true"/>{pages.map(([href,label],i)=><LoadingLink key={href} href={href} aria-current={pathname===href?"page":undefined} onNavigate={onSelect?event=>{event.preventDefault();onSelect(href);}:undefined}><NavigationIcon index={i}/><span>{label}</span></LoadingLink>)}
 </nav>;
}
