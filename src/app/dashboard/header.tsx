"use client";
import {useRef,useState} from "react";
import {usePathname,useSearchParams} from "next/navigation";
import {LogoutButton} from "./logout-button";
import {LoadingLink} from "@/components/loading-link";
import {NavigationIcon,MobileNavigation} from "@/components/mobile-navigation";
import {workspacePages as pages} from "@/components/workspace-pages";
import {Inspector} from "@/components/inspector";
import {AppearanceSwitch} from "@/components/appearance-switch";
import {BrandLogo} from "@/components/brand-logo";
import {useAssistant} from "@/features/assistant/context";
import {AssistantIcon} from "@/features/assistant/icon";
import {GlassMenu} from "@/components/glass-menu";
import {AccountSurface} from "@/features/auth/account-surfaces";
import {useMobileMode} from "@/components/use-mobile-mode";
import {TrendBackLink} from "@/components/chart-transition";
import {linkedTrend} from "@/components/metric-trend-model";
import styles from "./header.module.css";


export function DashboardHeader({email,owner=false}:{email:string;owner?:boolean}){
 const pathname=usePathname(),mobile=useMobileMode(),[settings,setSettings]=useState<false|"settings"|"profile"|"account">(false),{open:assistantOpen,show:showAssistant,hide:hideAssistant,count}=useAssistant();
 const menuClose=useRef<()=>Promise<void>>(()=>Promise.resolve()),params=useSearchParams(),trend=!!pagePath(pathname)&&!!linkedTrend(Object.fromEntries(params));
 const openSettings=async(value:"settings"|"profile"|"account")=>{await menuClose.current();setSettings(value);};
 const page=pages.find(([path])=>path===pathname),visualReview=pathname==="/dashboard/visual-review",review=pathname.includes("/operations/")||pathname.includes("/review/"),hasTools=!review&&(!!page||pathname==="/dashboard/ai"||pathname==="/dashboard/export");
 const openAssistant=async()=>{await menuClose.current();if(assistantOpen)await hideAssistant();else showAssistant();};
 return <><header className={"dashboard-header "+styles.header+(review?" dashboard-review-header":"")}>
  {trend&&<div className={styles.back}><TrendBackLink/></div>}<LoadingLink className={"dashboard-logo"+(trend?" "+styles.linkedLogo:"")} href="/dashboard" aria-label="Formward 主页"><BrandLogo compactOnMobile/></LoadingLink>
  <span className="mobile-page-name" role={page?"heading":undefined} aria-level={page?1:undefined}>{review?"确认记录":visualReview?"视觉验收":page?.[1]??(pathname.includes("/account")?"账号设置":pathname.includes("/profile")?"个人资料":pathname.includes("/tutorial")?"使用说明":pathname.includes("/export")?"导出数据":"AI 接入")}</span>
  <div className={styles.actions}>
   {hasTools&&<button type="button" className={styles.headerAssistant} aria-label={"助手"+(count?`，${count}条待核对记录`:"")} aria-haspopup="dialog" aria-expanded={assistantOpen} onClick={openAssistant}><AssistantIcon/>{count>0&&<small>{count}</small>}</button>}
   <GlassMenu onCloseReady={close=>{menuClose.current=close;}} onOpen={hideAssistant} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M5.5 18c1-5 12-5 13 0"/></svg>}>
    <span>{email}</span><button type="button" onClick={()=>{void openSettings("settings");}}>设置</button>{mobile?<><button onClick={()=>void openSettings("profile")}>个人资料</button><button onClick={()=>void openSettings("account")}>账号与安全</button></>:<><LoadingLink beforeNavigate={()=>menuClose.current()} href="/dashboard/profile">个人资料</LoadingLink><LoadingLink beforeNavigate={()=>menuClose.current()} href="/dashboard/account">账号与安全</LoadingLink></>}{owner&&<><LoadingLink beforeNavigate={()=>menuClose.current()} href="/onboarding?mode=test">测试初次登录</LoadingLink><LoadingLink beforeNavigate={()=>menuClose.current()} href="/admin">账号管理</LoadingLink></>}<LogoutButton/>
   </GlassMenu>
  </div>
 </header>
 {!review&&!visualReview&&<><nav className={"desktop-record-nav "+styles.desktopNav} aria-label="主导航"><span className={styles.desktopLens} aria-hidden="true" style={{transform:"translateY("+Math.max(0,pages.findIndex(([href])=>href===pathname))*74+"px)"}}/>{pages.map(([href,label],i)=><LoadingLink key={href} href={href} aria-current={pathname===href?"page":undefined}><NavigationIcon index={i}/><span>{label}</span></LoadingLink>)}</nav><MobileNavigation pathname={pathname}/></>}
 {hasTools&&<button type="button" className={styles.assistantTrigger} aria-label="打开小助手" aria-haspopup="dialog" aria-expanded={assistantOpen} onClick={openAssistant}><AssistantIcon/><span>小助手</span>{count>0&&<small>{count}</small>}</button>}
 {settings&&<Inspector title={settings==="profile"?"个人资料":settings==="account"?"账号与安全":"设置"} close={()=>setSettings(false)}>{settings!=="settings"?<AccountSurface kind={settings}/>:<div className={styles.settings}><h3>外观</h3><AppearanceSwitch/><h3>账号与数据</h3>{mobile?<><button onClick={()=>setSettings("profile")}>个人资料<span>→</span></button><button onClick={()=>setSettings("account")}>账号与安全<span>→</span></button></>:<><LoadingLink href="/dashboard/profile" onNavigate={()=>setSettings(false)}>个人资料<span>→</span></LoadingLink><LoadingLink href="/dashboard/account" onNavigate={()=>setSettings(false)}>账号与安全<span>→</span></LoadingLink></>}<LoadingLink href="/dashboard/ai" onNavigate={()=>setSettings(false)}>AI 接入<span>→</span></LoadingLink><LoadingLink href="/dashboard/export" onNavigate={()=>setSettings(false)}>导出 Excel<span>→</span></LoadingLink><LoadingLink href="/dashboard/tutorial" onNavigate={()=>setSettings(false)}>使用说明<span>→</span></LoadingLink></div>}</Inspector>}
 </>;
}

function pagePath(path:string){return pages.some(([href])=>href===path)&&path!=="/dashboard";}
