"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useOrderedArrival } from "@/components/use-ordered-arrival";
import { lockPageScroll } from "@/components/scroll-lock";
import { animateSurface, stopSurfaceMotion } from "@/components/surface-motion";
import { useAssistant } from "./context";
import { useAssistantChat } from "./chat-client";
import { AssistantChatView, ChatHeaderActions, ChatNavigation, type ChatTab } from "./chat-view";
import { ChatHistory } from "./chat-history";
import { AssistantTasks } from "./assistant-tasks";
import type { AssistantPageState } from "./page-navigation";
import { HistoryIcon } from "./surface";
import styles from "./surface.module.css";

const allowNavigation = async () => true;
const validConversation = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

function setHistoryView(value: string | null, steps: number, replace = false) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set("history", value);
  else url.searchParams.delete("history");
  window.history[replace ? "replaceState" : "pushState"]({
    formwardAssistantEntry: window.history.state?.formwardAssistantEntry,
    formwardAssistantHistory: steps,
  }, "", url);
}

export function AssistantWorkspace({ children }: { children: ReactNode }) {
  const { page } = useAssistant();
  return <div className="workspace-shell">
    <div className={styles.workspaceContent} data-assistant-covered={!!page && !page.motion || undefined}
      inert={!!page && page.motion?.direction !== "close"}>{children}</div>
    <AssistantPage page={page}/>
  </div>;
}

