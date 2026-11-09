"use client";
import { useCallback, useEffect, useRef, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { LoadingLink } from "./loading-link";
import { confirmDraftDiscard, draftIsBusy } from "./draft-guard";
import { useChartTransition } from "./chart-transition-state";
import { workspacePages as pages } from "./workspace-pages";
import styles from "./mobile-navigation.module.css";
export function NavigationIcon({ index }: { index: number }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{index === 0 ? <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="18" width="7" height="3" rx="1"/></> : index === 1 ? <><path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 2-5 5-5 9h5"/></> : index === 2 ? <path d="m6.5 6.5 11 11M3 6l3-3 3 3-3 3Zm12 12 3-3 3 3-3 3ZM2 10l8-8m4 20 8-8"/> : index === 3 ? <path d="M13 3c1 5-2 5-1 9 2-1 3-3 3-5 4 4 5 7 3 11-3 5-11 3-12-2-1-4 2-6 3-8-1 4 1 5 2 5-1-4 2-6 2-10Z"/> : <><circle cx="12" cy="4" r="2"/><path d="m5 9 7 2 7-2M12 11v5m0 0-4 5m4-5 4 5"/></>}</svg>;
}
export function MobileNavigation({ pathname, onSelect }: { pathname: string; onSelect?: (href: string) => void }) {
  const router = useRouter(), chart = useChartTransition(), nav = useRef<HTMLElement>(null), lens = useRef<HTMLSpanElement>(null), drag = useRef<{ x: number; left: number; width: number; moved: boolean } | null>(null), suppress = useRef(0), motion = useRef({ x: 0, v: 0, frame: 0 }), [, startTransition] = useTransition();
  const count = pages.length, index = Math.max(0, pages.findIndex(([href]) => href === pathname));
  const settle = useCallback((target: number) => {
    const state = motion.current; cancelAnimationFrame(state.frame); let previous = performance.now();
    const draw = () => { if (lens.current) lens.current.style.transform = `translateX(${state.x}px) scale(${1 + Math.min(.13, Math.abs(state.v) * .0002)},${1 - Math.min(.05, Math.abs(state.v) * .00007)})`; };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { state.x = target; state.v = 0; draw(); return; }
    const tick = (now: number) => { const dt = Math.min((now - previous) / 1000, .024); previous = now; state.v += (-430 * (state.x - target) - 31 * state.v) * dt; state.x += state.v * dt; draw(); if (Math.abs(state.v) < .25 && Math.abs(state.x - target) < .15) { state.x = target; state.v = 0; draw(); return; } state.frame = requestAnimationFrame(tick); }; state.frame = requestAnimationFrame(tick);
  }, []);
  useEffect(() => {
    const node = nav.current; if (!node) return;
    const sync = () => settle(index * (node.clientWidth - 12) / count); sync();
    const observer = new ResizeObserver(sync); observer.observe(node);
    const query = matchMedia("(prefers-reduced-motion: reduce)"); query.addEventListener("change", sync); const state = motion.current;
    return () => { observer.disconnect(); query.removeEventListener("change", sync); cancelAnimationFrame(state.frame); };
  }, [index, count, settle]);
  const select = async (target: number, step: number) => {
    if (!onSelect && target === 0 && pathname !== "/dashboard") { await chart.back(); return; }
    if (draftIsBusy() || !await confirmDraftDiscard()) { settle(index * step); return; }
    settle(target * step); if (onSelect) onSelect(pages[target][0]); else startTransition(() => router.push(pages[target][0]));
  };
  return <nav ref={nav} className={"mobile-bottom-nav " + styles.mobileNav + (onSelect ? " " + styles.previewNav : "")} style={{ "--nav-count": count } as CSSProperties} aria-label="主导航" onDragStart={event => event.preventDefault()}
    onClickCapture={event => { if (performance.now() < suppress.current) { event.preventDefault(); event.stopPropagation(); } }}
    onPointerDown={event => { suppress.current = 0; if (event.button !== 0 || !event.isPrimary) return; const r = event.currentTarget.getBoundingClientRect(); drag.current = { x: event.clientX, left: r.left, width: r.width, moved: false }; }}
    onPointerMove={event => { const d = drag.current; if (!d) return; d.moved ||= Math.abs(event.clientX - d.x) > 7; if (!d.moved) return; event.currentTarget.setPointerCapture(event.pointerId); cancelAnimationFrame(motion.current.frame); const step = (d.width - 12) / count, next = Math.max(-4, Math.min(step * (count - 1) + 4, event.clientX - d.left - 6 - step / 2)); motion.current.v = (next - motion.current.x) * 35; motion.current.x = next; if (lens.current) lens.current.style.transform = `translateX(${next}px)${matchMedia("(prefers-reduced-motion: reduce)").matches ? "" : " scale(1.08,.97)"}`; }}
    onPointerCancel={() => { drag.current = null; settle(index * ((nav.current?.clientWidth ?? 0) - 12) / count); }}
    onPointerUp={event => { const d = drag.current; drag.current = null; if (!d?.moved) return; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); suppress.current = performance.now() + 350; const step = (d.width - 12) / count, target = Math.max(0, Math.min(count - 1, Math.round(motion.current.x / step))); void select(target, step); }}>
    <span ref={lens} className={styles.navLens} aria-hidden="true"/>{pages.map(([href, label], i) => <LoadingLink key={href} href={href} aria-current={pathname === href ? "page" : undefined} onNavigate={onSelect ? event => { event.preventDefault(); onSelect(href); } : href === "/dashboard" && pathname !== "/dashboard" ? event => { event.preventDefault(); void chart.back(); } : undefined}><NavigationIcon index={i}/><span>{label}</span></LoadingLink>)}
  </nav>;
}
