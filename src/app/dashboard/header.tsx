"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./logout-button";
import { LoadingLink } from "@/components/loading-link";
import { NavigationIcon, MobileNavigation } from "@/components/mobile-navigation";
import { workspacePages as pages } from "@/components/workspace-pages";
import { Inspector } from "@/components/inspector";
import { AppearanceToggle, FollowSystemAppearance } from "@/components/appearance-switch";
import { BrandLogo } from "@/components/brand-logo";
import { useAssistant } from "@/features/assistant/context";
import { AssistantIcon } from "@/features/assistant/icon";
import { GlassMenu } from "@/components/glass-menu";
import { DataSourcesPanel } from "@/features/data-sources/panel";
import { AccountSurface } from "@/features/auth/account-surfaces";
import { useMobileMode } from "@/components/use-mobile-mode";
import { useChartTransition } from "@/components/chart-transition-state";
import {useAppInformation} from "@/components/app-information";
import { LocalLoading } from "@/components/local-loading";
import styles from "./header.module.css";
type Group = "root" | "external" | "account" | "admin";
export function DashboardHeader({ email, owner = false, sourcePilot = false }: { email: string; owner?: boolean; sourcePilot?: boolean }) {
  const openInformation = useAppInformation();
  const actualPath = usePathname(), [settings, setSettings] = useState<false | "profile" | "account" | "sources">(false), [group, setGroup] = useState<Group>("root");
  const { hide: hideAssistant, source } = useAssistant(), chart = useChartTransition();
  const pathname = chart.displayPath ?? source?.path ?? actualPath;
  const previousGroup = useRef<Group>("root"), menuClose = useRef<() => Promise<void>>(() => Promise.resolve()), [pendingAccount, setPendingAccount] = useState<string | null>(null);
  const pendingChanges = useMemo(() => Object.fromEntries(["sources", "profile", "account"].map(kind => [kind, (pending: boolean) => setPendingAccount(current => pending ? kind : current === kind ? null : current)])), []);
  const page = pages.find(([path]) => path === pathname), visualReview = pathname === "/dashboard/visual-review", review = reviewPath(pathname), hasTools = !review && assistantAvailablePage(pathname);
  const showDock = !review && !visualReview;
  const openSettings = async (kind: "profile" | "account" | "sources") => { await menuClose.current(); document.querySelector<HTMLElement>('.dashboard-header summary[aria-label="账号菜单"]')?.focus({ preventScroll: true }); setSettings(kind); };
  const openMoreInformation = async () => { await menuClose.current(); document.querySelector<HTMLElement>('.dashboard-header summary[aria-label="账号菜单"]')?.focus({preventScroll: true}); openInformation(); };
  const overview = (event: { preventDefault(): void }) => { if (actualPath !== "/dashboard"||chart.returningToOverview||!!chart.forwardDestination) { event.preventDefault(); void chart.back(); } };
  useLayoutEffect(()=>{const previous=previousGroup.current;previousGroup.current=group;if(previous!==group)document.querySelector<HTMLElement>(group==="root"?'[data-menu-group="'+previous+'"]':"[data-menu-back]")?.focus({preventScroll:true});},[group]);
  const changeGroup=(next:Group)=>setGroup(next);
  const backGroup = <button type="button" data-menu-back data-menu-stay-open className={styles.menuBack} onClick={() => changeGroup("root")}><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m10 3-5 5 5 5"/></svg>{group === "external" ? "外部接入" : group === "account" ? "账号管理" : "管理与测试"}</button>;
  return <>
    <header className={"dashboard-header " + styles.header + (review ? " dashboard-review-header" : "")}>
      <LoadingLink className="dashboard-logo" href="/dashboard" onNavigate={overview} aria-label="Formward 主页"><BrandLogo compactOnMobile/></LoadingLink>
      <span className={"mobile-page-name" + (pathname === "/dashboard/ai" ? " " + styles.aiTitle : "")} role={page || pathname === "/dashboard/ai" ? "heading" : undefined} aria-level={page || pathname === "/dashboard/ai" ? 1 : undefined}>{review ? "确认记录" : visualReview ? "视觉验收" : page?.[1] ?? (pathname.includes("/account") ? "账号与安全" : pathname.includes("/profile") ? "个人资料" : pathname.includes("/tutorial") ? "使用说明" : pathname.includes("/export") ? "导出 Excel" : pathname.includes("/sources") ? "设备与数据来源" : "AI 接入")}</span>
      <div className={styles.actions}><AppearanceToggle/>
        <GlassMenu onEscape={()=>{if(group!=="root"){changeGroup("root");return true;}return false;}} onCloseReady={close => { menuClose.current = close; }} onOpen={async () => { setGroup("root"); await hideAssistant(); }} icon={<><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M5.5 18c1-5 12-5 13 0"/></svg><LocalLoading active={!!pendingAccount} iconOnly label="正在打开账号页面…"/></>}>
          {group === "root" ? <><span className={styles.menuEmail}>{email}</span><FollowSystemAppearance/>{([["external", "外部接入"], ["account", "账号管理"], ...(owner ? [["admin", "管理与测试"]] : [])] as [Group, string][]).map(([key, label]) => <button key={key} type="button" data-menu-stay-open data-menu-group={key} onClick={() => changeGroup(key)}>{label}<span aria-hidden="true">›</span></button>)}<button type="button" aria-haspopup="dialog" onClick={() => void openMoreInformation()}>更多信息</button></> : <>{backGroup}
            {group === "external" && <>{mobile ? <button type="button" onClick={() => void openSettings("sources")}>设备与数据来源</button> : <LoadingLink beforeNavigate={() => menuClose.current()} onPendingChange={pendingChanges.sources} href="/dashboard/sources">设备与数据来源</LoadingLink>}<LoadingLink beforeNavigate={() => menuClose.current()} href="/dashboard/ai">AI 接入</LoadingLink></>}
            {group === "account" && <>{mobile ? <><button type="button" onClick={() => void openSettings("profile")}>个人资料</button><button type="button" onClick={() => void openSettings("account")}>账号与安全</button></> : <><LoadingLink beforeNavigate={() => menuClose.current()} onPendingChange={pendingChanges.profile} href="/dashboard/profile">个人资料</LoadingLink><LoadingLink beforeNavigate={() => menuClose.current()} onPendingChange={pendingChanges.account} href="/dashboard/account">账号与安全</LoadingLink></>}<LogoutButton/></>}
            {group === "admin" && owner && <><LoadingLink beforeNavigate={() => menuClose.current()} href="/onboarding?mode=test">测试初次登录</LoadingLink><LoadingLink beforeNavigate={() => menuClose.current()} href="/admin">管理后台</LoadingLink></>}
          </>}
        </GlassMenu>
      </div>
    </header>
    {showDock &&
      <nav className={"desktop-record-nav " + styles.desktopNav} aria-label="主导航"><span className={styles.desktopLens} aria-hidden="true" style={{ transform: "translateY(" + Math.max(0, pages.findIndex(([href]) => href === pathname)) * 74 + "px)" }}/>{pages.map(([href, label], index) => <LoadingLink key={href} href={href} onNavigate={href === "/dashboard" ? overview : ()=>chart.cancelOverviewReturn?.(href)} aria-current={pathname === href ? "page" : undefined}><NavigationIcon index={index}/><span>{label}</span></LoadingLink>)}</nav>
    }
    {hasTools && <div className={styles.desktopAssistant}><AssistantButton beforeOpen={() => menuClose.current()}/></div>}
    {settings && <Inspector title={settings === "sources" ? "设备与数据来源" : settings === "profile" ? "个人资料" : "账号与安全"} close={() => setSettings(false)}>{settings === "sources" ? <DataSourcesPanel available={sourcePilot}/> : <AccountSurface key={settings} kind={settings}/>}</Inspector>}
  </>;
}
export function DashboardDock() {
  const actualPath = usePathname();
  const { displayPath } = useChartTransition();
  const { source } = useAssistant();
  const pathname = displayPath ?? source?.path ?? actualPath;
  const mobile = useMobileMode();
  const dock = useRef<HTMLDivElement>(null);
  const showDock = !reviewPath(pathname) && pathname !== "/dashboard/visual-review";

  useLayoutEffect(() => {
    const node = dock.current;
    if (!node || !mobile) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty("--workspace-dock-height", Math.ceil(node.getBoundingClientRect().height) + "px");
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => { observer.disconnect(); root.style.removeProperty("--workspace-dock-height"); };
  }, [mobile, showDock]);

  return showDock && <div ref={dock} className={styles.mobileDock} data-workspace-dock>
    <MobileNavigation pathname={pathname}/>
    {assistantAvailablePage(pathname) && <AssistantButton mobile/>}
  </div>;
}

function AssistantButton({ mobile = false, beforeOpen }: { mobile?: boolean; beforeOpen?: () => Promise<void> }) {
  const { open, count, toggle } = useAssistant();
  async function activate() {
    if (mobile) window.dispatchEvent(new Event("formward-close-account-menu"));
    else await beforeOpen?.();
    toggle();
  }
  return <button type="button" data-assistant-trigger className={styles.assistantTrigger}
    aria-label={"打开小助手" + (count ? "，" + count + "项待查看" : "")} aria-haspopup={mobile ? undefined : "dialog"}
    aria-expanded={mobile ? undefined : open} onClick={() => void activate()}>
    <AssistantIcon/><span>小助手</span>
    {count > 0 && <small className={styles.badge} aria-hidden="true">{count > 9 ? "9+" : count}</small>}
  </button>;
}

function reviewPath(path: string) { return path.includes("/operations/") || path.includes("/review/"); }
function assistantAvailablePage(path: string) { return pages.some(([href]) => href === path) || ["/dashboard/ai", "/dashboard/export", "/dashboard/sources"].includes(path); }
