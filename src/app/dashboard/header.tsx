"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./logout-button";
import { LoadingLink } from "@/components/loading-link";
import styles from "./header.module.css";
import {useAssistant} from "@/features/assistant/context";
import {AssistantIcon} from "@/features/assistant/icon";
import {AppearanceSwitch} from "@/components/appearance-switch";
import { BrandLogo } from "@/components/brand-logo";

const pages = [["/dashboard", "总览"], ["/dashboard/meals", "饮食"], ["/dashboard/energy", "消耗"], ["/dashboard/measurements", "身体"]] as const;

function NavigationIcon({ index }: { index: number }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {index === 0 ? <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="18" width="7" height="3" rx="1"/></>
      : index === 1 ? <><path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 2-5 5-5 9h5"/></>
      : index === 2 ? <path d="M12 3c1 5 6 6 6 11a6 6 0 0 1-12 0c0-2 1-4 3-6 0 4 2 4 3 5 2-2 1-6 0-10Z"/>
      : <><circle cx="12" cy="4" r="2"/><path d="m5 9 7 2 7-2M12 11v5m0 0-4 5m4-5 4 5"/></>}
  </svg>;
}
export function DashboardHeader({ email, owner = false }: { email: string; owner?: boolean }) {
  const pathname = usePathname(), menu = useRef<HTMLDetailsElement>(null);
  const {open:assistantOpen,show:openAssistant,hide:hideAssistant,count}=useAssistant();
  const page = pages.find(([path]) => path === pathname), review = pathname.includes("/operations/") || pathname.includes("/review/");
  const hasTools = !review && (Boolean(page) || pathname === "/dashboard/ai" || pathname === "/dashboard/export");
  useEffect(() => {
    if (menu.current) menu.current.open = false;
    const outside = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [pathname]);
  function openHeaderAssistant(){if(menu.current)menu.current.open=false;openAssistant();}
  return <><header className={"dashboard-header " + styles.header + (review ? " dashboard-review-header" : "")}>
    <LoadingLink className="dashboard-logo" href="/dashboard" aria-label="Formward 主页"><BrandLogo compactOnMobile /></LoadingLink>
    {!page && pathname !== "/dashboard" && <LoadingLink className="dashboard-back" href="/dashboard">← 总览</LoadingLink>}
    <span className="mobile-page-name" role={review ? "heading" : undefined} aria-level={review ? 1 : undefined}>{review ? "确认记录" : page?.[1] ?? (pathname.startsWith("/dashboard/export") ? "导出数据" : pathname === "/dashboard/account" ? "账号设置" : pathname === "/dashboard/profile" ? "个人资料" : pathname === "/dashboard/tutorial" ? "使用说明" : "AI 接入")}</span>
    <div className={styles.actions}>
      <details className="dashboard-menu" ref={menu} onToggle={event=>{if(event.currentTarget.open)hideAssistant();}} onKeyDown={event => { if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
        <summary aria-label="账号菜单"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M5.5 18c1-5 12-5 13 0"/></svg></summary><div><span>{email}</span><LoadingLink href="/dashboard/profile">个人资料</LoadingLink><LoadingLink href="/dashboard/account">账号设置</LoadingLink>{owner && <><LoadingLink href="/onboarding?mode=test">测试初次登录</LoadingLink><LoadingLink href="/admin">账号管理</LoadingLink></>}<AppearanceSwitch/><LogoutButton /></div>
      </details>
    </div>
  </header>
  {page && <nav className={"desktop-record-nav " + styles.desktopNav} aria-label="主导航">{pages.map(([href, label], index) => <LoadingLink key={href} href={href} aria-current={pathname === href ? "page" : undefined}><NavigationIcon index={index}/><span>{label}</span></LoadingLink>)}</nav>}
  {page && <nav className={"mobile-bottom-nav " + styles.mobileNav} aria-label="主导航">
    <div className={styles.mobilePages}>{pages.map(([href, label], index) => <LoadingLink key={href} href={href} aria-current={pathname === href ? "page" : undefined}><NavigationIcon index={index}/><span>{label}</span></LoadingLink>)}</div>
    <button type="button" className={styles.mobileTools} data-chart-controls aria-label={"助手"+(count?"，"+count+"条待核对记录":"")} aria-haspopup="dialog" aria-expanded={assistantOpen} onClick={openHeaderAssistant}><AssistantIcon/><span>助手{count>0&&<small className={styles.count}>{count}</small>}</span></button>
  </nav>}
  {hasTools && <button type="button" className={styles.assistantTrigger + (page ? "" : " " + styles.standaloneAssistant)} data-chart-controls aria-label={"助手"+(count?"，"+count+"条待核对记录":"")} aria-haspopup="dialog" aria-expanded={assistantOpen} onClick={openHeaderAssistant}><AssistantIcon/><span>助手</span>{count>0&&<small className={styles.count}>{count}</small>}</button>}
  </>;
}
