"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { animateSurface } from "@/components/surface-motion";
import { confirmationIsOpen } from "@/components/confirmation-state";
import { AssistantIcon } from "./icon";
import { AssistantTasks } from "./assistant-tasks";
import { ChatHistory } from "./chat-history";
import { AssistantChatView, ChatHeaderActions } from "./chat-view";
import { useAssistantChat } from "./chat-client";
import type { AssistantTasksState } from "./context";
import styles from "./surface.module.css";

type Controller = { dismiss: () => Promise<boolean>; reopen: () => void };

export function HistoryIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 2"/></svg>;
}

export function AssistantSurface({ close, requestClose, controllerReady, ...tasks }: AssistantTasksState & {
  close: () => void;
  requestClose: () => Promise<void>;
  controllerReady: (value: Controller | null) => void;
}) {
  const chat = useAssistantChat();
  const [history, setHistory] = useState(false);
  const [conversation, setConversation] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const pending = useRef<Promise<boolean> | null>(null);
  const ticket = useRef(0);

  const dismiss = useCallback(() => {
    if (pending.current) return pending.current;
    const node = dialog.current;
    if (!node) return Promise.resolve(true);
    const id = ++ticket.current;
    const task = animateSurface(node, "close", null, "anchored").then(finished => {
      if (finished && id === ticket.current) close();
      if (pending.current === task) pending.current = null;
      return finished && id === ticket.current;
    });
    pending.current = task;
    return task;
  }, [close]);
  const reopen = useCallback(() => {
    ticket.current++;
    pending.current = null;
    if (dialog.current) void animateSurface(dialog.current, "open", null, "anchored");
  }, []);
  useLayoutEffect(() => {
    controllerReady({ dismiss, reopen });
    return () => controllerReady(null);
  }, [controllerReady, dismiss, reopen]);
  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const previous = document.activeElement;
    const trigger = Array.from(document.querySelectorAll<HTMLElement>("[data-assistant-trigger]")).find(element => element.getClientRects().length);
    node.show();
    void animateSurface(node, "open", trigger, "anchored");
    closeButton.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!confirmationIsOpen() && event.target instanceof Element && !node.contains(event.target) && !event.target.closest("[data-assistant-trigger]")) void requestClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      node.getAnimations().forEach(animation => animation.cancel());
      node.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [requestClose]);
  const navigate = useCallback(async () => {
    await requestClose();
    const phase = dialog.current?.dataset.surfacePhase;
    return phase !== "open" && phase !== "opening";
  }, [requestClose]);
  function hideHistory() {
    setHistory(false);
    setConversation(null);
    historyButton.current?.focus({ preventScroll: true });
  }
  function backInHistory() {
    if (conversation) setConversation(null);
    else hideHistory();
  }
  return <dialog ref={dialog} className={styles.surface} data-chat="true" data-assistant-surface data-mobile="false"
    aria-labelledby="assistant-title" onCancel={event => {
      event.preventDefault();
      if (history) backInHistory();
      else void requestClose();
    }}>
    <header className={styles.heading}>
      <div><AssistantIcon/><h2 id="assistant-title">小助手</h2></div>
      <button type="button" ref={historyButton} className={styles.historyTrigger} aria-label="历史会话" aria-expanded={history} onClick={() => history ? hideHistory() : setHistory(true)}><HistoryIcon/></button>
      <div>
        <ChatHeaderActions onNew={hideHistory}/>
        <button ref={closeButton} type="button" aria-label="收起小助手" onClick={() => void requestClose()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </div>
    </header>
    <div className={styles.mainContent} inert={history}>
      <AssistantChatView sidebar={<AssistantTasks {...tasks} mobile={false} inlineReview={chat.enabled} navigate={navigate}/>} navigate={navigate} tab="chat"/>
    </div>
    {history && <ChatHistory conversationId={conversation} onInspect={setConversation} back={backInHistory} onContinue={hideHistory} navigate={navigate}/>}
  </dialog>;
}
