"use client";
import {useCallback,useEffect,useRef,useState,useTransition} from "react";
import {usePathname,useRouter} from "next/navigation";
import {LogoutButton} from "./logout-button";
import {LoadingLink} from "@/components/loading-link";
import {usePageLoading} from "@/components/page-loading-state";
import {confirmDraftDiscard,draftIsBusy} from "@/components/draft-guard";
import {Inspector} from "@/components/inspector";
import {AppearanceSwitch} from "@/components/appearance-switch";
import {BrandLogo} from "@/components/brand-logo";
import {useAssistant} from "@/features/assistant/context";
import {AssistantIcon} from "@/features/assistant/icon";
import styles from "./header.module.css";

const pages=[["/dashboard","总览"],["/dashboard/meals","饮食"],["/dashboard/energy","消耗"],["/dashboard/measurements","身体"]] as const;
function NavigationIcon({index}:{index:number}){
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{index===0?<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="18" width="7" height="3" rx="1"/></>:index===1?<><path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 2-5 5-5 9h5"/></>:index===2?<path d="M12 3c1 5 6 6 6 11a6 6 0 0 1-12 0c0-2 1-4 3-6 0 4 2 4 3 5 2-2 1-6 0-10Z"/>:<><circle cx="12" cy="4" r="2"/><path d="m5 9 7 2 7-2M12 11v5m0 0-4 5m4-5 4 5"/></>}</svg>;
}
function MobileNavigation({pathname}:{pathname:string}){
 const router=useRouter(),nav=useRef<HTMLElement>(null),lens=useRef<HTMLSpanElement>(null),drag=useRef<{x:number;left:number;width:number;moved:boolean}|null>(null),suppress=useRef(0),motion=useRef({x:0,v:0,frame:0}),[pending,startTransition]=useTransition();
 const index=Math.max(0,pages.findIndex(([href])=>href===pathname));
 usePageLoading({active:pending,label:"正在加载页面…"});
 const settle=useCallback((target:number)=>{
  const state=motion.current;cancelAnimationFrame(state.frame);let previous=performance.now();
  const draw=()=>{if(lens.current)lens.current.style.transform=`translateX(${state.x}px) scale(${1+Math.min(.13,Math.abs(state.v)*.0002)},${1-Math.min(.05,Math.abs(state.v)*.00007)})`;};
  if(matchMedia("(prefers-reduced-motion: reduce)").matches){state.x=target;state.v=0;draw();return;}
  const tick=(now:number)=>{const dt=Math.min((now-previous)/1000,.024);previous=now;state.v+=(-430*(state.x-target)-31*state.v)*dt;state.x+=state.v*dt;draw();if(Math.abs(state.v)<.25&&Math.abs(state.x-target)<.15){state.x=target;state.v=0;draw();return;}state.frame=requestAnimationFrame(tick);};state.frame=requestAnimationFrame(tick);
 },[]);
 useEffect(()=>{const node=nav.current;if(!node)return;const sync=()=>settle(index*(node.clientWidth-12)/4);sync();const observer=new ResizeObserver(sync);observer.observe(node);const state=motion.current;return()=>{observer.disconnect();cancelAnimationFrame(state.frame);};},[index,settle]);
 return <nav ref={nav} className={"mobile-bottom-nav "+styles.mobileNav} aria-label="主导航" onDragStart={event=>event.preventDefault()} onClickCapture={event=>{if(performance.now()<suppress.current){event.preventDefault();event.stopPropagation();}}}
 onPointerDown={event=>{suppress.current=0;if(event.button!==0||!event.isPrimary)return;const r=event.currentTarget.getBoundingClientRect();drag.current={x:event.clientX,left:r.left,width:r.width,moved:false};}}
 onPointerMove={event=>{const d=drag.current;if(!d)return;d.moved ||= Math.abs(event.clientX-d.x)>7;if(!d.moved)return;event.currentTarget.setPointerCapture(event.pointerId);cancelAnimationFrame(motion.current.frame);const step=(d.width-12)/4,next=Math.max(-4,Math.min(step*3+4,event.clientX-d.left-6-step/2));motion.current.v=(next-motion.current.x)*35;motion.current.x=next;if(lens.current)lens.current.style.transform=`translateX(${next}px) scale(1.08,.97)`;}}
 onPointerCancel={()=>{drag.current=null;settle(index*((nav.current?.clientWidth??0)-12)/4);}}
 onPointerUp={event=>{const d=drag.current;drag.current=null;if(!d?.moved)return;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);suppress.current=performance.now()+350;const step=(d.width-12)/4,target=Math.max(0,Math.min(3,Math.round(motion.current.x/step)));void(async()=>{if(draftIsBusy()||!await confirmDraftDiscard()){settle(index*step);return;}settle(target*step);startTransition(()=>router.push(pages[target][0]));})();}}>
  <span ref={lens} className={styles.navLens} aria-hidden="true"/>{pages.map(([href,label],i)=><LoadingLink key={href} href={href} aria-current={pathname===href?"page":undefined}><NavigationIcon index={i}/><span>{label}</span></LoadingLink>)}
 </nav>;
}
export function DashboardHeader({email,owner=false}:{email:string;owner?:boolean}){
 const pathname=usePathname(),menu=useRef<HTMLDetailsElement>(null),[settings,setSettings]=useState(false),{open:assistantOpen,show:showAssistant,hide:hideAssistant,count}=useAssistant();
 const page=pages.find(([path])=>path===pathname),review=pathname.includes("/operations/")||pathname.includes("/review/"),hasTools=!review&&(!!page||pathname==="/dashboard/ai"||pathname==="/dashboard/export");
 useEffect(()=>{if(menu.current)menu.current.open=false;const outside=(event:PointerEvent)=>{if(menu.current&&!menu.current.contains(event.target as Node))menu.current.open=false;};document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);},[pathname]);
 const openAssistant=()=>{if(menu.current)menu.current.open=false;showAssistant();};
 return <><header className={"dashboard-header "+styles.header+(review?" dashboard-review-header":"")}>
  <LoadingLink className="dashboard-logo" href="/dashboard" aria-label="Formward 主页"><BrandLogo compactOnMobile/></LoadingLink>
  <span className="mobile-page-name">{review?"确认记录":page?.[1]??(pathname.includes("/account")?"账号设置":pathname.includes("/profile")?"个人资料":pathname.includes("/tutorial")?"使用说明":pathname.includes("/export")?"导出数据":"AI 接入")}</span>
  <div className={styles.actions}>
   {hasTools&&<button type="button" className={styles.headerAssistant} aria-label={"助手"+(count?`，${count}条待核对记录`:"")} aria-haspopup="dialog" aria-expanded={assistantOpen} onClick={openAssistant}><AssistantIcon/>{count>0&&<small>{count}</small>}</button>}
   <details className="dashboard-menu" ref={menu} onToggle={event=>{if(event.currentTarget.open)hideAssistant();}} onKeyDown={event=>{if(event.key==="Escape"&&menu.current){menu.current.open=false;menu.current.querySelector("summary")?.focus();}}}>
    <summary aria-label="账号菜单"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M5.5 18c1-5 12-5 13 0"/></svg></summary>
    <div><span>{email}</span><button type="button" onClick={()=>{if(menu.current)menu.current.open=false;setSettings(true);}}>设置</button><LoadingLink href="/dashboard/profile">个人资料</LoadingLink><LoadingLink href="/dashboard/account">账号与安全</LoadingLink>{owner&&<><LoadingLink href="/onboarding?mode=test">测试初次登录</LoadingLink><LoadingLink href="/admin">账号管理</LoadingLink></>}<LogoutButton/></div>
   </details>
  </div>
 </header>
 {!review&&<><nav className={"desktop-record-nav "+styles.desktopNav} aria-label="主导航">{pages.map(([href,label],i)=><LoadingLink key={href} href={href} aria-current={pathname===href?"page":undefined}><NavigationIcon index={i}/><span>{label}</span></LoadingLink>)}</nav><MobileNavigation pathname={pathname}/></>}
 {hasTools&&<button type="button" className={styles.assistantTrigger} aria-label="打开小助手" aria-haspopup="dialog" aria-expanded={assistantOpen} onClick={openAssistant}><AssistantIcon/><span>小助手</span>{count>0&&<small>{count}</small>}</button>}
 {settings&&<Inspector title="设置" close={()=>setSettings(false)}><div className={styles.settings}><h3>外观</h3><AppearanceSwitch/><h3>账号与数据</h3><LoadingLink href="/dashboard/profile" onNavigate={()=>setSettings(false)}>个人资料<span>→</span></LoadingLink><LoadingLink href="/dashboard/account" onNavigate={()=>setSettings(false)}>账号与安全<span>→</span></LoadingLink><LoadingLink href="/dashboard/ai" onNavigate={()=>setSettings(false)}>AI 接入<span>→</span></LoadingLink><LoadingLink href="/dashboard/export" onNavigate={()=>setSettings(false)}>导出 Excel<span>→</span></LoadingLink><LoadingLink href="/dashboard/tutorial" onNavigate={()=>setSettings(false)}>使用说明<span>→</span></LoadingLink></div></Inspector>}
 </>;
}
