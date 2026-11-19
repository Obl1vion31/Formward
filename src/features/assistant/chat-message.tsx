"use client";

/* eslint-disable @next/next/no-img-element -- 会话原图在请求时校验账号归属。 */
import { useEffect, useState, type ReactNode } from "react";
import { LoadingLink } from "@/components/loading-link";
import { ChatPreviewCards } from "./chat-preview-card";
import { ChatText } from "./chat-text";
import { chatDisplayText, chatRecordReferences, withoutRepeatedFollowup } from "./chat-presentation";
import { Glyph } from "./chat-icon";
import type { ChatAnswer, ChatMessage, ChatRunTiming, ChatStep, Followup } from "./chat-model";
import styles from "./chat.module.css";

const roles = { qwen: "千问", mimo: "小米 MiMo", glm: "智谱" };
const clock = new Intl.DateTimeFormat("zh-CN", {hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const photoUrl = (id:string) => "/api/meal-images/"+id;

function Elapsed({timing}: {timing:ChatRunTiming & {startedAt:string}}) {
  const {observedAt,startedAt} = timing;
  const elapsed = Math.max(0,Date.parse(observedAt)-Date.parse(startedAt));
  const [sample,setSample] = useState<{observedAt:string;seconds:number}|null>(null);
  useEffect(() => {
    const received = performance.now();
    const id = setInterval(() => setSample({observedAt,seconds:Math.floor((elapsed+performance.now()-received)/1000)}),1000);
    return () => clearInterval(id);
  },[observedAt,elapsed]);
  const seconds = sample?.observedAt === observedAt ? sample.seconds : Math.floor(elapsed/1000);
  const digits = String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
  return <span className={styles.elapsed} aria-live="off">已用 <time dateTime={`PT${seconds}S`}>{digits}</time></span>;
}

function ToolProgress({message,timing,time}: {message:ChatMessage;timing?:ChatRunTiming|null;time?:ReactNode}) {
  const working = message.state === "working";
  const displayed = message.steps.filter(step=>step.name!=="request_followup");
  if (!working && !displayed.length) return time ? <div className={styles.meta}>{time}</div> : null;
  const running = displayed.findLast(step=>step.state==="running");
  const failed = displayed.some(step=>step.state==="error");
  const title = working
    ? running ? running.name === "search_foods" ? "正在查找食材库" : "正在"+running.title
      : timing && !timing.startedAt ? "等待开始" : "正在整理回答"
    : failed ? "查看过程 · 有步骤未完成" : "查看过程";
  const timer = working && timing?.startedAt ? <Elapsed key={timing.runId} timing={{...timing,startedAt:timing.startedAt}}/> : null;
  const groups = new Map<string,ChatStep[]>();
  for (const step of displayed) groups.set(step.name,[...(groups.get(step.name)??[]),step]);
  const label = <><span className={working?styles.spinner:styles.progressIcon} aria-hidden="true">
    {!working && <Glyph name={failed?"close":"check"}/>}
  </span><span role={working?"status":undefined}>{title}</span>{timer}{time}</>;
  if (!groups.size) return <div className={styles.working}>{label}</div>;
  return <details className={styles.progress}>
    <summary>{label}<Glyph name="chevron"/></summary>
    <ul>{[...groups.entries()].map(([name,steps])=><li key={name}>
      <strong>{name==="search_foods"?"查找食材库":steps[0].title}{steps.length>1?" · "+steps.length+" 次":""}</strong>
      <ul>{steps.map(step=><li key={step.id}>{step.state==="running"?"正在处理…":step.summary??"本步已结束。"}</li>)}</ul>
    </li>)}</ul>
  </details>;
}

function AnswerSummary({answers,inline}: {answers:ChatAnswer[];inline?:boolean}) {
  const known = answers.filter(answer=>!answer.skipped && answer.value);
  const missing = answers.length-known.length;
  const example = known.find(answer=>answer.label && (answer.label+answer.value).length<=24);
  const text = example ? "已补充 · "+example.label+example.value
    : known.length === 1 && known[0].value!.length<=18 ? "已补充 · "+known[0].value
    : known.length ? "已补充 "+known.length+" 项" : "本次未提供补充";
  return <details className={inline?styles.followupSummary:styles.answeredQuestions}>
    <summary><span>{text}</span>{missing>0 && known.length>0 && <small>{missing} 项未提供</small>}</summary>
    <dl>{answers.map((answer,index)=><div key={index}><dt>{answer.prompt}</dt>
      <dd>{answer.outcome==="unknown"?"不知道":answer.skipped?"已跳过":answer.value}</dd></div>)}</dl>
  </details>;
}

function ChatPhoto({id,local,confirmed,onHandoff}: {
  id:string;local?:string;confirmed:boolean;onHandoff?:()=>void;
}) {
  const remote = photoUrl(id);
  return <a href={confirmed ? remote : local ?? remote} target="_blank" rel="noreferrer">
    {local && <img key="preview" src={local} alt="本条消息的私有照片"/>}
    {(!local || confirmed) && <img key="remote" src={remote} alt={local?"":"本条消息的私有照片"}
      className={local?styles.photoHandoff:undefined} onLoad={event=>{
        if (!local) return;
        const image = event.currentTarget;
        void image.decode().then(()=>{if(image.isConnected)onHandoff?.();}).catch(()=>{});
      }}/>}
  </a>;
}

export function ChatMessageBody({message,inlinePreviews,historical=false,followup,jump,navigate,children,timing,answers,
  previews,onPhotoHandoff,sendStatus,photoActions,continuation=false,actions}: {
  message:ChatMessage;
  inlinePreviews:boolean;
  historical?:boolean;
  followup?:Followup|null;
  jump:(id:string)=>void;
  navigate:()=>Promise<boolean>;
  children?:ReactNode;
  timing?:ChatRunTiming|null;
  answers?:ChatAnswer[];
  previews?:{phase:"sending"|"accepted"|"error";photos:{id?:string;preview?:string}[]};
  onPhotoHandoff?:(id:string)=>void;
  sendStatus?:ReactNode;
  photoActions?:ReactNode;
  continuation?:boolean;
  actions?:ReactNode;
}) {
  const user = message.role === "user";
  const ids = inlinePreviews && !user && message.state !== "working"
    ? message.references.flatMap(reference=>reference.kind==="preview"&&reference.operationId?[reference.operationId]:[])
    : [];
  const shownText = chatDisplayText(message,historical?ids.length>0:inlinePreviews);
  const answer = withoutRepeatedFollowup(shownText,followup);
  const references = message.state==="complete" ? chatRecordReferences(message.references,historical?ids.length>0:inlinePreviews,message.steps) : [];
  const time = <time className={styles.messageTime} dateTime={message.createdAt}>{clock.format(new Date(message.createdAt))}</time>;
  return <>
    {!continuation && <div className={styles.meta}>
      <span>{user?"你":message.provider?roles[message.provider]:"小助手"}</span>
      {time}
    </div>}
    {message.replyTo && <button type="button" className={styles.messageQuote} onClick={()=>jump(message.replyTo!.id)}>
      <Glyph name="quote"/><span>{message.replyTo.text}</span>
    </button>}
    {!user && <ToolProgress message={message} timing={timing} time={continuation ? time : undefined}/>}
    {message.imageIds.length>0 && <div className={styles.images}>{message.imageIds.map(id=><ChatPhoto key={id} id={id}
      local={previews?.photos.find(photo=>photo.id===id)?.preview}
      confirmed={!previews || previews.phase==="accepted"} onHandoff={()=>onPhotoHandoff?.(id)}/>)}</div>}
    {user ? (message.text || !!message.answeredQuestions?.length) && <div className={styles.text}>
      {message.answeredQuestions?.length ? <AnswerSummary answers={message.answeredQuestions}/> : <p>{message.text}</p>}
    </div> : answer && <ChatText value={answer} navigate={navigate}/>}
    {sendStatus}
    {answers?.length ? <AnswerSummary answers={answers} inline/> : null}
    {children}
    {ids.length>0 && <ChatPreviewCards ids={ids} navigate={navigate} readOnly={historical}/>}
    {photoActions ?? (message.error && <p className={styles.failure} role={historical?undefined:"alert"}>{message.error}</p>)}
    {(references.length > 0 || actions) && <footer className={styles.messageFooter} data-has-references={references.length > 0 || undefined}>
      {references.length > 0 && <div className={styles.references}>{references.map(reference =>
        <LoadingLink key={reference.href} href={reference.href} prefetch={false} beforeNavigate={navigate}>
          {reference.title}<span aria-hidden="true">↗</span>
        </LoadingLink>)}</div>}
      {actions}
    </footer>}
  </>;
}
