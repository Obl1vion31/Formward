"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./logout-button";
import { LoadingLink } from "@/components/loading-link";
const pages = [["/dashboard", "总览"], ["/dashboard/meals", "饮食"], ["/dashboard/energy", "消耗"], ["/dashboard/measurements", "身体"]] as const;
export function DashboardHeader({ email }: { email: string }) {
  const pathname = usePathname(), menu = useRef<HTMLDetailsElement>(null);
  const page = pages.find(([path]) => path === pathname), review = pathname.includes("/operations/") || pathname.includes("/review/");
  useEffect(() => {
    if (menu.current) menu.current.open = false;
    const outside = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [pathname]);
  return <><header className={`dashboard-header${review ? " dashboard-review-header" : ""}`}>
    <LoadingLink className="dashboard-logo" href="/dashboard" aria-label="Formward 主页">formward<span>.</span></LoadingLink>
    {pathname !== "/dashboard" && <LoadingLink className="dashboard-back" href="/dashboard">← 总览</LoadingLink>}
    <span className="mobile-page-name" role={review ? "heading" : undefined} aria-level={review ? 1 : undefined}>{review ? "确认记录" : page?.[1] ?? (pathname.startsWith("/dashboard/export")?"导出数据":"AI 接入")}</span>
    <div className="dashboard-account"><span>{email}</span><LoadingLink href="/dashboard/ai" className="dashboard-ai-link">AI 接入</LoadingLink><LoadingLink href="/dashboard/export" className="dashboard-ai-link">导出数据</LoadingLink><LogoutButton /></div>
    <details className="dashboard-menu" ref={menu} onKeyDown={event => { if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
      <summary aria-label="账号与导航菜单">•••</summary><div><span>{email}</span><LoadingLink href="/dashboard">总览</LoadingLink><LoadingLink href="/dashboard/ai">AI 接入</LoadingLink><LoadingLink href="/dashboard/export">导出 Excel</LoadingLink><LogoutButton /></div>
    </details>
  </header>{page && <nav className="mobile-bottom-nav" aria-label="主导航">{pages.map(([href, label]) => <LoadingLink key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</LoadingLink>)}</nav>}</>;
}
