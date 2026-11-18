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
import {TaskGroup} from "./task-group";
import {ChatHistory} from "./chat-history";
import styles from "./surface.module.css";
import { AssistantChatView, ChatHeaderActions, ChatNavigation, type ChatTab } from "./chat-view";
type Controller = { dismiss: () => Promise<boolean>; reopen: () => void };
export function AssistantSurface({ data, error, loading, close, requestClose, retry, dismissItem, controllerReady, chatEnabled = false }: {
  data: AssistantContext | null; error: string; loading: boolean; close: () => void; requestClose: () => Promise<void>; retry: () => void;
  dismissItem: (id: string) => Promise<string>; controllerReady: (value: Controller | null) => void; chatEnabled?: boolean;
}) {
  const mobile = useMobileMode(), dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null), toolsButton = useRef<HTMLButtonElement>(null), pending = useRef<Promise<boolean> | null>(null), ticket = useRef(0);
  const [chatTab,setChatTab]=useState<ChatTab>("chat");
  const [supplementsOpen,setSupplementsOpen]=useState(false),[reviewOpen,setReviewOpen]=useState<boolean|undefined>(undefined),[history,setHistory]=useState(false);
  const historyButton=useRef<HTMLButtonElement>(null);
  const hasReviews=!!data?.pending.some(item=>item.category==="ai");

  useEffect(()=>{const show=()=>setChatTab("chat");window.addEventListener("formward-assistant-preview",show);window.addEventListener("formward-assistant-chat-selected",show);return()=>{window.removeEventListener("formward-assistant-preview",show);window.removeEventListener("formward-assistant-chat-selected",show);};},[]);
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
  const navigate = useCallback(async () => { await requestClose(); const phase = dialog.current?.dataset.surfacePhase; return phase !== "open" && phase !== "opening"; },[requestClose]);
  if (mobile === null) return null;
  const today = data?.localDate ?? localMeasurementDate(new Date());
  const summary=(item:AssistantItem)=>item.review?<><div className={styles.reviewMeta}><span>{item.review.source}</span><time dateTime={item.date}>{item.date.replaceAll("-", ".")} · {item.review.title}</time></div><strong className={styles.reviewValue}>{item.review.value}</strong>{item.review.detail&&<p>{item.review.detail.split(" · ").map((text,index)=><span key={index}>{text}</span>)}</p>}</>:<><div><strong>{item.title}</strong><time dateTime={item.date}>{item.date.replaceAll("-", ".")}</time></div><p>{item.detail}</p></>;
  const items = (rows: AssistantItem[]) => <ul className={styles.items}>{rows.map(item => <li key={item.id} data-assistant-item={item.id}>
    {item.category==="ai"?(item.action.previewId&&chatEnabled?<button className={styles.reviewEntry} type="button" aria-label={item.review?item.review.source+"，"+item.review.title+"，"+item.review.value+"，查看并确认":item.title+"，查看并确认"} onClick={()=>window.dispatchEvent(new CustomEvent("formward-assistant-preview",{detail:{id:item.action.previewId}}))}>{summary(item)}</button>:<LoadingLink className={styles.reviewEntry} prefetch={false} href={item.action.href} beforeNavigate={navigate} aria-label={item.review?item.review.source+"，"+item.review.title+"，"+item.review.value+"，查看并确认":item.title+"，查看并确认"}>{summary(item)}</LoadingLink>):<>{summary(item)}<div className={styles.itemActions}><LoadingLink prefetch={false} href={item.action.href} beforeNavigate={navigate}>{item.action.label}<span aria-hidden="true"> →</span></LoadingLink>
    {item.dismissible && <button type="button" disabled={busy === item.id} onClick={async () => { setBusy(item.id); setFailure(""); try { setFailure(await dismissItem(item.id)); } catch { setFailure("忽略未保存，请重试。"); } finally { setBusy(""); } }}>{busy === item.id ? "保存中…" : "忽略这一天"}</button>}</div></>}
  </li>)}</ul>;
  const supplements = data ? [...data.pending.filter(item=>item.category!=="ai"&&item.category!=="training"),...data.suggestions] : [];
  const reviews = data?.pending.filter(item=>item.category==="ai") ?? [];
  const training = data?.pending.filter(item=>item.category==="training") ?? [];
  const taskContent = <div className={styles.content}>
    <section className={styles.quick} aria-label="快捷记录"><div>{assistantQuickActions(today).map(action=><LoadingLink prefetch={false} key={action.label} href={action.href} beforeNavigate={navigate}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>{mobile?action.label.replace(/^手动/,""):action.label}</span></LoadingLink>)}</div></section>
    {error&&<div role="alert">{error}<button type="button" onClick={retry}>重新读取</button></div>}
    {!data&&loading&&<p className={styles.muted} role="status">正在读取事项…</p>}
    <TaskGroup kind="supplements" title="按需补记" description="查看需要补记的记录" count={data?supplements.length+" 项":"…"} open={supplementsOpen} onToggle={()=>setSupplementsOpen(value=>!value)}>{supplements.length?items(supplements):data&&<p className={styles.muted}>暂无需要补记的事项</p>}</TaskGroup>
    <TaskGroup kind="reviews" title="AI 确认" description="核对待保存的提交" count={data?reviews.length+" 项":"…"} open={reviewOpen??hasReviews} onToggle={()=>setReviewOpen(!(reviewOpen??hasReviews))}>{reviews.length?items(reviews):data&&<p className={styles.muted}>暂无待确认提交</p>}</TaskGroup>
    <TaskGroup kind="tools" title="常用功能" description="使用说明、AI 接入等" count={assistantTools.length+2+" 个功能"} open={tools} onToggle={()=>{setTools(value=>!value);setGuides(false);}}>
      <nav id="assistant-tools" className={styles.toolsList} aria-label="常用功能">{guides?<><button type="button" onClick={()=>setGuides(false)}>返回常用功能</button>{(Object.keys(recordGuides) as RecordGuideKind[]).map(kind=><button type="button" key={kind} onClick={async()=>{if(await navigate())await replay(kind);}}>重播{recordGuides[kind].label}录入引导</button>)}</>:<>{training.length>0&&items(training)}<LoadingLink href={"/dashboard/training?date="+today} beforeNavigate={navigate}>训练计划</LoadingLink>{assistantTools.map(action=><LoadingLink key={action.label} href={action.href} beforeNavigate={navigate}>{action.label}</LoadingLink>)}<button type="button" onClick={()=>setGuides(true)}>重播操作引导</button></>}</nav>
    </TaskGroup>
    {failure&&<p role="alert">{failure}</p>}
  </div>;
  return <dialog ref={dialog} className={styles.surface} data-chat={chatEnabled} data-assistant-surface data-mobile={mobile} data-expanded={expanded} data-closing={closing} aria-labelledby="assistant-title" aria-modal={mobile || undefined}
    onCancel={event => { event.preventDefault(); if(history){setHistory(false);historyButton.current?.focus({preventScroll:true});}else if(guides)setGuides(false);else if (tools) {setTools(false);toolsButton.current?.focus();} else void requestClose(); }}
    onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) void requestClose(); } }}
    onKeyDown={event => {
      if (event.key === "Escape" && tools) { event.preventDefault(); event.stopPropagation(); if(guides)setGuides(false);else {setTools(false); toolsButton.current?.focus();} return; }
      if (!mobile || event.key !== "Tab") return;
      const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],summary,textarea,input:not([type=file]),select")].filter(node => node.getClientRects().length > 0 && !node.closest("[inert]") && !node.closest("details:not([open]) :not(summary)"));
      const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <header className={styles.heading} {...drag}><span className={styles.grabHandle} aria-hidden="true"><span/></span><div className={styles.brand}><AssistantIcon/><h2 id="assistant-title">小助手</h2></div>{chatEnabled&&<button type="button" ref={historyButton} className={styles.historyTrigger} aria-label="历史会话" aria-expanded={history} onClick={()=>setHistory(value=>!value)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 2"/></svg></button>}{chatEnabled&&<div className={styles.mobileNavigation}><ChatNavigation tab={chatTab} onTab={value=>{setHistory(false);setChatTab(value);}} pendingCount={data?.pending.length??0}/></div>}<div className={styles.headingActions}>{!chatEnabled&&mobile&&<button type="button" aria-label={expanded?"收起小助手到半屏":"展开小助手"} onClick={()=>setExpanded(value=>!value)}>⌄</button>}{chatEnabled&&<ChatHeaderActions onNew={()=>{setHistory(false);setChatTab("chat");}}/>}<button ref={closeButton} type="button" aria-label="收起小助手" onClick={() => void requestClose()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></header>
    <div className={styles.mainContent} inert={history}>{chatEnabled ? <AssistantChatView sidebar={taskContent} navigate={navigate} pendingCount={data?.pending.length ?? 0} tab={chatTab} onTab={setChatTab}/> : taskContent}</div>
    {history&&<ChatHistory expanded={expanded} toggleExpanded={()=>setExpanded(value=>!value)} navigate={navigate} close={()=>{setHistory(false);historyButton.current?.focus({preventScroll:true});}}/>}
    </dialog>;

}

