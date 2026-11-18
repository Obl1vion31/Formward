"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { lockPageScroll } from "@/components/scroll-lock";
import { useAssistant } from "./context";
import { useAssistantChat } from "./chat-client";
import { AssistantChatView, ChatHeaderActions, ChatNavigation, type ChatTab } from "./chat-view";
import { ChatHistory } from "./chat-history";
import { AssistantTasks } from "./assistant-tasks";
import { HistoryIcon } from "./surface";
import styles from "./surface.module.css";

const allowNavigation = async () => true;
const validConversation = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

function setHistoryView(value: string | null, steps: number, replace = false) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set("history", value);
  else url.searchParams.delete("history");
  window.history[replace ? "replaceState" : "pushState"]({ formwardAssistantHistory: steps }, "", url);
}

export function AssistantPage({ fromWorkspace = false }: { fromWorkspace?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { source, tasks, count } = useAssistant();
  const chat = useAssistantChat();
  const [selected, setSelected] = useState<ChatTab | null>(null);
  const tab = selected ?? (params.get("view") === "tasks" || !chat.enabled ? "tasks" : "chat");
  const history = params.get("history");
  const conversation = history && validConversation.test(history) ? history : null;
  const historyButton = useRef<HTMLButtonElement>(null);
  const pageTitle = useRef<HTMLHeadingElement>(null);
  const leftHistory = useRef(false);

  useLayoutEffect(() => {
    const unlock = lockPageScroll();
    pageTitle.current?.focus({ preventScroll: true });
    return unlock;
  }, []);
  useLayoutEffect(() => {
    if (!history && leftHistory.current) historyButton.current?.focus({ preventScroll: true });
    leftHistory.current = !!history;
  }, [history]);
  useEffect(() => {
    const openReview = () => setSelected("chat");
    window.addEventListener("formward-assistant-preview", openReview);
    return () => window.removeEventListener("formward-assistant-preview", openReview);
  }, []);

  function backToWorkspace() {
    if (fromWorkspace && source) router.back();
    else router.replace("/dashboard");
  }
  function backInHistory() {
    if (window.history.state?.formwardAssistantHistory) router.back();
    else setHistoryView(conversation ? "list" : null, 0, true);
  }
  function continueChat() {
    setSelected("chat");
    const steps = window.history.state?.formwardAssistantHistory;
    if (steps === 1 || steps === 2) window.history.go(-steps);
    else setHistoryView(null, 0, true);
  }

  return <main className={styles.assistantPage} data-assistant-page>
    <div className={styles.pageHeading} inert={!!history}>
      <header>
        <button className={styles.pageIcon} type="button" aria-label="返回工作区" onClick={backToWorkspace}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>
        </button>
        <h1 ref={pageTitle} tabIndex={-1}>小助手</h1>
        <div className={styles.pageActions}>
          <button ref={historyButton} type="button" className={styles.pageIcon} aria-label="历史会话" onClick={() => setHistoryView("list", 1)}><HistoryIcon/></button>
          <ChatHeaderActions onNew={() => setSelected("chat")}/>
        </div>
      </header>
      <ChatNavigation tab={tab} onTab={setSelected} pendingCount={count}/>
    </div>
    <div className={styles.mainContent} inert={!!history}>
      <AssistantChatView
        sidebar={tasks && <AssistantTasks {...tasks} mobile inlineReview={chat.enabled} navigate={allowNavigation}/>}
        navigate={allowNavigation}
        tab={tab}
        page
        onPreviewBack={() => setSelected("tasks")}
      />
    </div>
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
