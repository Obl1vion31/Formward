"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAssistantChat } from "./chat-client";
import { ChatMessageBody } from "./chat-message";
import type { ChatSnapshot } from "./chat-model";
import styles from "./surface.module.css";
import chatStyles from "./chat.module.css";

type Cursor = { at: string; id: string };
type ConversationList = { items: { id: string; title: string; updatedAt: string; active: boolean }[]; next: Cursor | null };
type Read = { kind: "list"; cursor?: Cursor } | { kind: "detail"; id: string; before?: number };
type Failure = { request: Read; message: string };
const shortDate = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" });

export function ChatHistory({ conversationId, onInspect, back, onContinue, navigate, page = false }: {
  conversationId: string | null;
  onInspect: (id: string) => void;
  back: () => void;
  onContinue: () => void;
  navigate: () => Promise<boolean>;
  page?: boolean;
}) {
  const chat = useAssistantChat();
  const [list, setList] = useState<ConversationList | null>(null);
  const [snapshot, setSnapshot] = useState<ChatSnapshot | null>(null);
  const [pending, setPending] = useState<Read | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [notice, setNotice] = useState("");
  const [selecting, setSelecting] = useState(false);
  const request = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const listLoaded = useRef(false);
  const returnTo = useRef<{ id: string; top: number } | null>(null);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const view = snapshot?.conversationId === conversationId ? snapshot : null;
  const row = list?.items.find(item => item.id === conversationId);
  const matches = (read: Read) => conversationId ? read.kind === "detail" && read.id === conversationId : read.kind === "list";
  const busy = pending && matches(pending);
  const failure = error && matches(error.request) ? error : null;

  const readHistory = useCallback(async (action: Read) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPending(action);
    setError(null);
    setNotice("");
    const params = new URLSearchParams();
    if (action.kind === "list") {
      params.set("view", "history");
      if (action.cursor) params.set("cursor", JSON.stringify(action.cursor));
    } else {
      params.set("conversationId", action.id);
      if (action.before != null) params.set("before", String(action.before));
    }
    try {
      const response = await fetch("/api/assistant-chat?" + params.toString(), {
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      const value = await response.json();
      if (!response.ok) throw Error(value.error ?? "历史暂时无法读取，请重试。");
      if (controller.signal.aborted || request.current !== controller) return;
      if (action.kind === "list") {
        const next: ConversationList = value;
        listLoaded.current = true;
        setList(old => ({
          ...next,
          items: action.cursor && old ? [...old.items, ...next.items.filter(item => !old.items.some(current => current.id === item.id))] : next.items,
        }));
      } else {
        const next: ChatSnapshot = value;
        if (action.before != null && scroller.current) {
          const pane = scroller.current;
          const top = pane.getBoundingClientRect().top;
          const first = Array.from(pane.querySelectorAll<HTMLElement>("[data-chat-message]")).find(element => element.getBoundingClientRect().bottom > top);
          anchor.current = first ? { id: first.dataset.chatMessage!, offset: first.getBoundingClientRect().top - top } : null;
        }
        setSnapshot(old => ({
          ...next,
          messages: action.before != null && old?.conversationId === next.conversationId
            ? [...next.messages.filter(message => !old.messages.some(current => current.id === message.id)), ...old.messages]
            : next.messages,
        }));
      }
    } catch (failure) {
      if (request.current === controller && !controller.signal.aborted) {
        setError({ request: action, message: failure instanceof Error && failure.name === "Error" ? failure.message : "历史暂时无法读取，请重试。" });
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(null);
      }
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (conversationId) void readHistory({ kind: "detail", id: conversationId });
      else if (!listLoaded.current) void readHistory({ kind: "list" });
    });
    return () => {
      cancelAnimationFrame(frame);
      request.current?.abort();
    };
  }, [conversationId, readHistory]);

  useLayoutEffect(() => {
    const pane = scroller.current;
    if (!pane) return;
    title.current?.focus({ preventScroll: true });
    pane.scrollTop = conversationId ? 0 : returnTo.current?.top ?? 0;
    const selected = !conversationId && returnTo.current;
    if (selected) pane.querySelector<HTMLElement>('[data-history-id="' + CSS.escape(selected.id) + '"]')?.focus({ preventScroll: true });
  }, [conversationId]);
  useLayoutEffect(() => {
    const restore = anchor.current;
    const pane = scroller.current;
    anchor.current = null;
    if (!pane || !restore) return;
    const element = pane.querySelector<HTMLElement>('[data-chat-message="' + CSS.escape(restore.id) + '"]');
    if (element) pane.scrollTop += element.getBoundingClientRect().top - pane.getBoundingClientRect().top - restore.offset;
  }, [snapshot]);

  function inspect(id: string) {
    returnTo.current = { id, top: scroller.current?.scrollTop ?? 0 };
    onInspect(id);
  }
  function jump(id: string) {
    const source = scroller.current?.querySelector<HTMLElement>('[data-chat-message="' + CSS.escape(id) + '"]');
    if (!source) {
      setNotice(view?.hasMore ? "可以查看更早消息来找原文。" : "原消息已超出当前历史范围。");
      return;
    }
    source.scrollIntoView({ block: "nearest" });
    source.focus({ preventScroll: true });
  }
  async function resume() {
    if (!view || selecting) return;
    setSelecting(true);
    try {
      if (await chat.control("select_conversation", undefined, view.conversationId)) onContinue();
    } finally {
      setSelecting(false);
    }
  }
  const titleText = conversationId ? "历史对话" : "历史会话";
  const heading = page ? <h1 tabIndex={-1} ref={title}>{titleText}</h1> : <h3 tabIndex={-1} ref={title}>{titleText}</h3>;
  const errorNote = failure && <div className={styles.historyFeedback} role="alert">
    <p>{failure.message}</p><button type="button" onClick={() => void readHistory(failure.request)}>重试</button>
  </div>;

  return <section className={styles.history} data-page={page || undefined} aria-label="历史会话" onKeyDown={event => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      back();
    }
  }}>
    <header className={styles.historyHeading}>
      {page && <button type="button" className={styles.pageIcon} aria-label={conversationId ? "返回列表" : "返回小助手"} onClick={back}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>
      </button>}
      {heading}
      {!page && <button type="button" onClick={back}>{conversationId ? "返回列表" : "返回"}</button>}
    </header>
    {row && <p className={styles.historyTitle}>{row.title}<time dateTime={row.updatedAt}>{shortDate.format(new Date(row.updatedAt))}</time></p>}
    <div className={styles.historyScroll} ref={scroller}>
      {!conversationId ? <>
        {!list && !failure && <p className={styles.historyFeedback} role="status">正在读取会话…</p>}
        {list && (list.items.length
          ? <ul className={styles.historyList}>{list.items.map(item => <li key={item.id}><button type="button" data-history-id={item.id} onClick={() => inspect(item.id)}>
            <strong>{item.title}</strong><span>{shortDate.format(new Date(item.updatedAt))}{item.active ? " · 当前对话" : ""}</span>
          </button></li>)}</ul>
          : <p className={styles.historyFeedback}>暂无历史会话</p>)}
        {errorNote}
        {list?.next && !failure && <button type="button" className={styles.historyMore} disabled={!!busy} onClick={() => void readHistory({ kind: "list", cursor: list.next! })}>{busy ? "正在读取…" : "加载更早会话"}</button>}
      </> : <div className={styles.historyTranscript} data-paginated={view && (view.hasMore || view.messages.length > 5) || undefined}>
        {view?.hasMore && view.before != null && !failure && <button type="button" className={styles.historyMore} disabled={!!busy} onClick={() => void readHistory({ kind: "detail", id: conversationId, before: view.before! })}>{busy ? "正在读取…" : "查看更早消息"}</button>}
        {errorNote}
        {!view && !failure && <p className={styles.historyFeedback} role="status">正在读取对话…</p>}
        {view && !view.messages.length && <p className={styles.historyFeedback}>这段对话还没有消息。</p>}
        {notice && <p className={styles.historyFeedback} role="status">{notice}</p>}
        <div className={styles.historyMessages}>
          {view?.messages.map(message => <article key={message.id} data-chat-message={message.id} data-role={message.role} tabIndex={-1}
            className={chatStyles.message + " " + (message.role === "user" ? chatStyles.user : chatStyles.assistant)}>
            <ChatMessageBody message={message} inlinePreviews={view.capabilities?.inlinePreviews === true} historical jump={jump} navigate={navigate}/>
          </article>)}
        </div>
      </div>}
    </div>
    {view && <footer className={styles.historyFooter}>
      {chat.busy && <p>当前回答生成中，完成后可继续这段对话。</p>}
      {chat.uploading && <p>照片上传中，就绪后可切换。</p>}
      {!chat.enabled && <p>当前档位支持查看历史，继续对话需要聊天权限。</p>}
      {chat.error && <p role="alert">{chat.error}</p>}
      <button type="button" disabled={!chat.enabled || chat.busy || chat.managing || !!chat.uploading || selecting} onClick={() => void resume()}>{selecting ? "正在切换…" : "继续此对话"}</button>
    </footer>}
  </section>;
}