function AssistantPage({ page }: { page: AssistantPageState | null }) {
  const router = useRouter();
  const entryId = page?.entryId ?? null, motion = page?.motion;
  const params = new URLSearchParams(page?.query);
  const { backFromPage, completePageMotion, tasks, count } = useAssistant();
  const chat = useAssistantChat();
  const [selection, setSelection] = useState<{ entryId: string | null; tab: ChatTab } | null>(null);
  const selectTab = (tab: ChatTab) => setSelection({ entryId, tab });
  const tab = selection?.entryId === entryId ? selection.tab : (params.get("view") === "tasks" || !chat.enabled ? "tasks" : "chat");
  const history = params.get("history");
  const conversation = history && validConversation.test(history) ? history : null;
  const closing = motion?.direction === "close";
  const shown = !!page;
  const interactive = shown && !closing;
  const container = useRef<HTMLElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const pageTitle = useRef<HTMLHeadingElement>(null);
  const leftHistory = useRef(false);

  useLayoutEffect(() => {
    const shell = container.current;
    if (!shown || !shell) return;
    const unlock = lockPageScroll("fixed");
    const viewport = window.visualViewport;
    let frame = 0, dragUntil = 0, keyboard = false;
    let restingHeight = viewport?.height ?? innerHeight;
    let layoutWidth = document.documentElement.clientWidth;
    function layout() {
      const height = viewport?.height ?? innerHeight;
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && shell!.contains(focused) &&
        (focused.matches("textarea,input:not([type=file])") || focused.isContentEditable);
      const width = document.documentElement.clientWidth;
      if (width !== layoutWidth) {
        layoutWidth = width;
        restingHeight = Math.max(document.documentElement.clientHeight, innerHeight);
      }
      if ((!editing && !keyboard) || height > restingHeight) restingHeight = height;
      // 恢复到正常视口后再加回安全区，失焦本身不代表键盘已收起。
      keyboard = (editing || keyboard) && restingHeight - height >= (keyboard ? 8 : 72);
      // 普通浏览由 CSS 的动态视口贴边，像素定位只用于软键盘占用可见区时。
      if (keyboard) {
        shell!.style.setProperty("--assistant-page-height", height + "px");
        shell!.style.setProperty("--assistant-page-top", Math.max(0, viewport?.offsetTop ?? 0) + "px");
      } else {
        shell!.style.removeProperty("--assistant-page-height");
        shell!.style.removeProperty("--assistant-page-top");
      }
      shell!.toggleAttribute("data-assistant-keyboard", keyboard);
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    }
    function drag(event: TouchEvent) {
      if (event.touches.length === 1) dragUntil = performance.now() + 180;
    }
    function pan() {
      // 跟随键盘迟到的平移，输入框和消息内拖动产生的短暂平移交给浏览器恢复。
      if (performance.now() >= dragUntil) schedule();
    }
    layout();
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", pan);
    shell.addEventListener("touchmove", drag, { passive: true });
    shell.addEventListener("focusin", schedule);
    shell.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", pan);
      shell.removeEventListener("touchmove", drag);
      shell.removeEventListener("focusin", schedule);
      shell.removeEventListener("focusout", schedule);
      shell.style.removeProperty("--assistant-page-height");
      shell.style.removeProperty("--assistant-page-top");
      shell.removeAttribute("data-assistant-keyboard");
      unlock();
    };
  }, [shown]);
  useLayoutEffect(() => {
    if (!interactive) return;
    const frame = requestAnimationFrame(() => pageTitle.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [entryId, interactive]);
  useLayoutEffect(() => {
    const node = container.current;
    return () => { if (node) stopSurfaceMotion(node); };
  }, []);
  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    const clearPose = () => {
      node.style.removeProperty("transform");
      node.style.removeProperty("clip-path");
      node.style.removeProperty("opacity");
    };
    if (!shown) { stopSurfaceMotion(node); clearPose(); return; }
    if (!motion) return;
    void animateSurface(node, motion.direction, null, "workspace-page").then(completed => {
      if (!completed) return;
      if (motion.direction === "open") clearPose();
      completePageMotion(motion);
    });
  }, [shown, motion, completePageMotion]);
  useLayoutEffect(() => {
    if (!closing && !history && leftHistory.current) historyButton.current?.focus({ preventScroll: true });
    leftHistory.current = !!history;
  }, [history, closing]);
  useEffect(() => {
    if (!interactive) return;
    const openReview = () => setSelection({ entryId, tab: "chat" });
    window.addEventListener("formward-assistant-preview", openReview);
    return () => window.removeEventListener("formward-assistant-preview", openReview);
  }, [entryId, interactive]);

  function backInHistory() {
    if (window.history.state?.formwardAssistantHistory) router.back();
    else setHistoryView(conversation ? "list" : null, 0, true);
  }
  function continueChat() {
    selectTab("chat");
    const steps = window.history.state?.formwardAssistantHistory;
    if (steps === 1 || steps === 2) window.history.go(-steps);
    else setHistoryView(null, 0, true);
  }

  return <main ref={container} className={styles.assistantPage} data-assistant-page={shown || undefined} hidden={!shown}
    inert={!interactive} aria-hidden={!interactive || undefined} data-assistant-phase={closing ? "closing" : motion ? "opening" : "open"}>
    <div className={styles.pageHeading} inert={!!history}>
      <header>
        <button className={styles.pageIcon} type="button" aria-label="返回工作区" onClick={backFromPage}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>
        </button>
        <h1 ref={pageTitle} className="sr-only" tabIndex={-1}>小助手</h1>
        <ChatNavigation tab={tab} onTab={selectTab} pendingCount={count}/>
        <div className={styles.pageActions}>
          <button ref={historyButton} type="button" className={styles.pageIcon} aria-label="历史会话" onClick={() => setHistoryView("list", 1)}><HistoryIcon/></button>
          <ChatHeaderActions onNew={() => selectTab("chat")}/>
        </div>
      </header>
    </div>
    {page && <AssistantPageBody defer={!!page.source} historyOpen={!!history}>
      <AssistantChatView sidebar={tasks && <AssistantTasks {...tasks} mobile inlineReview={chat.enabled} navigate={allowNavigation}/>}
        navigate={allowNavigation} tab={tab} page onPreviewBack={() => selectTab("tasks")}/>
    </AssistantPageBody>}
    {history && <ChatHistory
      page
      conversationId={conversation}
      onInspect={id => setHistoryView(id, Number(window.history.state?.formwardAssistantHistory === 1) + 1)}
      back={backInHistory}
      onContinue={continueChat}
      navigate={allowNavigation}
    />}
  </main>;
}

function AssistantPageBody({ defer, historyOpen, children }: { defer: boolean; historyOpen: boolean; children: ReactNode }) {
  const [ready, setReady] = useState(!defer);
  useEffect(() => {
    if (ready) return;
    // 给常驻标题、标签和返回键一次独立绘制，再挂载聊天正文。
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [ready]);
  const scene = useOrderedArrival<HTMLDivElement>(historyOpen ? 1 : 0, { enabled: !historyOpen });
  return <div ref={scene} className={styles.mainContent} inert={historyOpen}>{ready && children}</div>;
}
