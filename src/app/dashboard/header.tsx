"use client";
import {useEffect,useRef,useState} from "react";
import {usePathname} from "next/navigation";
import {LogoutButton} from "./logout-button";
import {LoadingLink} from "@/components/loading-link";
import {NavigationIcon,MobileNavigation} from "@/components/mobile-navigation";
import {workspacePages as pages} from "@/components/workspace-pages";
import {Inspector} from "@/components/inspector";
import {AppearanceSwitch} from "@/components/appearance-switch";
import {BrandLogo} from "@/components/brand-logo";
import {useAssistant} from "@/features/assistant/context";
import {AssistantIcon} from "@/features/assistant/icon";
import styles from "./header.module.css";


export function DashboardHeader({email,owner=false}:{email:string;owner?:boolean}){
 const pathname=usePathname(),menu=useRef<HTMLDetailsElement>(null),[settings,setSettings]=useState(false),{open:assistantOpen,show:showAssistant,hide:hideAssistant,count}=useAssistant();
 const page=pages.find(([path])=>path===pathname),visualReview=pathname==="/dashboard/visual-review",review=pathname.includes("/operations/")||pathname.includes("/review/"),hasTools=!review&&(!!page||pathname==="/dashboard/ai"||pathname==="/dashboard/export");
 useEffect(()=>{if(menu.current)menu.current.open=false;const outside=(event:PointerEvent)=>{if(menu.current&&!menu.current.contains(event.target as Node))menu.current.open=false;};document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);},[pathname]);
 const openAssistant=()=>{if(menu.current)menu.current.open=false;showAssistant();};
 return <><header className={"dashboard-header "+styles.header+(review?" dashboard-review-header":"")}>
  <LoadingLink className="dashboard-logo" href="/dashboard" aria-label="Formward 主页"><BrandLogo compactOnMobile/></LoadingLink>
  <span className="mobile-page-name">{review?"确认记录":visualReview?"视觉验收":page?.[1]??(pathname.includes("/account")?"账号设置":pathname.includes("/profile")?"个人资料":pathname.includes("/tutorial")?"使用说明":pathname.includes("/export")?"导出数据":"AI 接入")}</span>
  <div className={styles.actions}>
   {hasTools&&<button type="button" className={styles.headerAssistant} aria-label={"助手"+(count?`，${count}条待核对记录`:"")} aria-haspopup="dialog" aria-expanded={assistantOpen} onClick={openAssistant}><AssistantIcon/>{count>0&&<small>{count}</small>}</button>}
   <details className="dashboard-menu" ref={menu} onToggle={event=>{if(event.currentTarget.open)hideAssistant();}} onKeyDown={event=>{if(event.key==="Escape"&&menu.current){menu.current.open=false;menu.current.querySelector("summary")?.focus();}}}>
    <summary aria-label="账号菜单"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M5.5 18c1-5 12-5 13 0"/></svg></summary>
    <div><span>{email}</span><button type="button" onClick={()=>{if(menu.current)menu.current.open=false;setSettings(true);}}>设置</button><LoadingLink href="/dashboard/profile">个人资料</LoadingLink><LoadingLink href="/dashboard/account">账号与安全</LoadingLink>{owner&&<><LoadingLink href="/onboarding?mode=test">测试初次登录</LoadingLink><LoadingLink href="/admin">账号管理</LoadingLink></>}<LogoutButton/></div>
   </details>
  </div>
 </header>
 {!review&&!visualReview&&<><nav className={"desktop-record-nav "+styles.desktopNav} aria-label="主导航">{pages.map(([href,label],i)=><LoadingLink key={href} href={href} aria-current={pathname===href?"page":undefined}><NavigationIcon index={i}/><span>{label}</span></LoadingLink>)}</nav><MobileNavigation pathname={pathname}/></>}
 {hasTools&&<button type="button" className={styles.assistantTrigger} aria-label="打开小助手" aria-haspopup="dialog" aria-expanded={assistantOpen} onClick={openAssistant}><AssistantIcon/><span>小助手</span>{count>0&&<small>{count}</small>}</button>}
 {settings&&<Inspector title="设置" close={()=>setSettings(false)}><div className={styles.settings}><h3>外观</h3><AppearanceSwitch/><h3>账号与数据</h3><LoadingLink href="/dashboard/profile" onNavigate={()=>setSettings(false)}>个人资料<span>→</span></LoadingLink><LoadingLink href="/dashboard/account" onNavigate={()=>setSettings(false)}>账号与安全<span>→</span></LoadingLink><LoadingLink href="/dashboard/ai" onNavigate={()=>setSettings(false)}>AI 接入<span>→</span></LoadingLink><LoadingLink href="/dashboard/export" onNavigate={()=>setSettings(false)}>导出 Excel<span>→</span></LoadingLink><LoadingLink href="/dashboard/tutorial" onNavigate={()=>setSettings(false)}>使用说明<span>→</span></LoadingLink></div></Inspector>}
 </>;
}
