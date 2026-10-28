"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogoutButton } from "./logout-button";
import { LoadingLink } from "@/components/loading-link";
import { Inspector } from "@/components/inspector";
import { usePageLoading } from "@/components/page-loading-state";
import inspectorStyles from "@/components/inspector.module.css";
import styles from "./header.module.css";

const pages = [["/dashboard", "总览"], ["/dashboard/meals", "饮食"], ["/dashboard/energy", "消耗"], ["/dashboard/measurements", "身体"]] as const;
const futureTools = [
  { name: "打卡记录", description: "暂未开放" },
  { name: "最近总结", description: "暂未开放" },
  { name: "AI 录入", description: "站内聊天录入，暂未开放" },
] as const;

export function DashboardHeader({ email }: { email: string }) {
  const pathname = usePathname(), router = useRouter(), menu = useRef<HTMLDetailsElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false), [pending, startTransition] = useTransition();
  const closeTools = useRef<() => void>(() => {}), nextHref = useRef<string | null>(null);
  const page = pages.find(([path]) => path === pathname), review = pathname.includes("/operations/") || pathname.includes("/review/");
  const hasTools = !review && (Boolean(page) || pathname === "/dashboard/ai" || pathname === "/dashboard/export");
  usePageLoading({ active: pending, label: "正在加载页面…" });
  useEffect(() => {
    if (menu.current) menu.current.open = false;
    const outside = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [pathname]);
  useEffect(() => {
    if (toolsOpen || !nextHref.current) return;
    const href = nextHref.current;
    nextHref.current = null;
    if (href !== pathname) startTransition(() => router.push(href));
  }, [toolsOpen, pathname, router]);
  function openTools() {
    // 填写窗口已占用焦点时，保持它和其中的草稿。
    if (document.querySelector("dialog[open]")) return;
    if (menu.current) menu.current.open = false;
    nextHref.current = null;
    setToolsOpen(true);
  }
  function navigateFromTools(href: string) {
    if (nextHref.current) return;
    nextHref.current = href;
    closeTools.current();
  }
  return <><header className={"dashboard-header " + styles.header + (review ? " dashboard-review-header" : "")}>
    <LoadingLink className="dashboard-logo" href="/dashboard" aria-label="Formward 主页">formward<span>.</span></LoadingLink>
    {!page && pathname !== "/dashboard" && <LoadingLink className="dashboard-back" href="/dashboard">← 总览</LoadingLink>}
    {page && <nav className="desktop-record-nav" aria-label="主导航">{pages.map(([href, label]) => <LoadingLink key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</LoadingLink>)}</nav>}
    <span className="mobile-page-name" role={review ? "heading" : undefined} aria-level={review ? 1 : undefined}>{review ? "确认记录" : page?.[1] ?? (pathname.startsWith("/dashboard/export") ? "导出数据" : "AI 接入")}</span>
    <div className={styles.actions + (page ? " " + styles.withNavigation : "")}>
      {hasTools && <button type="button" className={styles.toolsTrigger} data-chart-controls aria-haspopup="dialog" aria-expanded={toolsOpen} onClick={openTools}>工具</button>}
      <details className="dashboard-menu" ref={menu} onKeyDown={event => { if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
        <summary aria-label="账号菜单">•••</summary><div><span>{email}</span><LogoutButton /></div>
      </details>
    </div>
  </header>{page && <nav className="mobile-bottom-nav" aria-label="主导航">{pages.map(([href, label]) => <LoadingLink key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</LoadingLink>)}</nav>}
  {toolsOpen && <Inspector title="工具" close={() => setToolsOpen(false)} onCloseReady={close => { closeTools.current = close; }} className={inspectorStyles.drawer + " " + styles.drawer} header={<div className={styles.drawerHeading}><h2>工具</h2><button type="button" aria-label="关闭工具栏" onClick={() => closeTools.current()}>×</button></div>}>
    <nav className={styles.toolLinks} aria-label="连接与导出">
      <LoadingLink href="/dashboard/ai" aria-label="AI 接入" onNavigate={event => { event.preventDefault(); navigateFromTools("/dashboard/ai"); }}><span><strong>AI 接入</strong><small>连接你正在使用的 AI 助手</small></span><span className={styles.arrow} aria-hidden="true">→</span></LoadingLink>
      <LoadingLink href="/dashboard/export" aria-label="导出 Excel" onNavigate={event => { event.preventDefault(); navigateFromTools("/dashboard/export"); }}><span><strong>导出 Excel</strong><small>下载你的记录</small></span><span className={styles.arrow} aria-hidden="true">→</span></LoadingLink>
    </nav>
    <section className={styles.futureTools} aria-label="后续功能"><h3>后续功能</h3>{futureTools.map(tool => <button key={tool.name} type="button" disabled aria-label={tool.name}><span>{tool.name}</span><small>{tool.description}</small></button>)}</section>
  </Inspector>}</>;
}
