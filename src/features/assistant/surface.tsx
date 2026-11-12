"use client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { animateSurface } from "@/components/surface-motion";
import { LoadingLink } from "@/components/loading-link";
import { lockPageScroll } from "@/components/scroll-lock";
import { confirmationIsOpen } from "@/components/confirmation-state";
import { useMobileMode } from "@/components/use-mobile-mode";
import { assistantQuickActions, assistantTools, type AssistantContext, type AssistantItem } from "./model";
import { localMeasurementDate } from "../measurements/entry-state";
import { AssistantIcon } from "./icon";
import {useRecordGuidance} from "../onboarding/record-guidance";
import {recordGuides,type RecordGuideKind} from "../onboarding/record-guidance-model";
import styles from "./surface.module.css";
import { AssistantChatView, ChatHeaderActions } from "./chat-view";
type Controller = { dismiss: () => Promise<boolean>; reopen: () => void };
export function AssistantSurface({ data, error, loading, close, requestClose, retry, dismissItem, controllerReady, chatEnabled = false }: {
  data: AssistantContext | null; error: string; loading: boolean; close: () => void; requestClose: () => Promise<void>; retry: () => void;
  dismissItem: (id: string) => Promise<string>; controllerReady: (value: Controller | null) => void; chatEnabled?: boolean;
}) {
  const mobile = useMobileMode(), dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null), toolsButton = useRef<HTMLButtonElement>(null), pending = useRef<Promise<boolean> | null>(null), ticket = useRef(0);
  const [closing, setClosing] = useState(false), [expanded, setExpanded] = useState(chatEnabled), [tools, setTools] = useState(false), [guides,setGuides]=useState(false), [busy, setBusy] = useState(""), [failure, setFailure] = useState("");
  const {replay}=useRecordGuidance();
  const gesture = useRef<{ y: number; delta: number } | null>(null), suppress = useRef(0);
  const dismiss = useCallback(() => {
    if (pending.current) return pending.current;
    const node = dialog.current; if (!node) return Promise.resolve(true);
    const id = ++ticket.current; setClosing(true); setTools(false);setGuides(false);
    const task = animateSurface(node, "close", null, mobile ? "sheet" : "anchored").then(finished => {
      if (finished && ticket.current === id) close();
      if (pending.current === task) pending.current = null;
      return finished && ticket.current === id;
    });
    pending.current = task; return task;
  }, [close, mobile]);
  const reopen = useCallback(() => {
    ticket.current++; pending.current = null; setClosing(false);
    if (dialog.current) void animateSurface(dialog.current, "open", null, mobile ? "sheet" : "anchored");
  }, [mobile]);
  useLayoutEffect(() => { controllerReady({ dismiss, reopen }); return () => controllerReady(null); }, [controllerReady, dismiss, reopen]);
  useLayoutEffect(() => {
    const node = dialog.current; if (!node || mobile === null) return;
    const previous = document.activeElement, trigger = [...document.querySelectorAll<HTMLElement>("[data-assistant-trigger]")].find(element=>element.getClientRects().length>0);
    if (mobile) node.showModal(); else node.show();
    const unlock = mobile ? lockPageScroll() : () => {};
    void animateSurface(node, "open", trigger, mobile ? "sheet" : "anchored"); closeButton.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!confirmationIsOpen() && !node.contains(event.target as Node) && !(event.target as Element).closest("[data-assistant-trigger]")) void requestClose(); };
    if (!mobile) document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("pointerdown", outside); node.getAnimations().forEach(animation => animation.cancel()); node.close(); unlock(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [mobile, requestClose]);
  if (mobile === null) return null;
  const today = data?.localDate ?? localMeasurementDate(new Date());
  const navigate = async () => { await requestClose(); const phase = dialog.current?.dataset.surfacePhase; return phase !== "open" && phase !== "opening"; };
  const items = (rows: AssistantItem[]) => <ul className={styles.items}>{rows.map(item => <li key={item.id} data-assistant-item={item.id}>
    <div><strong>{item.title}</strong><time dateTime={item.date}>{item.date.replaceAll("-", ".")}</time></div><p>{item.detail}</p>
    <div className={styles.itemActions}><LoadingLink prefetch={false} href={item.action.href} beforeNavigate={navigate}>{item.action.label}<span aria-hidden="true"> →</span></LoadingLink>
    {item.dismissible && <button type="button" disabled={busy === item.id} onClick={async () => { setBusy(item.id); setFailure(""); try { setFailure(await dismissItem(item.id)); } catch { setFailure("忽略未保存，请重试。"); } finally { setBusy(""); } }}>{busy === item.id ? "保存中…" : "忽略这一天"}</button>}</div>
  </li>)}</ul>;
  const taskContent = <>
    <div className={styles.content} onClick={() => { if (tools) {setTools(false);setGuides(false);} }}>
      <section className={styles.quick} aria-label="快捷记录"><div>{assistantQuickActions(today).map(action => <LoadingLink prefetch={false} key={action.label} href={action.href} beforeNavigate={navigate}>{action.label}</LoadingLink>)}</div></section>
      <section className={styles.introduction} aria-live="polite" aria-busy={loading}>
        {error ? <><p role="alert">{error}</p><button type="button" onClick={retry}>重新读取</button></> : !data ? <p className={styles.muted}>正在读取事项…</p> : data.pending.length ? items(data.pending) : <p className={styles.muted}>暂无待确认或待办事项</p>}
        {failure && <p role="alert">{failure}</p>}
      </section>
      {data && data.suggestions.length > 0 && <details className={styles.disclosure}><summary>按需补记</summary>{items(data.suggestions)}</details>}
    </div>
    <footer className={styles.footer}>
      <nav id="assistant-tools" className={styles.tools} aria-label="常用功能" data-open={tools} aria-hidden={!tools} inert={!tools}>{guides?<><button type="button" onClick={()=>setGuides(false)}>← 返回常用功能</button>{(Object.keys(recordGuides) as RecordGuideKind[]).map(kind=><button type="button" key={kind} onClick={async()=>{if(await navigate())await replay(kind);}}>重播{recordGuides[kind].label}录入引导<span aria-hidden="true">→</span></button>)}</>:<>{assistantTools.map(action => <LoadingLink key={action.label} href={action.href} beforeNavigate={navigate}>{action.label}<span aria-hidden="true">→</span></LoadingLink>)}{!chatEnabled && <button type="button" disabled>聊天 · 暂未开放</button>}<button type="button" onClick={()=>setGuides(true)}>重播操作引导<span aria-hidden="true">→</span></button></>}</nav>
      <button ref={toolsButton} type="button" aria-expanded={tools} aria-controls="assistant-tools" onClick={() => {setTools(value => !value);setGuides(false);}}>常用功能 <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style={{ transform: tools ? "rotate(180deg)" : undefined }}><path d="m4 10 4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></button>
    </footer>
  </>;
  return <dialog ref={dialog} className={styles.surface} data-chat={chatEnabled} data-assistant-surface data-mobile={mobile} data-expanded={expanded} data-closing={closing} aria-labelledby="assistant-title" aria-modal={mobile || undefined}
    onCancel={event => { event.preventDefault(); if(guides)setGuides(false);else if (tools) {setTools(false);toolsButton.current?.focus();} else void requestClose(); }}
    onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) void requestClose(); } }}
    onKeyDown={event => {
      if (event.key === "Escape" && tools) { event.preventDefault(); event.stopPropagation(); if(guides)setGuides(false);else {setTools(false); toolsButton.current?.focus();} return; }
      if (!mobile || event.key !== "Tab") return;
      const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],summary,textarea,input:not([type=file]),select")].filter(node => node.getClientRects().length > 0 && !node.closest("[inert]") && !node.closest("details:not([open]) :not(summary)"));
      const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    {mobile && <button type="button" className={styles.handle} aria-label={expanded ? "收起小助手到半屏，可拖动" : "展开小助手，可拖动"} aria-expanded={expanded} onClick={() => { if (performance.now() > suppress.current) setExpanded(value => !value); }}
      onPointerDown={event => { if (event.button !== 0 || closing) return; gesture.current = { y: event.clientY, delta: 0 }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const g = gesture.current; if (!g) return; g.delta = event.clientY - g.y; if (dialog.current) dialog.current.style.transform = `translateY(${g.delta > 0 ? g.delta : -Math.sqrt(-g.delta) * 2}px)`; }}
      onPointerUp={event => { const g = gesture.current; gesture.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (!g) return; const node = dialog.current; if (Math.abs(g.delta) > 7) suppress.current = performance.now() + 350; if (g.delta < -35) setExpanded(true); else if (g.delta > 65) { if (expanded) setExpanded(false); else { void requestClose(); return; } } if (node) { const from = node.style.transform; node.style.transform = ""; if (!matchMedia("(prefers-reduced-motion: reduce)").matches) node.animate([{ transform: from }, { transform: "translateY(0)" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }); } }}
      onPointerCancel={() => { gesture.current = null; if (dialog.current) dialog.current.style.transform = ""; }}><span/></button>}
    <header className={styles.heading}><div><AssistantIcon/><h2 id="assistant-title">小助手</h2></div><div>{chatEnabled && <ChatHeaderActions/>}<button ref={closeButton} type="button" aria-label="收起小助手" onClick={() => void requestClose()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></header>
    {chatEnabled ? <AssistantChatView sidebar={taskContent} navigate={navigate} pendingCount={data?.pending.length ?? 0}/> : taskContent}
  </dialog>;
}
