"use client";
import { LocalLoading } from "@/components/local-loading";

import { useState } from "react";
import { LoadingLink } from "@/components/loading-link";
import { useRecordGuidance } from "../onboarding/record-guidance";
import { recordGuides, type RecordGuideKind } from "../onboarding/record-guidance-model";
import { localMeasurementDate } from "../measurements/entry-state";
import type { AssistantTasksState } from "./context";
import { assistantQuickActions, assistantTools, type AssistantItem } from "./model";
import { TaskGroup } from "./task-group";
import styles from "./surface.module.css";

export function AssistantTasks({ data, error, loading, retry, dismissItem, mobile, inlineReview, navigate }: AssistantTasksState & {
  mobile: boolean;
  inlineReview: boolean;
  navigate: () => Promise<boolean>;
}) {
  const [supplementsOpen, setSupplementsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState<boolean>();
  const [tools, setTools] = useState(false);
  const [guides, setGuides] = useState(false);
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState("");
  const { replay } = useRecordGuidance();
  const hasReviews = !!data?.pending.some(item => item.category === "ai");
  const today = data?.localDate ?? localMeasurementDate(new Date());
  const summary=(item:AssistantItem)=>item.review?<><div className={styles.reviewMeta}><span>{item.review.source}</span><time dateTime={item.date}>{item.date.replaceAll("-", ".")} · {item.review.title}</time></div><strong className={styles.reviewValue}>{item.review.value}</strong>{item.review.detail&&<p data-meal-nutrition={item.review.kind === "meal" || undefined}>
      {item.review.detail.split(" · ").map((text,index)=><span key={index}>{text}</span>)}
    </p>}</>:<><div><strong>{item.title}</strong><time dateTime={item.date}>{item.date.replaceAll("-", ".")}</time></div><p>{item.detail}</p></>;
  const items = (rows: AssistantItem[]) => <ul className={styles.items}>{rows.map(item => <li key={item.id} data-assistant-item={item.id}>
    {item.category==="ai"?(item.action.previewId&&inlineReview?<button className={styles.reviewEntry} type="button" aria-label={item.review?item.review.source+"，"+item.review.title+"，"+item.review.value+"，查看并确认":item.title+"，查看并确认"} onClick={()=>window.dispatchEvent(new CustomEvent("formward-assistant-preview",{detail:{id:item.action.previewId}}))}>{summary(item)}</button>:<LoadingLink className={styles.reviewEntry} prefetch={false} href={item.action.href} beforeNavigate={navigate} aria-label={item.review?item.review.source+"，"+item.review.title+"，"+item.review.value+"，查看并确认":item.title+"，查看并确认"}>{summary(item)}</LoadingLink>):<>{summary(item)}<div className={styles.itemActions}><LoadingLink prefetch={false} href={item.action.href} beforeNavigate={navigate}>{item.action.label}<span aria-hidden="true"> →</span></LoadingLink>
    {item.dismissible && <button type="button" disabled={busy === item.id} onClick={async () => { setBusy(item.id); setFailure(""); try { setFailure(await dismissItem(item.id)); } catch { setFailure("忽略未保存，请重试。"); } finally { setBusy(""); } }}>{busy === item.id ? "保存中…" : "忽略这一天"}</button>}</div></>}
  </li>)}</ul>;
  const supplements = data ? [...data.pending.filter(item=>item.category!=="ai"&&item.category!=="training"),...data.suggestions] : [];
  const reviews = data?.pending.filter(item=>item.category==="ai") ?? [];
  const training = data?.pending.filter(item=>item.category==="training") ?? [];
  return <div className={styles.content} onKeyDown={event => {
    if (event.key !== "Escape" || !tools) return;
    event.preventDefault();
    event.stopPropagation();
    if (guides) setGuides(false);
    else {
      setTools(false);
      event.currentTarget.querySelector<HTMLButtonElement>('[data-assistant-group="tools"]')?.focus();
    }
  }}>
    <section className={styles.quick} aria-label="快捷记录"><div>{assistantQuickActions(today).map(action=><LoadingLink prefetch={false} key={action.label} href={action.href} beforeNavigate={navigate}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>{mobile?action.label.replace(/^手动/,""):action.label}</span></LoadingLink>)}</div></section>
    {error&&<div role="alert">{error}<button type="button" onClick={retry}>重新读取</button></div>}
    {!data&&loading&&<div className={styles.muted}><LocalLoading label="正在读取事项…"/></div>}
    <TaskGroup kind="supplements" title="按需补记" description="查看需要补记的记录" count={data?supplements.length+" 项":"…"} open={supplementsOpen} onToggle={()=>setSupplementsOpen(value=>!value)}>{supplements.length?items(supplements):data&&<p className={styles.muted}>暂无需要补记的事项</p>}</TaskGroup>
    <TaskGroup kind="reviews" title="AI 确认" description={data&&!hasReviews?"暂无待确认提交":"核对待保存的提交"}
      count={data?reviews.length+" 项":"…"} open={hasReviews&&(reviewOpen??true)}
      onToggle={hasReviews?()=>setReviewOpen(value=>!(value??true)):undefined}>{hasReviews&&items(reviews)}</TaskGroup>
    <TaskGroup kind="tools" title="常用功能" description="使用说明、AI 接入等" count={assistantTools.length+2+" 个功能"} open={tools} onToggle={()=>{setTools(value=>!value);setGuides(false);}}>
      <nav id="assistant-tools" className={styles.toolsList} aria-label="常用功能">{guides?<><button type="button" onClick={()=>setGuides(false)}>返回常用功能</button>{(Object.keys(recordGuides) as RecordGuideKind[]).map(kind=><button type="button" key={kind} onClick={async()=>{if(await navigate())await replay(kind);}}>重播{recordGuides[kind].label}录入引导</button>)}</>:<>{training.length>0&&items(training)}<LoadingLink href={"/dashboard/training?date="+today} beforeNavigate={navigate}>训练计划</LoadingLink>{assistantTools.map(action=><LoadingLink key={action.label} href={action.href} beforeNavigate={navigate}>{action.label}</LoadingLink>)}<button type="button" onClick={()=>setGuides(true)}>重播操作引导</button></>}</nav>
    </TaskGroup>
    {failure&&<p role="alert">{failure}</p>}
  </div>;
}
