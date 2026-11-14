"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
import { AssistantChatView, ChatHeaderActions, ChatNavigation, type ChatTab } from "./chat-view";
type Controller = { dismiss: () => Promise<boolean>; reopen: () => void };
export function AssistantSurface({ data, error, loading, close, requestClose, retry, dismissItem, controllerReady, chatEnabled = false }: {
  data: AssistantContext | null; error: string; loading: boolean; close: () => void; requestClose: () => Promise<void>; retry: () => void;
  dismissItem: (id: string) => Promise<string>; controllerReady: (value: Controller | null) => void; chatEnabled?: boolean;
}) {
  const mobile = useMobileMode(), dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null), toolsButton = useRef<HTMLButtonElement>(null), pending = useRef<Promise<boolean> | null>(null), ticket = useRef(0);
  const [chatTab,setChatTab]=useState<ChatTab>("chat");
  useEffect(()=>{const show=()=>setChatTab("chat");window.addEventListener("formward-assistant-preview",show);return()=>window.removeEventListener("formward-assistant-preview",show);},[]);
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
  const drag={
    onPointerDown(event:ReactPointerEvent<HTMLElement>){if(!mobile||event.button!==0||closing||(event.target as Element).closest("button,select,a,input,summary"))return;gesture.current={y:event.clientY,delta:0};event.currentTarget.setPointerCapture(event.pointerId);},
    onPointerMove(event:ReactPointerEvent<HTMLElement>){const g=gesture.current;if(!g)return;g.delta=event.clientY-g.y;if(dialog.current)dialog.current.style.transform=`translateY(${g.delta>0?g.delta:-Math.sqrt(-g.delta)*2}px)`;},
    onPointerUp(event:ReactPointerEvent<HTMLElement>){const g=gesture.current;gesture.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);if(!g)return;const node=dialog.current;if(Math.abs(g.delta)>7)suppress.current=performance.now()+350;if(g.delta<-35)setExpanded(true);else if(g.delta>65){if(expanded)setExpanded(false);else{void requestClose();return;}}if(node){const from=node.style.transform;node.style.transform="";if(!matchMedia("(prefers-reduced-motion:reduce)").matches)node.animate([{transform:from},{transform:"translateY(0)"}],{duration:220,easing:"cubic-bezier(.2,.8,.2,1)"});}},
    onPointerCancel(){gesture.current=null;if(dialog.current)dialog.current.style.transform="";}
  };
  if (mobile === null) return null;
  const today = data?.localDate ?? localMeasurementDate(new Date());
  const navigate = async () => { await requestClose(); const phase = dialog.current?.dataset.surfacePhase; return phase !== "open" && phase !== "opening"; };
  const items = (rows: AssistantItem[]) => <ul className={styles.items}>{rows.map(item => <li key={item.id} data-assistant-item={item.id}>
    <div><strong>{item.title}</strong><time dateTime={item.date}>{item.date.replaceAll("-", ".")}</time></div><p>{item.detail}</p>
    <div className={styles.itemActions}>{item.action.previewId&&chatEnabled?<button type="button" onClick={()=>window.dispatchEvent(new CustomEvent("formward-assistant-preview",{detail:{id:item.action.previewId}}))}>{item.action.label}</button>:<LoadingLink prefetch={false} href={item.action.href} beforeNavigate={navigate}>{item.action.label}<span aria-hidden="true"> →</span></LoadingLink>}
    {item.dismissible && <button type="button" disabled={busy === item.id} onClick={async () => { setBusy(item.id); setFailure(""); try { setFailure(await dismissItem(item.id)); } catch { setFailure("忽略未保存，请重试。"); } finally { setBusy(""); } }}>{busy === item.id ? "保存中…" : "忽略这一天"}</button>}</div>
  </li>)}</ul>;
  const supplements = data ? [...data.pending.filter(item=>item.category!=="ai"&&item.category!=="training"),...data.suggestions] : [];
  const reviews = data?.pending.filter(item=>item.category==="ai") ?? [];
  const training = data?.pending.filter(item=>item.category==="training") ?? [];
  const taskContent = <div className={styles.content}>
    <section className={styles.quick} aria-label="快捷记录"><div>{assistantQuickActions(today).map(action=><LoadingLink prefetch={false} key={action.label} href={action.href} beforeNavigate={navigate}>{action.label}</LoadingLink>)}</div></section>
    {error&&<div role="alert">{error}<button type="button" onClick={retry}>重新读取</button></div>}
    {!data&&loading&&<p className={styles.muted} role="status">正在读取事项…</p>}
    <details className={styles.disclosure}><summary>按需补记</summary>{supplements.length?items(supplements):data&&<p className={styles.muted}>暂无需要补记的事项</p>}</details>
    <details className={styles.disclosure}><summary>AI 确认{reviews.length>0&&<span className={styles.count}>{reviews.length}</span>}</summary>{reviews.length?items(reviews):data&&<p className={styles.muted}>暂无待确认提交</p>}</details>
    <section className={styles.disclosure}>
      <button ref={toolsButton} className={styles.groupToggle} type="button" aria-expanded={tools} aria-controls="assistant-tools" onClick={()=>{setTools(value=>!value);setGuides(false);}}>常用功能<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style={{transform:tools?"rotate(180deg)":undefined}}><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></button>
      {tools&&<nav id="assistant-tools" className={styles.toolsList} aria-label="常用功能">{guides?<><button type="button" onClick={()=>setGuides(false)}>返回常用功能</button>{(Object.keys(recordGuides) as RecordGuideKind[]).map(kind=><button type="button" key={kind} onClick={async()=>{if(await navigate())await replay(kind);}}>重播{recordGuides[kind].label}录入引导</button>)}</>:<>{training.length>0&&items(training)}<LoadingLink href={"/dashboard/training?date="+today} beforeNavigate={navigate}>训练计划</LoadingLink>{assistantTools.map(action=><LoadingLink key={action.label} href={action.href} beforeNavigate={navigate}>{action.label}</LoadingLink>)}<button type="button" onClick={()=>setGuides(true)}>重播操作引导</button></>}</nav>}
    </section>
    {failure&&<p role="alert">{failure}</p>}
  </div>;
  return <dialog ref={dialog} className={styles.surface} data-chat={chatEnabled} data-assistant-surface data-mobile={mobile} data-expanded={expanded} data-closing={closing} aria-labelledby="assistant-title" aria-modal={mobile || undefined}
    onCancel={event => { event.preventDefault(); if(guides)setGuides(false);else if (tools) {setTools(false);toolsButton.current?.focus();} else void requestClose(); }}
    onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) void requestClose(); } }}
    onKeyDown={event => {
      if (event.key === "Escape" && tools) { event.preventDefault(); event.stopPropagation(); if(guides)setGuides(false);else {setTools(false); toolsButton.current?.focus();} return; }
      if (!mobile || event.key !== "Tab") return;
      const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],summary,textarea,input:not([type=file]),select")].filter(node => node.getClientRects().length > 0 && !node.closest("[inert]") && !node.closest("details:not([open]) :not(summary)"));
      const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <header className={styles.heading} {...drag}><span className={styles.dragIndicator} aria-hidden="true"/><div><AssistantIcon/><h2 id="assistant-title">小助手</h2></div>{chatEnabled&&<div className={styles.mobileNavigation}><ChatNavigation tab={chatTab} onTab={setChatTab} pendingCount={data?.pending.length??0}/></div>}<div className={styles.headingActions}>{mobile&&<button type="button" className={styles.handle} aria-label={expanded?"收起小助手到半屏":"展开小助手"} aria-expanded={expanded} onClick={()=>{if(performance.now()>suppress.current)setExpanded(value=>!value);}}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={expanded?"m7 10 5 5 5-5":"m7 14 5-5 5 5"}/></svg></button>}{chatEnabled && <ChatHeaderActions/>}<button ref={closeButton} type="button" aria-label="收起小助手" onClick={() => void requestClose()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></header>
    {chatEnabled ? <AssistantChatView sidebar={taskContent} navigate={navigate} pendingCount={data?.pending.length ?? 0} tab={chatTab} onTab={setChatTab}/> : taskContent}
  </dialog>;
}
