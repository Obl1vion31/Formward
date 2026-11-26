"use client";
import { LocalLoading } from "@/components/local-loading";
import { ChatPreviewCard } from "./chat-preview-card";
import { FollowupForm } from "./followup-form";
import { ChatMessageBody } from "./chat-message";
import { ChatModelMenu } from "./chat-model-menu";
import { animateGlassMenuFace } from "@/components/glass-menu-face";
import { useComposerScrollBoundary } from "./chat-composer-scroll";
import { Glyph } from "./chat-icon";
import {chatDisplayText,chatTranscript} from "./chat-presentation";
/* eslint-disable @next/next/no-img-element -- 会话原图须按账号鉴权，不能进入公开图片优化缓存。 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useId, type ReactNode } from "react";
import { LoadingLink } from "../../components/loading-link";
import { confirmAction } from "@/components/confirmation-state";
import { useAssistantChat, useOptionalAssistantChat, type ArrivalViewport } from "./chat-client";
import { CHAT_INPUT_LIMIT, CHAT_PHOTOS_PER_BATCH, chatContextLimitNotice, nextChatInputEstimate, type ChatMessage, type ChatPhotoLimit } from "./chat-model";
import glass from "@/components/glass-controls.module.css";
import { useSlidingSelection } from "@/components/sliding-selection";
import styles from "./chat.module.css";
function ArrivingMessage({message,eligible,viewport,className,children}: {
  message:ChatMessage; eligible:boolean; viewport?:ArrivalViewport; className:string; children:ReactNode;
}) {
  const ref = useRef<HTMLElement>(null), {claimArrival} = useAssistantChat();
  const viewportAtSend = useRef(viewport);
  const key = message.requestId ? message.role+":"+message.requestId : null;
  useLayoutEffect(() => {
    const node = ref.current, starting = viewportAtSend.current, visual = window.visualViewport;
    if (!node || !eligible || !key || !claimArrival(key) || matchMedia("(prefers-reduced-motion:reduce)").matches) return;
    if (!starting || !visual) { node.dataset.newMessage="true"; return; }
    const deadline = performance.now()+600;
    let frame = 0, width = visual.width, height = visual.height, top = visual.offsetTop, stable = 0;
    const observe = () => {
      if (performance.now() >= deadline) return;
      const recovered = visual.height-starting.height > 44;
      const still = Math.abs(visual.height-height)<=1 && Math.abs(visual.offsetTop-top)<=1 && Math.abs(visual.width-width)<=1;
      stable = recovered && still ? stable+1 : 0;
      height = visual.height; top = visual.offsetTop; width = visual.width;
      if (stable >= 2) node.dataset.newMessage="true";
      else frame = requestAnimationFrame(observe);
    };
    frame = requestAnimationFrame(observe);
    return () => cancelAnimationFrame(frame);
  },[eligible,key,claimArrival]);
  return <article ref={ref} tabIndex={-1} data-chat-message={message.id} data-role={message.role} className={className}>{children}</article>;
}

function PhotoBatchPicker({limit,disabled,submit}: {
  limit:ChatPhotoLimit; disabled:boolean; submit:(selected:string[])=>Promise<boolean>;
}) {
  const [selected,setSelected] = useState<string[]>([]);
  const checked = selected.filter(id=>limit.imageIds.includes(id));
  if (!limit.imageIds.length) return null;
  return <fieldset className={styles.batch} disabled={disabled}>
    <legend>还有 {limit.imageIds.length} 张照片未处理</legend>
    <p>每批最多 {limit.maxPhotos} 张。还有 {limit.imageIds.length} 张可选。</p>
    <div className={styles.batchPhotos}>{limit.imageIds.map((id,index)=>{
      const chosen = checked.includes(id);
      return <label key={id}>
        <img src={"/api/meal-images/"+id} alt=""/>
        <input type="checkbox" checked={chosen} aria-label={"选择照片 "+(index+1)}
          disabled={!chosen && checked.length>=limit.maxPhotos}
          onChange={event=>setSelected(event.target.checked?[...checked,id]:checked.filter(value=>value!==id))}/>
      </label>;
    })}</div>
    <button type="button" disabled={!checked.length} onClick={()=>void submit(checked).then(ok=>{if(ok)setSelected([]);})}>处理所选照片</button>
  </fieldset>;
}
export function ChatHeaderActions({onNew, mobileGlass = false}:{onNew?:()=>void; mobileGlass?:boolean}) {
  const chat = useAssistantChat();
  return <button type="button" className={styles.icon + (mobileGlass ? " " + glass.mobileButton : "")} title="新对话" aria-label="新对话" disabled={!chat.enabled || chat.busy || chat.managing || !!chat.uploading || !chat.data} onClick={() => void chat.control("new").then(ok=>{if(ok)onNew?.();})}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m14 5 5 5M4 20l4-1L20 7a2.1 2.1 0 0 0-3-3L5 16z"/></svg></button>;
}
export type ChatTab = "chat" | "tasks";
const chatTabs: readonly ChatTab[] = ["chat", "tasks"];

export function ChatNavigation({tab,onTab,pendingCount}:{tab:ChatTab;onTab:(value:ChatTab)=>void;pendingCount:number}) {
  const chat = useOptionalAssistantChat();
  const locked = Boolean(chat?.entitlement && !chat.entitlement.chat&&!chat.data?.photoHandoff);
  const slide = useSlidingSelection(chatTabs.indexOf(tab), index => onTab(chatTabs[index]));
  return <div className={styles.navigation}>
    <div {...slide} className={styles.navTabs + " " + glass.track} role="tablist" aria-label="小助手内容"
      onKeyDown={event => {
        const index = event.key === "ArrowLeft" ? 0 : event.key === "ArrowRight" ? 1 : -1;
        if (index < 0) return;
        event.preventDefault();
        event.currentTarget.querySelector<HTMLElement>(`[data-capsule-choice="${index}"]`)?.focus();
        onTab(chatTabs[index]);
      }}>
      <span className={glass.selection} data-capsule-indicator aria-hidden="true"/>
      <button type="button" role="tab" data-capsule-choice={0} aria-selected={tab === "chat"} onClick={() => onTab("chat")}>
        <span className={styles.tabLabel}>聊天</span>{locked && <small className={styles.tierBadge}>未开放</small>}
      </button>
      <button type="button" role="tab" data-capsule-choice={1} aria-selected={tab === "tasks"} onClick={() => onTab("tasks")}>
        <span className={styles.tabLabel}>待办</span>{pendingCount > 0 && <span className={styles.tabBadge}>{pendingCount}</span>}
      </button>
    </div>
    <select className={styles.navSelect} aria-label="切换聊天与待办" value={tab} onChange={event => onTab(event.target.value as ChatTab)}>
      <option value="chat">聊天{locked ? " · Plus" : ""}</option>
      <option value="tasks">待办{pendingCount > 0 ? " · " + pendingCount : ""}</option>
    </select>
  </div>;
}

export function AssistantChatView({ sidebar, navigate, tab, page = false, onPreviewBack }: { sidebar: ReactNode; navigate: () => Promise<boolean>; tab: ChatTab; page?: boolean; onPreviewBack?: () => void }) {
  const [pinnedPreview,setPinnedPreview]=useState<string|null>(null), previewBack=useRef<HTMLButtonElement>(null), previewTrigger=useRef<HTMLElement|null>(null);
  const closePreview=()=>{setPinnedPreview(null);onPreviewBack?.();requestAnimationFrame(()=>{const target=previewTrigger.current; if(target?.isConnected)target.focus({preventScroll:true});else feed.current?.focus({preventScroll:true});});};
  useLayoutEffect(()=>{if(pinnedPreview)previewBack.current?.focus({preventScroll:true});},[pinnedPreview]);
  useEffect(()=>{const show=(event:Event)=>{const id=(event as CustomEvent<{id:string}>).detail?.id;if(id){previewTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setPinnedPreview(id);}};window.addEventListener("formward-assistant-preview",show);return()=>window.removeEventListener("formward-assistant-preview",show);},[]);
  const chat = useAssistantChat(), [panel,setPanel] = useState<"models"|"connections"|null>(null), [notice,setNotice] = useState(""), [latest,setLatest] = useState(() => !chat.scrollState().stick);
  const feedContent=useRef<HTMLDivElement>(null),manualScrollUntil=useRef(0);
  const feed = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), photoInput = useRef<HTMLInputElement>(null), modelButton = useRef<HTMLButtonElement>(null), panelTitle = useRef<HTMLHeadingElement>(null), moreAnchor = useRef<{ height:number;top:number }|null>(null), restored = useRef<string | null>(null);
  const { scrollState, recordScroll } = chat;
  const openHeight = useRef(0);
  const draftMeasurement = useRef<{ field: HTMLTextAreaElement; value: string; scrollEnd: number } | null>(null);
  const transcript = chatTranscript(chat.messages);
  const task = chat.data?.followup, pendingQuote = chat.data?.pendingContextQuote;
  const meal=chat.data?.photoHandoff;
  const [manualError,setManualError]=useState<{task:string;message:string}|null>(null);
  const mealAnchor = meal && (transcript.visible.findLast(row=>row.mealTask&&row.role==="assistant") ??
    transcript.visible.find(row=>row.role==="user"&&row.imageIds.length>0));
  const ordinaryChat=chat.enabled&&!meal?.restricted;
  const showComposer=ordinaryChat&&!meal?.followup;
  const baseEstimate = chat.data?.contextBaseEstimate;
  const draftForEstimate = chat.draft + (chat.quote ? (chat.quote.question?.text ?? "") + chat.quote.text : "");
  const nearContextLimit = chat.enabled && !chat.busy && baseEstimate !== undefined &&
    nextChatInputEstimate(baseEstimate,draftForEstimate,chat.photos.length) >= CHAT_INPUT_LIMIT;
  const taskAnchor = task && task.assistantMessageId && transcript.anchors.has(task.assistantMessageId)
    ? task.assistantMessageId : task ? transcript.visible.findLast(row=>row.role==="assistant"&&row.state==="complete"&&row.question?.id===task.messageId)?.id : undefined;
  const composer = useRef<HTMLDivElement>(null), modelMenuId = useId();
  useComposerScrollBoundary(composer, page);
  const modelMenuOpen = panel === "models" && tab === "chat" && chat.enabled && !pinnedPreview;
  const quotaNotice = chat.enabled && chat.data && chat.data.usage.available <= 0
    ? <p className={styles.notice}>今日可用额度不足；待结算用量也会暂占额度，提醒和手工记录仍可使用。</p> : null;
  useLayoutEffect(()=>{const node=composer.current;if(!node)return;const measure=()=>node.parentElement?.style.setProperty("--chat-composer-height",node.getBoundingClientRect().height+"px");measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[]);
  const composerNotices = <>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {chat.error && <div className={styles.failure} role="alert">{chat.error}<button onClick={() => void chat.refresh()} disabled={chat.refreshing}>{chat.refreshing ? "正在重新读取…" : "重新读取对话"}</button></div>}
    {page && quotaNotice}
    {pendingQuote && !chat.busy && <div className={styles.quote}>
      <div className={styles.contextQuoteSummary}>
        <span>引用上一问</span><span>{pendingQuote.text ?? "原消息已不可用，请移除引用后发送。"}</span>
      </div>
      <button type="button" className={styles.icon} aria-label="取消引用" disabled={chat.managing}
        onClick={() => void chat.control("clear_context_quote", undefined, chat.data?.conversationId)}><Glyph name="close"/></button>
    </div>}
    {chat.quote && !pendingQuote && <div className={styles.quote}><button onClick={() => jump(chat.quote!.id)}><span>引用{chat.quote.role === "user" ? "你的消息" : "回答"}</span><span>{chat.quote.question?chat.quote.question.text+" · ":""}{chatDisplayText(chat.quote,chat.data?.capabilities?.inlinePreviews===true).slice(0,240)}</span></button><button className={styles.icon} aria-label="取消引用" onClick={() => chat.setQuote(null)}><Glyph name="close"/></button></div>}
    {nearContextLimit && <div className={styles.contextWarning} data-chat-context-warning>
      <p role="status">这段对话接近处理上限</p>
      <button type="button" disabled={chat.managing || !!chat.uploading}
        onClick={()=>void chat.control("new",undefined,chat.data?.conversationId)}>
        <Glyph name="plus"/>新建对话
      </button>
    </div>}
  </>;
  const draftPhotos = chat.photos.length > 0 && <div className={styles.composerMedia}><DraftPhotos/></div>;
  const selected = chat.data?.catalog.find(model => model.id === chat.data?.provider);
  const modelBlocked=!chat.data||chat.managing||!selected?.configured||!selected.enabled||chat.data.usage.available<=0&&(!meal||!chat.data.usage.recognition);
  const blocked = !showComposer||modelBlocked;
  useLayoutEffect(() => { const node = feed.current; if (!node || tab !== "chat") return;
    const conversationId = chat.data?.conversationId;
    if (!conversationId) return;
    if (restored.current !== conversationId) moreAnchor.current = null;
    if (moreAnchor.current) { node.scrollTop = moreAnchor.current.top + node.scrollHeight - moreAnchor.current.height; moreAnchor.current = null; }
    else if (scrollState().stick) node.scrollTop = node.scrollHeight; else if (restored.current !== conversationId) node.scrollTop = scrollState().top;
    restored.current = conversationId; recordScroll(node.scrollTop,scrollState().stick);
  }, [chat.data?.conversationId, chat.messages, tab, scrollState, recordScroll]);
  useLayoutEffect(() => { const node = feed.current; if (!node) return; const observer = new ResizeObserver(() => { if (scrollState().stick && !moreAnchor.current) node.scrollTop = node.scrollHeight; setLatest(node.scrollHeight-node.scrollTop-node.clientHeight>80); }); observer.observe(feedContent.current??node); observer.observe(node); return () => observer.disconnect(); }, [scrollState]);
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    let frame = 0, active = true, last = "";
    const measure = () => {
      if (!active || !node.isConnected) return;
      const css = getComputedStyle(node), width = node.getBoundingClientRect().width, value = node.value;
      const key = [value, node.placeholder, width, css.font, css.lineHeight, css.padding, css.borderWidth, css.minHeight, css.maxHeight].join("|");
      if (key === last || width <= 0) return;
      last = key;

      const scrollTop = node.scrollTop;
      const previous = draftMeasurement.current?.field === node ? draftMeasurement.current : null;
      const valueChanged = previous?.value !== value;
      const caretAtEnd = document.activeElement === node && node.selectionStart === value.length && node.selectionEnd === value.length;
      const followEnd = caretAtEnd && (valueChanged || (previous !== null && scrollTop >= previous.scrollEnd - 1));

      // Safari 的空输入框不计换行占位文字，用同字体和宽度测量。
      const probe = node.cloneNode(false) as HTMLTextAreaElement;
      for (const attribute of ["id", "aria-label", "name"]) probe.removeAttribute(attribute);
      probe.setAttribute("aria-hidden", "true");
      probe.inert = true;
      probe.tabIndex = -1;
      probe.value = value || node.placeholder;
      Object.assign(probe.style, {
        position: "absolute", left: "0", top: "0", width: width + "px", height: "0", minHeight: "0",
        maxHeight: "none", visibility: "hidden", pointerEvents: "none", overflow: "hidden",
      });
      node.parentElement?.appendChild(probe);
      const wanted = probe.scrollHeight + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
      probe.remove();
      const height = Math.min(Math.max(144, parseFloat(css.fontSize) * 4.8), wanted) + "px";
      if (node.style.height !== height) node.style.height = height;

      const scrollEnd = Math.max(0, node.scrollHeight - node.clientHeight);
      draftMeasurement.current = { field: node, value, scrollEnd };
      // 光标可能还在末尾。单纯重测时，以用户实际浏览的位置为准。
      const nextScrollTop = followEnd ? scrollEnd : valueChanged ? node.scrollTop : Math.min(scrollTop, scrollEnd);
      if (Math.abs(node.scrollTop - nextScrollTop) > 1) node.scrollTop = nextScrollTop;
    };
    const schedule=()=>{if(!active)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};measure();const observer=new ResizeObserver(schedule);observer.observe(node);void document.fonts.ready.then(()=>{last="";schedule();});
    return()=>{active=false;observer.disconnect();cancelAnimationFrame(frame);};
  }, [chat.draft]);
  useEffect(() => { if (panel && panel !== "models") panelTitle.current?.focus({ preventScroll:true }); }, [panel]);
  const modelMenu = useRef<HTMLDivElement>(null);
  const registerModelMenu = useCallback((node: HTMLDivElement | null) => { modelMenu.current = node; }, []);
  const dismissModels = useCallback(() => setPanel(null), []);
  const closeModelFace = useCallback((done: () => void) => {
    const menu = modelMenu.current;
    const anchor = modelButton.current;
    if (!menu || !anchor || !menu.matches(":popover-open")) {
      done();
    } else if (menu.dataset.glassPhase !== "closing") {
      void animateGlassMenuFace(menu, anchor, "close").then(finished => { if (finished) done(); });
    }
  }, []);
  const dismissModelFace = useCallback(() => closeModelFace(dismissModels), [closeModelFace, dismissModels]);
  const closePanel = useCallback(() => {
    const previousFocus = document.activeElement;
    closeModelFace(() => {
      dismissModels();
      requestAnimationFrame(() => {
        if (document.activeElement === previousFocus || document.activeElement === document.body) {
          modelButton.current?.focus({ preventScroll: true });
        }
      });
    });
  }, [closeModelFace, dismissModels]);
  function toggleModelMenu() {
    const menu = modelMenu.current;
    const anchor = modelButton.current;
    if (!modelMenuOpen) setPanel("models");
    else if (menu?.dataset.glassPhase === "closing" && anchor) void animateGlassMenuFace(menu, anchor, "open");
    else dismissModelFace();
  }
  function jump(id: string) { const node = feed.current?.querySelector<HTMLElement>('[data-chat-message="' + id + '"]'); if (node) { recordScroll(scrollState().top,false); node.scrollIntoView({ block:"center",behavior:matchMedia("(prefers-reduced-motion:reduce)").matches?"instant":"smooth" }); node.focus({ preventScroll:true }); } else setNotice("原消息已超出当前显示范围，可以补充日期和对象后继续。"); }
  function cite(message: ChatMessage) { chat.setQuote(message); input.current?.focus({preventScroll:true}); }
  async function copy(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText("AI生成 · Formward\n\n" + message.text);
      setNotice("已复制回答");
    } catch {
      setNotice("复制失败，可以选择文字手动复制。");
    }
  }
  function submit() {
    if (blocked || pendingQuote?.text === null || chat.busy || chat.photos.some(photo=>photo.phase!=="ready"||!photo.id) || !chat.draft.trim()&&!chat.photos.length) return;
    const visual = window.visualViewport;
    const mobile = page || matchMedia("(max-width:700px), (hover:none) and (pointer:coarse)").matches;
    const editing = document.activeElement === input.current;
    const viewport = mobile && editing && visual && Math.max(innerHeight,openHeight.current)-visual.height>54
      ? {height:visual.height,offsetTop:visual.offsetTop} : undefined;
    if (mobile && editing) input.current?.blur();
    recordScroll(scrollState().top,true);
    void chat.send("send",undefined,undefined,{viewport});
  }
  const sendClass = styles.send + (page ? " " + glass.mobileButton + " " + glass.mobilePrimary : "");
  useEffect(() => {
    const dismiss = (event: Event) => {
      if (event.defaultPrevented) return;
      if (pinnedPreview) { event.preventDefault(); closePreview(); }
      else if (panel) { event.preventDefault(); closePanel(); }
    };
    window.addEventListener("formward-native-dismiss", dismiss);
    return () => window.removeEventListener("formward-native-dismiss", dismiss);
  });
  const mealReturn = meal && !meal.saved && <div className={styles.mealReturn} data-meal-task-actions>
    <LoadingLink returnScope="assistant" href={"/dashboard/meals?date="+meal.date+"&entry=1&manualTask="+meal.taskId} beforeNavigate={async()=>{
      if (!meal.cancelled) {
        if (!await confirmAction({title:"改用手填？",message:"结束本次识别，带回发给助手前的原草稿。",confirmLabel:"返回手填"})) return false;
        setManualError(null);
        try {
          const response=await fetch("/api/assistant-meal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"manual",taskId:meal.taskId})});
          if (!response.ok) throw Error((await response.json()).error??"暂时无法恢复草稿。");
          window.dispatchEvent(new Event("formward-assistant-updated"));
        } catch (error) {
          setManualError({task:meal.taskId,message:error instanceof TypeError?"连接未完成，请再试一次。":error instanceof Error?error.message:"暂时无法恢复草稿，请重试。"});
          return false;
        }
      }
      return navigate();
    }}>{meal.cancelled?"返回原草稿":"改用手填"}</LoadingLink>
    {!showComposer&&chat.canStop&&<button type="button" disabled={chat.stopping} onClick={chat.stop}>停止识别</button>}
    {manualError?.task===meal.taskId&&<span role="alert">{manualError.message}</span>}
  </div>;
  return <div className={styles.workspace} data-tab={tab} data-page={page||undefined} onKeyDown={event => { if(event.key==="Escape"&&pinnedPreview){event.preventDefault();event.stopPropagation();closePreview();return;} if (event.key === "Escape" && panel) { event.preventDefault(); event.stopPropagation(); closePanel(); } }}>
    <aside className={styles.sidebar} aria-label="待办与快捷记录" inert={page && tab !== "tasks"}>{sidebar}</aside>
    <section className={styles.conversation} aria-label="AI聊天" inert={page && tab !== "chat"}>
      <div ref={feed} tabIndex={-1} inert={panel === "connections"||!!pinnedPreview} className={styles.feed} role="log" aria-label="聊天消息" aria-live="off" onWheel={()=>{manualScrollUntil.current=performance.now()+800;}} onTouchMove={()=>{manualScrollUntil.current=performance.now()+800;}} onPointerDown={event=>{if(event.clientX>=event.currentTarget.getBoundingClientRect().right-20)manualScrollUntil.current=performance.now()+10000;}} onKeyDownCapture={event=>{if(["ArrowUp","ArrowDown","PageUp","PageDown","Home","End"," "].includes(event.key))manualScrollUntil.current=performance.now()+800;}} onClickCapture={event=>{if((event.target as Element).closest("summary")){recordScroll(event.currentTarget.scrollTop,false);manualScrollUntil.current=performance.now()+800;}}} onScroll={event => { const node = event.currentTarget,near=node.scrollHeight-node.scrollTop-node.clientHeight<=80,stick=near||(performance.now()>manualScrollUntil.current&&scrollState().stick);recordScroll(node.scrollTop,stick);setLatest(!near); }}>
        <div ref={feedContent} className={styles.feedContent} data-empty={!chat.messages.length||undefined}>
        {chat.data?.hasMore && chat.messages.length < 50 && <button className={styles.loadMore} disabled={chat.loading} onClick={() => { if (feed.current) moreAnchor.current = { top:feed.current.scrollTop,height:feed.current.scrollHeight }; void chat.more(); }}>{chat.loading ? "正在读取…" : "查看更早消息"}</button>}
        {chat.messages.length >= 50 && <p className={styles.historyHint}>当前显示最近50条消息</p>}
        {!chat.data&&chat.enabled&&!chat.error&&<div className={styles.historyLoading}><LocalLoading/></div>}
        {meal&&<p className={styles.mealContext} data-meal-handoff-context>{meal.date} · {meal.mealType} · 饮食拍照</p>}
        {ordinaryChat&&chat.data&&!chat.messages.length && <div className={styles.welcome}><h3>今天想聊点什么？</h3><div className={styles.examples}>{["查看昨天的饮食","记录今天的晨重"].map(example=>
          <button type="button" key={example} onClick={()=>{chat.setDraft(example);input.current?.focus();}}>{example}</button>)}</div></div>}
        {!mealAnchor&&mealReturn}
        {transcript.visible.map(message => {
          const requestId = message.requestId, local = requestId ? chat.outgoing.get(requestId) : undefined;
          const followup = message.id===taskAnchor && message.state==="complete" ? task : null;
          const timing = chat.data?.runTiming?.messageId===message.id ? chat.data.runTiming : undefined;
          const continuation = transcript.continuations.has(message.id);
          const canCite = showComposer && message.state === "complete";
          const contextInterrupted = message.state === "error" && message.contextLimited && !message.photoLimit;
          const failed = ["stopped","truncated","error"].includes(message.state);
          const photoResume = failed && !contextInterrupted ? message.photoProgress : undefined;
          const remainingPhotos = photoResume ? photoResume.total - photoResume.read : 0;
          const canRetry = failed && !message.photoLimit && !message.contextLimited && !photoResume && (!message.mealTask||!!meal&&!meal.cancelled&&!meal.saved);
          const canContinue = message.state !== "error" && !!message.text.trim();
          const actions = !contextInterrupted && message.role === "assistant" && message.state !== "working" && (canCite || message.text || canRetry)
            ? <div className={styles.actions}>
                {canCite && <button type="button" className={styles.messageAction} aria-label="引用回复" title="引用回复" onClick={() => cite(message)}>
                  <Glyph name="quote"/><span>引用回复</span>
                </button>}
                {message.text && <button type="button" className={styles.messageAction} aria-label="复制" title="复制" onClick={() => void copy(message)}>
                  <Glyph name="copy"/><span>复制</span>
                </button>}
                {canRetry && <button type="button" disabled={chat.busy || (message.mealTask?modelBlocked:blocked)} onClick={() => void chat.send(canContinue&&!message.mealTask ? "continue" : "retry",message.id)}>
                  {canContinue ? "继续回答" : "重试这条消息"}
                </button>}
              </div> : undefined;
          return <ArrivingMessage key={message.role==="user"&&requestId?"user-"+requestId:message.id}
            message={message} eligible={message.role==="user"&&!!requestId&&chat.newRequests.has(requestId)} viewport={local?.viewport}
            className={`${styles.message} ${message.role === "user" ? styles.user : styles.assistant}${continuation ? " " + styles.continuation : ""}`}>
            <ChatMessageBody message={message} inlinePreviews={message.mealTask===true||chat.data?.capabilities?.inlinePreviews===true} navigate={navigate} jump={jump}
              followup={followup} timing={timing} answers={transcript.answers.get(message.id)} previews={local}
              continuation={continuation} actions={actions} mealActions={message.id===mealAnchor?.id?mealReturn:undefined}
              onPhotoHandoff={id=>{if(requestId) chat.releaseSentPreview(requestId,id);}}
              sendStatus={local?.phase==="sending" ? <p className={styles.sendPending} role="status">发送中</p> :
                local?.phase==="error" && requestId ? <div className={styles.sendError}>
                  <p role="alert">{local.error}</p><button type="button" onClick={()=>void chat.retryOutgoing(requestId)}>重试发送</button>
                  <button type="button" onClick={()=>void chat.restoreOutgoing(requestId)}>恢复草稿</button>
                </div> : undefined}
              contextActions={contextInterrupted ? <div className={styles.contextRecovery} data-chat-context-recovery>
                <p role="alert">{message.references.some(ref=>ref.kind==="preview")
                  ? "补充说明未完成。已有记录状态见上方卡片。" : chatContextLimitNotice}</p>
                <div>
                  <button type="button" disabled={!chat.enabled || chat.busy || chat.managing || !!chat.uploading || !chat.data}
                    onClick={() => void chat.control("new", undefined, chat.data?.conversationId)}>新建对话</button>
                  <button type="button" disabled={!chat.enabled || chat.busy || chat.managing || !!chat.uploading || !chat.data}
                    onClick={() => void chat.control("resume_in_new_conversation", undefined, chat.data?.conversationId, message.id)}>新会话继续回答</button>
                </div>
              </div> : undefined}
              photoActions={message.photoLimit ? <PhotoBatchPicker limit={message.photoLimit} disabled={chat.busy||blocked}
                submit={imageSubset=>chat.send("retry",message.id,undefined,{imageSubset})}/> : photoResume ? <div className={styles.photoResume}>
                  <p role="status">{remainingPhotos ? "读取中断" : "汇总中断"} · 已读取 {photoResume.read} / {photoResume.total} 张</p>
                  <button type="button" disabled={chat.busy || blocked} onClick={() => void chat.send("continue",message.id)}>
                    {remainingPhotos ? `继续读取剩余 ${remainingPhotos} 张` : "重试汇总"}
                  </button>
                </div> : undefined}>
              {followup && <FollowupForm key={followup.messageId} task={followup} busy={chat.busy||(meal?.followup?modelBlocked:blocked)}
                submit={value=>chat.send("send",undefined,value)}/>}
            </ChatMessageBody>
          </ArrivingMessage>;
        })}
        </div>
      </div>

      {pinnedPreview&&<section className={styles.pinnedPreview} aria-label="待确认提交"><header><span>待确认提交</span><button type="button" ref={previewBack} onClick={closePreview}>{page?"返回待办":"返回聊天"}</button></header><ChatPreviewCard id={pinnedPreview} navigate={navigate} mealActions={mealAnchor?.references.some(ref=>ref.operationId===pinnedPreview)?mealReturn:undefined}/></section>}
      <div ref={composer} className={styles.composerArea} inert={panel === "connections"||!!pinnedPreview}>
        {(!page || !showComposer) && <div className={styles.composerExtras} data-chat-composer-notices>{composerNotices}</div>}
        {showComposer?<div className={styles.composer} data-chat-composer-frame>
          {page ? <div className={styles.composerExtras} data-chat-composer-extras>
            {composerNotices}
            {draftPhotos}
          </div> : draftPhotos}
          <div className={styles.composerRow}>
            <input className={styles.fileInput} ref={photoInput} type="file" multiple accept="image/jpeg,image/png,image/webp"
              aria-label="选择聊天照片" tabIndex={-1} onChange={event => {
                const picker = event.currentTarget, files = Array.from(picker.files ?? []);
                if (files.length) void chat.addPhotos(files).finally(() => { picker.value = ""; });
              }}/>
            <button type="button" className={styles.icon} data-composer-plain aria-label="添加照片"
              disabled={!!chat.uploading || !chat.data} onClick={() => photoInput.current?.click()}><Glyph name="plus"/></button>
            <textarea ref={input} rows={1} aria-label="给小助手发消息" value={chat.draft}
              placeholder="想聊点什么？" onChange={event => chat.setDraft(event.target.value)}
              onFocus={() => { openHeight.current = Math.max(innerHeight,window.visualViewport?.height ?? 0); }}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing
                    && matchMedia("(min-width:701px) and (hover:hover) and (pointer:fine)").matches) {
                  event.preventDefault();
                  submit();
                }
              }}/>
            <button type="button" ref={modelButton} className={styles.modelButton} data-composer-plain
              aria-label={selected?.label ?? "选择模型"} aria-haspopup="dialog" aria-expanded={modelMenuOpen}
              aria-controls={modelMenuOpen ? modelMenuId : undefined}
              onClick={toggleModelMenu}>
              <span>{selected?.id === "mimo" ? "MiMo" : selected?.label ?? "模型"}</span><Glyph name="chevron"/>
            </button>
            {chat.canStop
              ? <button type="button" className={sendClass} aria-label={chat.stopping ? "正在停止生成" : "停止生成"}
                  disabled={chat.stopping || chat.managing} onClick={chat.stop}><Glyph name="stop"/></button>
              : <button type="button" className={sendClass} aria-label="发送消息"
                  disabled={chat.busy || blocked || pendingQuote?.text === null || chat.photos.some(photo => photo.phase !== "ready" || !photo.id) || !chat.draft.trim() && !chat.photos.length}
                  onMouseDown={event => {
                    // 保持焦点到点击触发。取消触摸的 pointerdown 会让 WebKit 不发出 click。
                    if (page && document.activeElement === input.current) event.preventDefault();
                  }} onClick={submit}><Glyph name="send"/></button>}
          </div>
        </div>:!meal&&<div className={styles.chatLocked}><strong>{"当前档位未开放聊天"}</strong><p>{chat.entitlement?.mealRecognition?"你仍可拍照录入饮食，或手动记录。":"已有消息和输入保留，可继续手动记录。"}</p>{chat.entitlement?.mealRecognition&&<LoadingLink href="/dashboard/meals" beforeNavigate={navigate}>去饮食页拍照录入</LoadingLink>}</div>}

        {page ? <div className={styles.composerBottomGap} data-chat-composer-bottom-gap aria-hidden="true"/> : quotaNotice}
      </div>
      {latest&&<button type="button" className={styles.latest} aria-label="回到最新消息" title="回到最新消息" inert={panel === "connections"||!!pinnedPreview} onClick={()=>{const node=feed.current;if(!node)return;manualScrollUntil.current=0;recordScroll(node.scrollHeight,true);node.scrollTo({top:node.scrollHeight,behavior:matchMedia("(prefers-reduced-motion:reduce)").matches?"instant":"smooth"});node.focus({preventScroll:true});}}><Glyph name="down"/></button>}
      {modelMenuOpen && <ChatModelMenu id={modelMenuId} anchor={modelButton} registerMenu={registerModelMenu} selected={selected?.id}
        dismiss={dismissModels} outside={dismissModelFace} close={closePanel} connect={() => closeModelFace(() => setPanel("connections"))}/>}
      {panel === "connections" && <section className={styles.detail} aria-label="站内连接详情"><header><h3 ref={panelTitle} tabIndex={-1}>站内连接</h3><button type="button" className={styles.icon} aria-label="关闭明细" onClick={closePanel}><Glyph name="close"/></button></header>{chat.error&&<p className={styles.failure} role="alert">{chat.error}</p>}{chat.data?.catalog.map(model => <div className={styles.connection} key={model.id}><div><strong>{model.label}</strong><span>{model.model}</span></div><p>{model.reason ?? (model.expiresAt ? "已启用 · " + new Intl.DateTimeFormat("zh-CN",{dateStyle:"medium"}).format(new Date(model.expiresAt)) + "到期" : "首次发送时启用站内授权")}</p><button disabled={chat.busy || chat.managing || !model.configured} onClick={() => void chat.control(model.enabled && model.expiresAt ? "revoke" : "enable",model.id)}>{model.enabled && model.expiresAt ? "撤销授权" : "启用授权"}</button></div>)}<p>四类记录的查询与提交预览；正式保存继续由你确认。</p></section>}
    </section>
  </div>;
}

function DraftPhotos(){
 const chat=useAssistantChat();
 if(!chat.photos.length)return null;
 return <><div className={styles.attachments} data-chat-composer-photos aria-label="聊天照片">{chat.photos.map((photo,index)=><div key={photo.key} className={styles.photoAttachment} data-photo-phase={photo.phase}>
  {photo.preview||photo.id?<img src={photo.preview??"/api/meal-images/"+photo.id} alt={"照片 "+(index+1)}/>:<span className={styles.photoPlaceholder}><Glyph name="photo"/></span>}
  {photo.phase!=="ready"&&<div className={styles.photoOverlay}>{photo.phase==="error"?<span>上传失败</span>:<div role="progressbar" aria-label={"照片 "+(index+1)+" "+photo.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={photo.percent}><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16"/><circle cx="20" cy="20" r="16" pathLength="100" strokeDasharray="100" strokeDashoffset={100-photo.percent}/></svg><span>{photo.phase==="complete"||photo.percent===100?"核对中":["queued","read","prepare","sign"].includes(photo.phase)?"0%":photo.percent+"%"}</span></div>}</div>}
  <button type="button" className={styles.removePhoto} aria-label={"移除照片 "+(index+1)} onClick={()=>chat.removePhoto(photo.key)}><Glyph name="close"/></button>
 </div>)}</div>
 {chat.photos.length > CHAT_PHOTOS_PER_BATCH && <p className={styles.photoBatchHint} role="status">已选 {chat.photos.length} 张，发送后分批读取</p>}
 {chat.photos.filter(photo=>photo.phase==="error").map(photo=><div key={photo.key} className={styles.photoFailure}><p role="alert">{photo.error}</p><div><button type="button" onClick={()=>void chat.retryPhoto(photo.key)}>重试</button>{photo.region&&<button type="button" onClick={()=>void chat.retryPhoto(photo.key,"direct",photo.region==="cn"?"global":"cn")}>{photo.region==="cn"?"改用国际通道":"改用国内通道"}</button>}{photo.canRelay&&photo.region==="cn"&&<button type="button" onClick={()=>void chat.retryPhoto(photo.key,"relay")}>换方式上传</button>}<button type="button" onClick={()=>chat.removePhoto(photo.key)}>移除</button></div></div>)}</>;
}
