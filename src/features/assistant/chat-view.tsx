"use client";
import { LocalLoading } from "@/components/local-loading";
import { ChatPreviewCard } from "./chat-preview-card";
import { FollowupForm } from "./followup-form";
import { ChatMessageBody } from "./chat-message";
import { Glyph } from "./chat-icon";
import {chatDisplayText} from "./chat-presentation";
/* eslint-disable @next/next/no-img-element -- 会话原图须按账号鉴权，不能进入公开图片优化缓存。 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useId, type ReactNode } from "react";
import { LoadingLink } from "../../components/loading-link";
import { useAssistantChat, useOptionalAssistantChat } from "./chat-client";
import type { ChatMessage } from "./chat-model";
import styles from "./chat.module.css";
function ArrivingMessage({message,eligible,className,children}:{message:ChatMessage;eligible:boolean;className:string;children:ReactNode}){
  const ref=useRef<HTMLElement>(null),{claimArrival}=useAssistantChat();
  const key=message.requestId?message.role+":"+message.requestId:null;
  useLayoutEffect(()=>{const node=ref.current;if(!node||!eligible||!key||!claimArrival(key)||matchMedia("(prefers-reduced-motion:reduce)").matches)return;node.dataset.newMessage="true";},[key,eligible,claimArrival]);
  return <article ref={ref} tabIndex={-1} data-chat-message={message.id} data-role={message.role} className={className}>{children}</article>;
}
export function ChatHeaderActions({onNew}:{onNew?:()=>void}) {
  const chat = useAssistantChat();
  return <button type="button" className={styles.icon} title="新对话" aria-label="新对话" disabled={!chat.enabled || chat.busy || chat.managing || !!chat.uploading || !chat.data} onClick={() => void chat.control("new").then(ok=>{if(ok)onNew?.();})}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m14 5 5 5M4 20l4-1L20 7a2.1 2.1 0 0 0-3-3L5 16z"/></svg></button>;
}
export type ChatTab = "chat" | "tasks";
export function ChatNavigation({tab,onTab,pendingCount}:{tab:ChatTab;onTab:(value:ChatTab)=>void;pendingCount:number}) {
  const chat=useOptionalAssistantChat(),locked=!!chat?.entitlement&&!chat.entitlement.chat;
  return <div className={styles.navigation}><div className={styles.navTabs} role="tablist" aria-label="小助手内容"><button type="button" role="tab" aria-selected={tab === "chat"} onClick={() => onTab("chat")}><span className={styles.tabLabel}>聊天</span>{locked&&<small className={styles.tierBadge}>未开放</small>}</button><button type="button" role="tab" aria-selected={tab === "tasks"} onClick={() => onTab("tasks")}><span className={styles.tabLabel}>待办</span>{pendingCount > 0 && <span className={styles.tabBadge}>{pendingCount}</span>}</button></div><select className={styles.navSelect} aria-label="切换聊天与待办" value={tab} onChange={event=>onTab(event.target.value as ChatTab)}><option value="chat">聊天{locked?" · Plus":""}</option><option value="tasks">待办{pendingCount>0?" · "+pendingCount:""}</option></select></div>;
}
export function AssistantChatView({ sidebar, navigate, tab, page = false, onPreviewBack }: { sidebar: ReactNode; navigate: () => Promise<boolean>; tab: ChatTab; page?: boolean; onPreviewBack?: () => void }) {
  const [pinnedPreview,setPinnedPreview]=useState<string|null>(null), previewBack=useRef<HTMLButtonElement>(null), previewTrigger=useRef<HTMLElement|null>(null);
  const closePreview=()=>{setPinnedPreview(null);onPreviewBack?.();requestAnimationFrame(()=>{const target=previewTrigger.current; if(target?.isConnected)target.focus({preventScroll:true});else feed.current?.focus({preventScroll:true});});};
  useLayoutEffect(()=>{if(pinnedPreview)previewBack.current?.focus({preventScroll:true});},[pinnedPreview]);
  useEffect(()=>{const show=(event:Event)=>{const id=(event as CustomEvent<{id:string}>).detail?.id;if(id){previewTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setPinnedPreview(id);}};window.addEventListener("formward-assistant-preview",show);return()=>window.removeEventListener("formward-assistant-preview",show);},[]);
  const chat = useAssistantChat(), [panel,setPanel] = useState<"models"|"connections"|null>(null), [notice,setNotice] = useState(""), [latest,setLatest] = useState(() => !chat.scrollState().stick);
  const feedContent=useRef<HTMLDivElement>(null),manualScrollUntil=useRef(0);
  const feed = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), photoInput = useRef<HTMLInputElement>(null), modelButton = useRef<HTMLButtonElement>(null), usageButton = useRef<HTMLButtonElement>(null), modelMenu = useRef<HTMLDivElement>(null), panelTitle = useRef<HTMLHeadingElement>(null), moreAnchor = useRef<{ height:number;top:number }|null>(null), restored = useRef<string | null>(null);
  const { scrollState, recordScroll } = chat;
  const composer = useRef<HTMLDivElement>(null), usagePopup=useRef<HTMLDivElement>(null),usageId=useId();
  useLayoutEffect(()=>{const node=composer.current;if(!node)return;const measure=()=>node.parentElement?.style.setProperty("--chat-composer-height",node.getBoundingClientRect().height+"px");measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[]);
  const selected = chat.data?.catalog.find(model => model.id === chat.data?.provider), blocked = !chat.enabled || !chat.data || chat.managing || !selected?.configured || !selected.enabled || chat.data.usage.available <= 0;
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
    const node=input.current;if(!node)return;let frame=0,active=true,last="";
    const measure=()=>{if(!active||!node.isConnected)return;const css=getComputedStyle(node),width=node.getBoundingClientRect().width,key=[node.value,node.placeholder,width,css.font,css.lineHeight,css.padding,css.borderWidth,css.minHeight].join("|");if(key===last||width<=0)return;last=key;
      // Safari的空textarea不会把换行占位文字计入scrollHeight；用同样字体与宽度的值测量。
      const probe=node.cloneNode(false) as HTMLTextAreaElement;probe.removeAttribute("id");probe.removeAttribute("aria-label");probe.removeAttribute("name");probe.setAttribute("aria-hidden","true");probe.inert=true;probe.tabIndex=-1;probe.value=node.value||node.placeholder;
      Object.assign(probe.style,{position:"absolute",left:"0",top:"0",width:width+"px",height:"0",minHeight:"0",maxHeight:"none",visibility:"hidden",pointerEvents:"none",overflow:"hidden"});node.parentElement?.appendChild(probe);const wanted=probe.scrollHeight+parseFloat(css.borderTopWidth)+parseFloat(css.borderBottomWidth);probe.remove();node.style.height=Math.min(Math.max(144,parseFloat(css.fontSize)*4.8),wanted)+"px";
      // 高度封顶后只滚动输入框内部，保持末尾输入可见，不改变面板或页面位置。
      if(document.activeElement===node&&node.value&&node.selectionStart===node.value.length&&node.selectionEnd===node.value.length)node.scrollTop=node.scrollHeight;
    };
    const schedule=()=>{if(!active)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};measure();const observer=new ResizeObserver(schedule);observer.observe(node);void document.fonts.ready.then(()=>{last="";schedule();});
    return()=>{active=false;observer.disconnect();cancelAnimationFrame(frame);};
  }, [chat.draft]);
  useEffect(() => { if (panel && panel !== "models") panelTitle.current?.focus({ preventScroll:true }); }, [panel]);
  useLayoutEffect(() => {
    if (panel !== "models" || !modelMenu.current || !modelButton.current) return;
    const node = modelMenu.current, trigger = modelButton.current;
    node.showPopover();
    const place = () => { const box = trigger.getBoundingClientRect(), viewport = window.visualViewport, top = viewport?.offsetTop ?? 0, height = viewport?.height ?? innerHeight, width = Math.min(300,innerWidth - 32); node.style.maxHeight = Math.max(80,height - 32) + "px"; const measured = node.getBoundingClientRect(); node.style.setProperty("--model-left",Math.max(16,Math.min(box.left,innerWidth - width - 16)) + "px"); node.style.setProperty("--model-top",Math.max(top + 8,box.top - measured.height - 8) + "px"); };
    place(); node.querySelector<HTMLElement>('[aria-checked="true"]:not(:disabled)')?.focus({preventScroll:true}); window.addEventListener("resize",place); window.visualViewport?.addEventListener("resize",place);
    return () => { if (node.matches(":popover-open")) node.hidePopover(); window.removeEventListener("resize",place); window.visualViewport?.removeEventListener("resize",place); };
  }, [panel]);
  useEffect(() => { if (panel !== "models") return; const outside = (event: PointerEvent) => { const node = event.target as Node; if (!modelMenu.current?.contains(node) && !modelButton.current?.contains(node)) setPanel(null); }; document.addEventListener("pointerdown",outside); return () => document.removeEventListener("pointerdown",outside); }, [panel]);
  function closePanel() { setPanel(null); requestAnimationFrame(() => modelButton.current?.focus({ preventScroll:true })); }
  const placeUsage=useCallback(()=>{const node=usagePopup.current,button=usageButton.current;if(!node?.matches(":popover-open")||!button)return;const box=button.getBoundingClientRect(),viewport=window.visualViewport;node.style.setProperty("--usage-left",Math.max(12,Math.min(box.right-node.offsetWidth,innerWidth-node.offsetWidth-12))+"px");node.style.setProperty("--usage-top",Math.max((viewport?.offsetTop??0)+8,box.top-node.offsetHeight-8)+"px");},[]);
  useLayoutEffect(()=>{const node=usagePopup.current,button=usageButton.current;if(!node||!button)return;const observer=new ResizeObserver(placeUsage);observer.observe(node);observer.observe(button);window.addEventListener("resize",placeUsage);window.visualViewport?.addEventListener("resize",placeUsage);window.visualViewport?.addEventListener("scroll",placeUsage);return()=>{observer.disconnect();window.removeEventListener("resize",placeUsage);window.visualViewport?.removeEventListener("resize",placeUsage);window.visualViewport?.removeEventListener("scroll",placeUsage);};},[placeUsage]);
  useLayoutEffect(()=>{if(tab!=="chat"||panel){const node=usagePopup.current;if(node?.matches(":popover-open"))node.hidePopover();}},[tab,panel]);
  function toggleUsage() {const node=usagePopup.current;if(!node)return;if(node.matches(":popover-open"))node.hidePopover();else{node.showPopover();placeUsage();}}
  const resetText=chat.data?"重置时间："+new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(chat.data.usage.resetAt))+"（北京时间）":"正在读取用量…";
  function jump(id: string) { const node = feed.current?.querySelector<HTMLElement>('[data-chat-message="' + id + '"]'); if (node) { recordScroll(scrollState().top,false); node.scrollIntoView({ block:"center",behavior:matchMedia("(prefers-reduced-motion:reduce)").matches?"instant":"smooth" }); node.focus({ preventScroll:true }); } else setNotice("原消息已超出当前显示范围，可以补充日期和对象后继续。"); }
  function cite(message: ChatMessage) { chat.setQuote(message); input.current?.focus({preventScroll:true}); }
  function submit() { recordScroll(scrollState().top,true); void chat.send(); }
  return <div className={styles.workspace} data-tab={tab} data-page={page||undefined} onKeyDown={event => { if(event.key==="Escape"&&pinnedPreview){event.preventDefault();event.stopPropagation();closePreview();return;} if(event.key === "Escape" && usagePopup.current?.matches(":popover-open")){event.preventDefault();event.stopPropagation();usagePopup.current.hidePopover();usageButton.current?.focus({preventScroll:true});return;} if (event.key === "Escape" && panel) { event.preventDefault(); event.stopPropagation(); closePanel(); } }}>
    <aside className={styles.sidebar} aria-label="待办与快捷记录">{sidebar}</aside>
    <section className={styles.conversation} aria-label="AI聊天">
      <div ref={feed} tabIndex={-1} inert={panel === "connections"||!!pinnedPreview} className={styles.feed} role="log" aria-label="聊天消息" aria-live="off" onWheel={()=>{manualScrollUntil.current=performance.now()+800;}} onTouchMove={()=>{manualScrollUntil.current=performance.now()+800;}} onPointerDown={event=>{if(event.clientX>=event.currentTarget.getBoundingClientRect().right-20)manualScrollUntil.current=performance.now()+10000;}} onKeyDownCapture={event=>{if(["ArrowUp","ArrowDown","PageUp","PageDown","Home","End"," "].includes(event.key))manualScrollUntil.current=performance.now()+800;}} onClickCapture={event=>{if((event.target as Element).closest("summary")){recordScroll(event.currentTarget.scrollTop,false);manualScrollUntil.current=performance.now()+800;}}} onScroll={event => { const node = event.currentTarget,near=node.scrollHeight-node.scrollTop-node.clientHeight<=80,stick=near||(performance.now()>manualScrollUntil.current&&scrollState().stick);recordScroll(node.scrollTop,stick);setLatest(!near); }}>
        <div ref={feedContent} className={styles.feedContent} data-empty={!chat.messages.length||undefined}>
        {chat.data?.hasMore && chat.messages.length < 50 && <button className={styles.loadMore} disabled={chat.loading} onClick={() => { if (feed.current) moreAnchor.current = { top:feed.current.scrollTop,height:feed.current.scrollHeight }; void chat.more(); }}>{chat.loading ? "正在读取…" : "查看更早消息"}</button>}
        {chat.messages.length >= 50 && <p className={styles.historyHint}>当前显示最近50条消息</p>}
        {!chat.data&&chat.enabled&&!chat.error&&<div className={styles.historyLoading}><LocalLoading/></div>}
        {chat.data&&!chat.messages.length && <div className={styles.welcome}><h3>今天想聊点什么？</h3><p>可以拍照记饮食、记录体重，或查询你的记录。</p></div>}
        {chat.messages.map(message => <ArrivingMessage key={message.role==="user"&&message.requestId?"user-"+message.requestId:message.id} message={message} eligible={!!message.requestId&&chat.newRequests.has(message.requestId)} className={styles.message + " " + (message.role === "user" ? styles.user : styles.assistant)}>
          <ChatMessageBody message={message} inlinePreviews={chat.data?.capabilities?.inlinePreviews===true} navigate={navigate} jump={jump}
            followup={message.state==="complete"&&message.question?.id===chat.data?.followup?.messageId?chat.data?.followup:null}>
          {message.role==="assistant"&&message.state==="complete"&&chat.data?.followup&&message.question?.id===chat.data.followup.messageId&&<FollowupForm key={chat.data.followup.messageId} task={chat.data.followup} busy={chat.busy||!chat.enabled} submit={value=>chat.send("send",undefined,value)} cancel={()=>void chat.control("clear_followup")}/>}
          </ChatMessageBody>
          {message.role === "assistant" && message.state !== "working" && <div className={styles.actions}>{chat.enabled&&message.state === "complete" && <button onClick={() => cite(message)}><Glyph name="quote"/>引用回复</button>}{message.role === "assistant" && message.text && <button onClick={() => void navigator.clipboard.writeText(message.text).then(() => setNotice("已复制回答"),() => setNotice("复制失败，可以选择文字手动复制。"))}>复制</button>}{message.role === "assistant" && ["stopped","truncated","error"].includes(message.state) && <button disabled={chat.busy || blocked} onClick={() => void chat.send(message.state === "error" ? "retry" : "continue",message.id)}>{message.state === "error" ? "重试这条消息" : "继续回答"}</button>}</div>}
        </ArrivingMessage>)}
        </div>
      </div>

      {pinnedPreview&&<section className={styles.pinnedPreview} aria-label="待确认提交"><header><span>待确认提交</span><button type="button" ref={previewBack} onClick={closePreview}>{page?"返回待办":"返回聊天"}</button></header><ChatPreviewCard id={pinnedPreview} navigate={navigate}/></section>}
      <div ref={composer} className={styles.composerArea} inert={panel === "connections"||!!pinnedPreview}>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {chat.error && <div className={styles.failure} role="alert">{chat.error}<button onClick={() => void chat.refresh()} disabled={chat.loading}>重新读取</button></div>}
        {chat.quote && <div className={styles.quote}><button onClick={() => jump(chat.quote!.id)}><span>引用{chat.quote.role === "user" ? "你的消息" : "回答"}</span><span>{chat.quote.question?chat.quote.question.text+" · ":""}{chatDisplayText(chat.quote,chat.data?.capabilities?.inlinePreviews===true).slice(0,240)}</span></button><button className={styles.icon} aria-label="取消引用" onClick={() => chat.setQuote(null)}><Glyph name="close"/></button></div>}
        {chat.enabled?<div className={styles.composer}>
          <DraftPhotos/>
          <textarea ref={input} rows={1} aria-label="给小助手发消息" value={chat.draft} placeholder="想聊点什么，或记录些什么？" onChange={event => chat.setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && matchMedia("(min-width:701px) and (hover:hover) and (pointer:fine)").matches) { event.preventDefault(); submit(); } }}/>
          <div className={styles.composerTools}><div><input className={styles.fileInput} ref={photoInput} type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="选择聊天照片" onChange={event => { const input = event.currentTarget, files = Array.from(input.files ?? []); if (files.length) void chat.addPhotos(files).finally(() => { input.value = ""; }); }}/><button type="button" className={styles.icon} aria-label="添加照片" disabled={!!chat.uploading || !chat.data} onClick={() => photoInput.current?.click()}><Glyph name="photo"/></button>
            <div className={styles.modelControl}><button ref={modelButton} className={styles.modelButton} aria-haspopup="menu" aria-expanded={panel === "models"} disabled={!chat.data || chat.busy || chat.managing} onClick={() => setPanel(panel === "models" ? null : "models")}>{selected?.label ?? "选择模型"}<Glyph name="chevron"/></button>
            {panel === "models" && <div ref={modelMenu} popover="manual" role="menu" aria-label="选择模型" className={styles.modelMenu} onKeyDown={event => { if (["ArrowDown","ArrowUp","Home","End"].includes(event.key)) { event.preventDefault(); const nodes = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")], index = nodes.indexOf(document.activeElement as HTMLButtonElement); nodes[event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length]?.focus(); } }}>{chat.data?.catalog.map(model => <button type="button" role="menuitemradio" aria-checked={model.id === selected?.id} key={model.id} disabled={!model.configured || !model.enabled || chat.managing} onClick={() => void chat.control("select_model",model.id).then(ok => { if (ok) closePanel(); })}><span><strong>{model.label}</strong><small>{model.model}</small>{model.reason && <small>{model.reason}</small>}</span>{model.id === selected?.id && <Glyph name="check"/>}</button>)}<button type="button" onClick={() => setPanel("connections")}>连接详情<Glyph name="more"/></button></div>}</div>
          </div><div className={styles.composerActions}><button ref={usageButton} type="button" className={styles.usage} aria-label={chat.data?"今日已用"+chat.data.usage.percent:"今日用量，正在读取"} aria-describedby={usageId} disabled={!chat.data} title={resetText} onClick={toggleUsage}>{chat.data?chat.data.usage.percent:"…"}</button>{chat.busy ? <button className={styles.send} aria-label="停止生成" onClick={() => void chat.control("stop")}><Glyph name="stop"/></button> : <button className={styles.send} aria-label="发送消息" disabled={blocked || chat.photos.some(photo=>photo.phase!=="ready"||!photo.id) || !chat.draft.trim() && !chat.photos.length} onClick={submit}><Glyph name="send"/></button>}</div></div>
        </div>:<div className={styles.chatLocked}><strong>{"当前档位未开放聊天"}</strong><p>{chat.entitlement?.mealRecognition?"你仍可拍照录入饮食，或手动记录。":"已有消息和输入保留，可继续手动记录。"}</p>{chat.entitlement?.mealRecognition&&<LoadingLink href="/dashboard/meals" beforeNavigate={navigate}>去饮食页拍照录入</LoadingLink>}</div>}

        {chat.enabled&&chat.data && chat.data.usage.available <= 0 && <p className={styles.notice}>今日可用额度不足；待结算用量也会暂占额度，提醒和手工记录仍可使用。</p>}
      </div>
      {latest&&<button type="button" className={styles.latest} aria-label="回到最新消息" title="回到最新消息" inert={panel === "connections"||!!pinnedPreview} onClick={()=>{const node=feed.current;if(!node)return;manualScrollUntil.current=0;recordScroll(node.scrollHeight,true);node.scrollTo({top:node.scrollHeight,behavior:matchMedia("(prefers-reduced-motion:reduce)").matches?"instant":"smooth"});node.focus({preventScroll:true});}}><Glyph name="down"/></button>}
      <div ref={usagePopup} id={usageId} popover="auto" role="tooltip" className={styles.usageTip}>{resetText}</div>
      {panel === "connections" && <section className={styles.detail} aria-label="站内连接详情"><header><h3 ref={panelTitle} tabIndex={-1}>站内连接</h3><button type="button" className={styles.icon} aria-label="关闭明细" onClick={closePanel}><Glyph name="close"/></button></header>{chat.error&&<p className={styles.failure} role="alert">{chat.error}</p>}{chat.data?.catalog.map(model => <div className={styles.connection} key={model.id}><div><strong>{model.label}</strong><span>{model.model}</span></div><p>{model.reason ?? (model.expiresAt ? "已启用 · " + new Intl.DateTimeFormat("zh-CN",{dateStyle:"medium"}).format(new Date(model.expiresAt)) + "到期" : "首次发送时启用站内授权")}</p><button disabled={chat.busy || chat.managing || !model.configured} onClick={() => void chat.control(model.enabled && model.expiresAt ? "revoke" : "enable",model.id)}>{model.enabled && model.expiresAt ? "撤销授权" : "启用授权"}</button></div>)}<p>四类记录的查询与提交预览；正式保存继续由你确认。</p></section>}
    </section>
  </div>;
}

function DraftPhotos(){
 const chat=useAssistantChat();
 if(!chat.photos.length)return null;
 return <><div className={styles.attachments} aria-label="聊天照片">{chat.photos.map((photo,index)=><div key={photo.key} className={styles.photoAttachment} data-photo-phase={photo.phase}>
  {photo.preview||photo.id?<img src={photo.preview??"/api/meal-images/"+photo.id} alt={"照片 "+(index+1)}/>:<span className={styles.photoPlaceholder}><Glyph name="photo"/></span>}
  {photo.phase!=="ready"&&<div className={styles.photoOverlay}>{photo.phase==="error"?<span>上传失败</span>:<div role="progressbar" aria-label={"照片 "+(index+1)+" "+photo.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={photo.percent}><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16"/><circle cx="20" cy="20" r="16" pathLength="100" strokeDasharray="100" strokeDashoffset={100-photo.percent}/></svg><span>{photo.phase==="complete"||photo.percent===100?"核对中":["queued","read","prepare","sign"].includes(photo.phase)?"0%":photo.percent+"%"}</span></div>}</div>}
  <button type="button" className={styles.removePhoto} aria-label={"移除照片 "+(index+1)} onClick={()=>chat.removePhoto(photo.key)}><Glyph name="close"/></button>
 </div>)}</div>{chat.photos.filter(photo=>photo.phase==="error").map(photo=><div key={photo.key} className={styles.photoFailure}><p role="alert">{photo.error}</p><div><button type="button" onClick={()=>void chat.retryPhoto(photo.key)}>重试</button>{photo.region&&<button type="button" onClick={()=>void chat.retryPhoto(photo.key,"direct",photo.region==="cn"?"global":"cn")}>{photo.region==="cn"?"改用国际通道":"改用国内通道"}</button>}{photo.canRelay&&photo.region==="cn"&&<button type="button" onClick={()=>void chat.retryPhoto(photo.key,"relay")}>换方式上传</button>}<button type="button" onClick={()=>chat.removePhoto(photo.key)}>移除</button></div></div>)}</>;
}
