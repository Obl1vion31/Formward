"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { lockPageScroll } from "@/components/scroll-lock";
import { useOrderedArrival } from "@/components/use-ordered-arrival";
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

export function AssistantWorkspace({ children, dock }: { children: ReactNode; dock: ReactNode }) {
  const { page } = useAssistant();
  const covered = !!page && page.motion?.direction !== "close";
  return <div className="workspace-shell">
    <div className={styles.workspaceContent} data-assistant-covered={covered || undefined} inert={covered}>{children}</div>
    <div className={styles.workspaceViewport} data-workspace-viewport data-assistant-present={!!page || undefined}
      data-assistant-covered={covered || undefined}>
      <div className={styles.workspaceDock} inert={covered}>{dock}</div>
      <AssistantPage page={page}/>
    </div>
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
  const content = useRef<HTMLDivElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const pageTitle = useRef<HTMLHeadingElement>(null);
  const leftHistory = useRef(false);
  useLayoutEffect(() => {
    const shell = container.current;
    if (!shown || !shell) return;
    const unlockPage = lockPageScroll();
    const viewport = window.visualViewport;
    let frame = 0, keyboard = false;
    let restingHeight = viewport?.height ?? innerHeight;
    let layoutWidth = document.documentElement.clientWidth;

    const resetKeyboardHeight = () => {
      shell.style.removeProperty("--assistant-content-top");
      shell.style.removeProperty("--assistant-content-height");
      shell.style.removeProperty("--assistant-keyboard-height");
    };

    const layout = () => {
      frame = 0;
      const height = viewport?.height ?? innerHeight;
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && shell.contains(focused) &&
        (focused.matches("textarea,input:not([type=file])") || focused.isContentEditable);
      const width = document.documentElement.clientWidth;
      if (width !== layoutWidth) {
        layoutWidth = width;
        restingHeight = Math.max(document.documentElement.clientHeight, innerHeight);
      }
      if ((!editing && !keyboard) || height > restingHeight) restingHeight = height;
      const hasKeyboard = (editing || keyboard) && restingHeight - height >= (keyboard ? 8 : 72);
      if (hasKeyboard) {
        const shellHeight = shell.clientHeight;
        const visibleHeight = Math.min(height, shellHeight);
        // iPhone Safari 聚焦后可能把整个外壳移出屏幕上缘。只补偿测到的外壳位移。
        const clippedTop = Math.min(Math.max(0, -shell.getBoundingClientRect().top), shellHeight - visibleHeight);
        shell.style.setProperty("--assistant-content-top", clippedTop + "px");
        shell.style.setProperty("--assistant-content-height", visibleHeight + "px");
        shell.style.setProperty("--assistant-keyboard-height", visibleHeight + "px");
      } else if (keyboard) {
        resetKeyboardHeight();
      }
      keyboard = hasKeyboard;
      shell.toggleAttribute("data-assistant-keyboard", keyboard);
    };

    function schedule() {
      if (!frame) frame = requestAnimationFrame(layout);
    }
    layout();
    // 键盘缩高后 Safari 还能继续平移外壳，平移本身不会改变视口高度。
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    shell.addEventListener("focusin", schedule);
    shell.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      shell.removeEventListener("focusin", schedule);
      shell.removeEventListener("focusout", schedule);
      resetKeyboardHeight();
      shell.removeAttribute("data-assistant-keyboard");
      unlockPage();
    };
  }, [shown]);
  useLayoutEffect(() => {
    if (!interactive) return;
    const frame = requestAnimationFrame(() => pageTitle.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [entryId, interactive]);
  useLayoutEffect(() => {
    const node = content.current;
    return () => { if (node) stopSurfaceMotion(node); };
  }, []);
  useLayoutEffect(() => {
    const node = content.current;
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
    <div ref={content} className={styles.assistantPageContent} data-assistant-page-content>
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
      {page && <AssistantPageBody historyOpen={!!history}>
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
    </div>
    <div className={styles.keyboardGap} data-assistant-keyboard-gap aria-hidden="true"/>
  </main>;
}

function AssistantPageBody({ historyOpen, children }: { historyOpen: boolean; children: ReactNode }) {
  const scene = useOrderedArrival<HTMLDivElement>(historyOpen ? 1 : 0, { enabled: !historyOpen });
  return <div ref={scene} className={styles.mainContent} inert={historyOpen}>{children}</div>;
}
