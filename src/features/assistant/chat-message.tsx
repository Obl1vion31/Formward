"use client";

/* eslint-disable @next/next/no-img-element -- 会话原图在请求时校验账号归属。 */
import { type ReactNode } from "react";
import { LoadingLink } from "@/components/loading-link";
import { ChatPreviewCards } from "./chat-preview-card";
import { ChatText } from "./chat-text";
import { chatDisplayText, chatRecordReferences, withoutRepeatedFollowup } from "./chat-presentation";
import { Glyph } from "./chat-icon";
import type { ChatMessage, Followup } from "./chat-model";
import styles from "./chat.module.css";

const roles = { qwen: "千问", mimo: "小米 MiMo", glm: "智谱" };
const clock = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" });

export function ChatMessageBody({ message, inlinePreviews, historical = false, followup, jump, navigate, children }: {
  message: ChatMessage;
  inlinePreviews: boolean;
  historical?: boolean;
  followup?: Followup | null;
  jump: (id: string) => void;
  navigate: () => Promise<boolean>;
  children?: ReactNode;
}) {
  const user = message.role === "user";
  const ids = inlinePreviews && !user && message.state !== "working"
    ? message.references.flatMap(reference => reference.kind === "preview" && reference.operationId ? [reference.operationId] : [])
    : [];
  // 无结构化预览的旧回答保留审核原文和链接；有卡片时由卡片提供事实或回退入口。
  const shownText = chatDisplayText(message, historical ? ids.length > 0 : inlinePreviews);
  const answer = withoutRepeatedFollowup(shownText, followup);
  const references = message.state === "complete"
    ? chatRecordReferences(message.references, historical ? ids.length > 0 : inlinePreviews, message.steps)
    : [];
  const running = message.steps.find(step => step.state === "running");
  const failed = message.steps.some(step => step.state === "error");
  return <>
    <div className={styles.meta}>
      <span>{user ? "你" : message.provider ? roles[message.provider] : "小助手"}</span>
      <time dateTime={message.createdAt}>{clock.format(new Date(message.createdAt))}</time>
    </div>
    {message.replyTo && <button type="button" className={styles.messageQuote} onClick={() => jump(message.replyTo!.id)}>
      <Glyph name="quote"/><span>{message.replyTo.text}</span>
    </button>}
    {message.steps.length > 0 && <details className={styles.progress}>
      <summary>
        <span className={message.state === "working" ? styles.spinner : ""}>{message.state !== "working" && <Glyph name={failed ? "close" : "check"}/>}</span>
        {running ? "正在" + running.title : failed ? "部分步骤未完成" : "已完成" + message.steps.length + "个步骤"}
        <Glyph name="chevron"/>
      </summary>
      <ol>{message.steps.map(step => <li key={step.id}>
        <strong>{step.title}{step.state === "error" ? " · 未成功" : ""}</strong>
        <p>{step.state === "running" ? "正在处理…" : step.summary}</p>
        {step.note && <p>{step.note}</p>}
      </li>)}</ol>
    </details>}
    {message.state === "working" && !message.steps.length && !message.text && <p className={styles.working} role="status"><span className={styles.spinner}/>正在整理回答…</p>}
    {message.imageIds.length > 0 && <div className={styles.images}>{message.imageIds.map(id => <a key={id} href={"/api/meal-images/" + id} target="_blank" rel="noreferrer">
      <img src={"/api/meal-images/" + id} alt="本条消息的私有照片"/>
    </a>)}</div>}
    {user ? (message.text || !!message.answeredQuestions?.length) && <div className={styles.text}>
      {message.answeredQuestions?.length ? <details className={styles.answeredQuestions}>
        <summary>已询问{message.answeredQuestions.length}个问题</summary>
        <dl>{message.answeredQuestions.map((answer, index) => <div key={index}>
          <dt>{answer.prompt}</dt><dd>{answer.skipped ? "本次未填写" : answer.value}</dd>
        </div>)}</dl>
      </details> : <p>{message.text}</p>}
    </div> : answer && <ChatText value={answer} navigate={navigate}/>}
    {ids.length > 0 && <ChatPreviewCards ids={ids} navigate={navigate} readOnly={historical}/>}
    {references.length > 0 && <div className={styles.references}>{references.map(reference =>
      <LoadingLink key={reference.href} href={reference.href} prefetch={false} beforeNavigate={navigate}>{reference.title}<span aria-hidden="true">↗</span></LoadingLink>
    )}</div>}
    {children}
    {message.error && <p className={styles.failure} role={historical ? undefined : "alert"}>{message.error}</p>}
  </>;
}
