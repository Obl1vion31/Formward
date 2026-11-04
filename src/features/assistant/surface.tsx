"use client";
import { useEffect, useRef } from "react";
import { LoadingLink } from "@/components/loading-link";
import { lockPageScroll } from "@/components/scroll-lock";
import { useMobileMode } from "@/components/use-mobile-mode";
import { confirmationIsOpen } from "@/components/confirmation-state";
import { assistantQuickActions, assistantTools, type AssistantContext, type AssistantItem } from "./model";
import { localMeasurementDate } from "../measurements/entry-state";
import { AssistantIcon } from "./icon";
import styles from "./surface.module.css";

export function AssistantSurface({ data, error, loading, automatic, close, presented, retry, changeAutomatic }: {
  data: AssistantContext | null; error: string; loading: boolean; automatic: boolean;
  close: () => void; presented: () => void; retry: () => void; changeAutomatic: (enabled: boolean) => void;
}) {
  const mobile = useMobileMode(), dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null), pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const node = dialog.current; if (!node || mobile === null) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const release = mobile ? lockPageScroll() : () => {};
    if (mobile) node.showModal(); else node.show();
    closeButton.current?.focus({ preventScroll: true }); presented();
    const occupied = () => { if (document.querySelector('dialog[open]:not([data-assistant-surface])') || document.fullscreenElement || confirmationIsOpen()) close(); };
    const observer = new MutationObserver(occupied); observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    const escape = (event: KeyboardEvent) => {
      if (!mobile && event.key === "Escape" && !document.querySelector('dialog[open]:not([data-assistant-surface])')) { event.preventDefault(); close(); }
      if (mobile && event.key === "Tab") {
        const targets = [...node.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),summary,[tabindex="0"]')].filter(element => element.getClientRects().length > 0);
        const first = targets[0], last = targets.at(-1);
        if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", escape); document.addEventListener("fullscreenchange", occupied); window.addEventListener("formward-confirmation-change", occupied);
    return () => { const returnFocus = mobile || node.contains(document.activeElement); observer.disconnect(); document.removeEventListener("keydown", escape); document.removeEventListener("fullscreenchange", occupied); window.removeEventListener("formward-confirmation-change", occupied); node.close(); release(); if (returnFocus && trigger?.isConnected && !document.querySelector("dialog[open]")) trigger.focus({ preventScroll: true }); };
  }, [mobile, close, presented]);
  if (mobile === null) return null;
  const today = data?.localDate ?? localMeasurementDate(new Date());
  const outside = (x: number, y: number) => { const r = dialog.current!.getBoundingClientRect(); return x < r.left || x > r.right || y < r.top || y > r.bottom; };
  const items = (rows: AssistantItem[]) => <ul className={styles.items}>{rows.map(item => <li key={item.id}><div><strong>{item.title}</strong><time dateTime={item.date}>{item.date.replaceAll("-", ".")}</time></div><p>{item.detail}</p><LoadingLink prefetch={false} href={item.action.href} onNavigate={close}>{item.action.label}<span aria-hidden="true"> →</span></LoadingLink></li>)}</ul>;
  return <dialog ref={dialog} className={styles.surface} data-assistant-surface data-assistant-open aria-labelledby="assistant-title" aria-modal={mobile || undefined} onCancel={event => { event.preventDefault(); close(); }}
    onPointerDown={event => { pointer.current = mobile && event.isPrimary && outside(event.clientX, event.clientY) ? { x: event.clientX, y: event.clientY } : null; }}
    onPointerUp={event => { const down = pointer.current; pointer.current = null; if (down && outside(event.clientX, event.clientY) && Math.hypot(event.clientX - down.x, event.clientY - down.y) <= 6) close(); }}>
    <header className={styles.heading}><div><AssistantIcon/><h2 id="assistant-title">小助手</h2></div><button ref={closeButton} type="button" aria-label="收起小助手" onClick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <div className={styles.content}>
      <time className={styles.date} dateTime={today}>今天 · {today.replaceAll("-", ".")}</time>
      <div aria-live="polite" aria-busy={loading} className={styles.introduction}>
        {error ? <><p role="alert">{error}</p>{error.includes("登录") ? <LoadingLink href="/">重新登录 →</LoadingLink> : <button type="button" onClick={retry}>重新核对</button>}</> : !data ? <p>正在核对最近记录…</p> : <><p className={styles.lead}>{data.pending.length ? `有 ${data.pending.length} 条记录需要核对` : "当前没有需要核对的记录"}</p><p className={styles.secondary}>{data.pending.length ? "从这里接着处理，已保存的内容都在" : "可以继续记录，或打开常用功能"}</p>{loading && <span className={styles.refreshing}>正在更新…</span>}</>}
      </div>
      {!error && data && <>{data.pending.length > 0 && <section aria-label="待核对记录">{items(data.pending)}</section>}
        {data.suggestions.length > 0 && <details className={styles.disclosure}><summary>可补充记录 <span>{data.suggestions.length}</span></summary>{items(data.suggestions)}</details>}</>}
      <section className={styles.quick}><h3>现在想记录什么</h3><div>{assistantQuickActions(today).map(action => <LoadingLink prefetch={false} key={action.label} href={action.href} onNavigate={close}>{action.label}</LoadingLink>)}</div></section>
      <details className={styles.disclosure}><summary>常用功能</summary><nav className={styles.tools} aria-label="教程、连接与导出">{assistantTools.map(action => <LoadingLink prefetch={false} key={action.label} href={action.href} onNavigate={close}>{action.label}<span aria-hidden="true">→</span></LoadingLink>)}</nav></details>
    </div>
    <footer className={styles.footer}><label><input type="checkbox" checked={automatic} onChange={event => changeAutomatic(event.target.checked)}/><span>有待处理事项时，每天自动出现一次</span></label><button type="button" onClick={close}>先继续浏览</button></footer>
  </dialog>;
}
