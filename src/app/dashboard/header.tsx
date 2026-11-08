"use client";
import {useRef,useState} from "react";
import {usePathname,useSearchParams} from "next/navigation";
import {TrainingTabs} from '@/features/training/navigation';
import {LogoutButton} from "./logout-button";
import {LoadingLink} from "@/components/loading-link";
import {NavigationIcon,MobileNavigation} from "@/components/mobile-navigation";
import {workspacePages as pages} from "@/components/workspace-pages";
import {Inspector} from "@/components/inspector";
import {AppearanceToggle,FollowSystemAppearance} from "@/components/appearance-switch";
import {BrandLogo} from "@/components/brand-logo";
import {useAssistant} from "@/features/assistant/context";
import {AssistantIcon} from "@/features/assistant/icon";
import {GlassMenu} from "@/components/glass-menu";
import {DataSourcesPanel} from "@/features/data-sources/panel";
import {AccountSurface} from "@/features/auth/account-surfaces";
import {useMobileMode} from "@/components/use-mobile-mode";
import {TrendBackLink} from "@/components/chart-transition";
import {linkedTrend} from "@/components/metric-trend-model";
import styles from "./header.module.css";


export function DashboardHeader({email,owner=false,sourcePilot=false}:{email:string;owner?:boolean;sourcePilot?:boolean}){
 const pathname=usePathname(),mobile=useMobileMode(),[settings,setSettings]=useState<false|"profile"|"account"|"sources">(false),{open:assistantOpen,show:showAssistant,hide:hideAssistant,count}=useAssistant();
 const menuClose=useRef<()=>Promise<void>>(()=>Promise.resolve()),params=useSearchParams(),trend=!!pagePath(pathname)&&!!linkedTrend(Object.fromEntries(params));
 const openSettings=async(value:"profile"|"account"|"sources")=>{await menuClose.current();setSettings(value);};
 const trainingPage=pathname==='/dashboard/training'||pathname==='/dashboard/energy';
 const activePath=pathname==="/dashboard/energy"?"/dashboard/training":pathname;
 const page=pages.find(([path])=>path===activePath),visualReview=pathname==="/dashboard/visual-review",review=pathname.includes("/operations/")||pathname.includes("/review/"),hasTools=!review&&(!!page||pathname==="/dashboard/ai"||pathname==="/dashboard/export"||pathname==="/dashboard/sources");
 const openAssistant=async()=>{await menuClose.current();if(assistantOpen)await hideAssistant();else showAssistant();};
 return <><header className={"dashboard-header "+styles.header+(review?" dashboard-review-header":"")}>
  {trend&&<div className={styles.back}><TrendBackLink/></div>}<LoadingLink className={"dashboard-logo"+(trend?" "+styles.linkedLogo:"")} href="/dashboard" aria-label="Formward 主页"><BrandLogo compactOnMobile/></LoadingLink>
  {trainingPage?<div className={styles.mobileTrainingTabs}><h1 className={styles.accessibleTitle}>{pathname==='/dashboard/energy'?'消耗':'训练'}</h1><TrainingTabs active={pathname==='/dashboard/energy'?'energy':'training'}/></div>:<span className="mobile-page-name" role={page?"heading":undefined} aria-level={page?1:undefined}>{review?"确认记录":visualReview?"视觉验收":(pathname==="/dashboard/energy"?"消耗":page?.[1])??(pathname.includes("/account")?"账号设置":pathname.includes("/profile")?"个人资料":pathname.includes("/tutorial")?"使用说明":pathname.includes("/export")?"导出数据":pathname.includes("/sources")?"数据来源":"AI 接入")}</span>}
  <div className={styles.actions}>
   {hasTools&&<button type="button" className={styles.headerAssistant} aria-label={"助手"+(count?`，${count}条待核对记录`:"")} aria-haspopup="dialog" aria-expanded={assistantOpen} onClick={openAssistant}><AssistantIcon/>{count>0&&<small>{count}</small>}</button>}
   <AppearanceToggle/>
   <GlassMenu onCloseReady={close=>{menuClose.current=close;}} onOpen={hideAssistant} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M5.5 18c1-5 12-5 13 0"/></svg>}>
    <span>{email}</span><FollowSystemAppearance/>{mobile?<button type="button" onClick={()=>void openSettings("sources")}>连接设备与数据来源</button>:<LoadingLink beforeNavigate={()=>menuClose.current()} href="/dashboard/sources">连接设备与数据来源</LoadingLink>}{mobile?<><button onClick={()=>void openSettings("profile")}>个人资料</button><button onClick={()=>void openSettings("account")}>账号与安全</button></>:<><LoadingLink beforeNavigate={()=>menuClose.current()} href="/dashboard/profile">个人资料</LoadingLink><LoadingLink beforeNavigate={()=>menuClose.current()} href="/dashboard/account">账号与安全</LoadingLink></>}{owner&&<><LoadingLink beforeNavigate={()=>menuClose.current()} href="/onboarding?mode=test">测试初次登录</LoadingLink><LoadingLink beforeNavigate={()=>menuClose.current()} href="/admin">账号管理</LoadingLink></>}<LogoutButton/>
   </GlassMenu>
  </div>
 </header>
 {!review&&!visualReview&&<><nav className={"desktop-record-nav "+styles.desktopNav} aria-label="主导航"><span className={styles.desktopLens} aria-hidden="true" style={{transform:"translateY("+Math.max(0,pages.findIndex(([href])=>href===activePath))*74+"px)"}}/>{pages.map(([href,label],i)=><LoadingLink key={href} href={href} aria-current={activePath===href?"page":undefined}><NavigationIcon index={i}/><span>{label}</span></LoadingLink>)}</nav><MobileNavigation pathname={activePath}/></>}
 {hasTools&&<button type="button" className={styles.assistantTrigger} aria-label="打开小助手" aria-haspopup="dialog" aria-expanded={assistantOpen} onClick={openAssistant}><AssistantIcon/><span>小助手</span>{count>0&&<small>{count}</small>}</button>}
 {settings&&<Inspector title={settings==="sources"?"连接设备与数据来源":settings==="profile"?"个人资料":"账号与安全"} close={()=>setSettings(false)}>{settings==="sources"?<DataSourcesPanel available={sourcePilot}/>:<AccountSurface kind={settings}/>}</Inspector>}
 </>;
}

function pagePath(path:string){return pages.some(([href])=>href===(path==="/dashboard/energy"?"/dashboard/training":path))&&path!=="/dashboard";}
