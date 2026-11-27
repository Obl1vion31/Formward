"use client";

import { useRef, useState } from "react";
import { LoadingLink } from "@/components/loading-link";
import { useDelayedReading } from "@/components/local-loading";
import { NavigationIcon } from "@/components/mobile-navigation";
import { useWorkspaceReturn } from "@/components/workspace-return";
import { addCalendarDays } from "../measurements/calendar";
import { localMeasurementDate } from "../measurements/entry-state";
import type { AssistantTasksState } from "./context";
import { assistantQuickActions, assistantTools, type AssistantItem } from "./model";
import { TaskGroup } from "./task-group";
import styles from "./surface.module.css";

const dailyIcons = { meals: 1, energy: 3, body: 4, training: 2 } as const;
function shortDate(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return month + "月" + day + "日";
}

export function AssistantTasks({ data, error, loading, retry, dismissItem, completeMealDay, mobile, inlineReview, navigate }: AssistantTasksState & {
  mobile: boolean;
  inlineReview: boolean;
  navigate: () => Promise<boolean>;
}) {
  const restored = useWorkspaceReturn()?.restoring?.tasks;
  const [supplementsOpen, setSupplementsOpen] = useState(restored?.supplements ?? false);
  const [reviewOpen, setReviewOpen] = useState(restored?.reviews);
  const [tools, setTools] = useState(restored?.tools ?? false);
  const [applied, setApplied] = useState(restored);
  if (restored && restored !== applied) {
    setApplied(restored);
    setSupplementsOpen(restored.supplements);
    setReviewOpen(restored.reviews);
    setTools(restored.tools);
  }
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const attempts = useRef(new Map<string, string>());
  const mutationRunning = useRef(false);
  const reading = useDelayedReading(!data && loading && !error);
  const heading = useRef<HTMLHeadingElement>(null);
  const today = data?.localDate ?? localMeasurementDate(new Date());
  const yesterday = addCalendarDays(today, -1);
  const daily = data?.pending.filter(item => item.category !== "ai") ?? [];
  const reviews = data?.pending.filter(item => item.category === "ai") ?? [];
  const supplements = data?.suggestions ?? [];

  async function run(item: AssistantItem, confirm: boolean) {
    if (mutationRunning.current) return;
    const confirmation = item.mealConfirmation;
    if (confirm && !confirmation) return;
    mutationRunning.current = true;
    setBusy(item.id);
    setFailure(null);
    const signature = confirmation && item.id + ":" + confirmation.version + ":" + confirmation.contentDigest;
    try {
      let message: string;
      if (confirm && signature) {
        const operationId = attempts.current.get(signature) ?? crypto.randomUUID();
        attempts.current.set(signature, operationId);
        message = await completeMealDay(item, operationId);
      } else message = await dismissItem(item.id);
      if (message) setFailure({ id: item.id, message });
      else {
        if (signature) attempts.current.delete(signature);
        requestAnimationFrame(() => {
          if (document.activeElement === document.body) heading.current?.focus({ preventScroll: true });
        });
      }
    } catch {
      setFailure({ id: item.id, message: confirm ? "确认暂未完成，请重试。" : "忽略未保存，请重试。" });
    } finally {
      mutationRunning.current = false;
      setBusy("");
    }
  }

  const items = (rows: AssistantItem[]) => <ul className={styles.dailyTasks}>{rows.map(item => {
    if (item.category === "ai") return null;
    return <li key={item.id} data-assistant-item={item.id}>
      <span className={styles.dailyTaskIcon}><NavigationIcon index={dailyIcons[item.category]}/></span>
      <div className={styles.dailyTaskCopy}>
        <strong>{item.title}</strong>
        <div>{item.detail && <span>{item.detail}</span>}{item.mealConfirmation &&
          <LoadingLink returnScope="assistant" prefetch={false} href={item.action.href} beforeNavigate={navigate}>查看餐次</LoadingLink>}
          {item.dismissible && <details className={styles.dailyTaskMore}>
            <summary aria-label="更多饮食提醒操作">···</summary>
            <button type="button" disabled={!!busy} onClick={()=>void run(item, false)}>忽略这一天</button>
          </details>}
        </div>
      </div>
      {item.mealConfirmation
        ? <button className={styles.dailyTaskPrimary} type="button" disabled={!!busy} aria-busy={busy===item.id||undefined}
          onClick={()=>void run(item, true)}>{busy===item.id ? "正在确认…" : "标为已记全"}</button>
        : <LoadingLink returnScope="assistant" className={styles.dailyTaskAction} prefetch={false} href={item.action.href} beforeNavigate={navigate}>
          {item.action.label}<span aria-hidden="true">›</span>
        </LoadingLink>}
      {failure?.id===item.id && <p role="alert" className={styles.dailyTaskError}>{failure.message}</p>}
    </li>;
  })}</ul>;

  const reviewItems = <ul className={styles.items}>{reviews.map(item=>{
    const title=item.review ? item.review.source+"，"+item.review.title+"，"+item.review.value+"，查看并确认" : item.title+"，查看并确认";
    const summary=item.review ? <>
      <div className={styles.reviewMeta}><span>{item.review.source}</span><time dateTime={item.date}>{item.date.replaceAll("-", ".")} · {item.review.title}</time></div>
      <strong className={styles.reviewValue}>{item.review.value}</strong>
      {item.review.detail&&<p data-meal-nutrition={item.review.kind==="meal" || undefined}>
        {item.review.detail.split(" · ").map((text,index)=><span key={index}>{text}</span>)}
      </p>}
    </> : <><strong>{item.title}</strong><p>{item.detail}</p></>;
    return <li key={item.id} data-assistant-item={item.id}>{item.action.previewId&&inlineReview
      ? <button type="button" className={styles.reviewEntry} aria-label={title}
        onClick={()=>window.dispatchEvent(new CustomEvent("formward-assistant-preview",{detail:{id:item.action.previewId}}))}>{summary}</button>
      : <LoadingLink returnScope="assistant" className={styles.reviewEntry} prefetch={false} href={item.action.href}
        beforeNavigate={navigate} aria-label={title}>{summary}</LoadingLink>}
    </li>;
  })}</ul>;

  return <div className={styles.content+" "+styles.taskContent} data-assistant-task-scroll onKeyDown={event => {
    if (event.key !== "Escape" || !tools) return;
    event.preventDefault();
    event.stopPropagation();
    setTools(false);
    event.currentTarget.querySelector<HTMLButtonElement>('[data-assistant-group="tools"]')?.focus();
  }}>
    {!mobile&&<h3 ref={heading} tabIndex={-1} className={styles.taskHeading}>待办{data&&data.pending.length>0&&<span>{data.pending.length}</span>}</h3>}
    {error&&<div role="alert">{error}<button type="button" onClick={retry}>重新读取</button></div>}
    {!data&&reading&&<p role="status" className={styles.muted}>正在读取事项…</p>}
    {[{date:today,label:"今天"},{date:yesterday,label:"昨天"}].map(({date,label})=>{
      const rows=daily.filter(item=>item.date===date);
      return rows.length>0&&<section key={date} className={styles.dailyTaskGroup}>
        <h3 tabIndex={-1} ref={mobile&&date===today?heading:undefined}>{label} <time dateTime={date}>{shortDate(date)}</time></h3>
        {items(rows)}
      </section>;
    })}
    {data&&data.pending.length===0&&<p className={styles.muted}>暂无待办</p>}
    {reviews.length>0&&<TaskGroup kind="reviews" title="AI 确认" description="核对待保存的提交"
      count={reviews.length+" 项"} open={reviewOpen??true} onToggle={()=>setReviewOpen(value=>!(value??true))}>{reviewItems}</TaskGroup>}
    {supplements.length>0&&<TaskGroup kind="supplements" title="按需补记" description="测量过再记录"
      count={supplements.length+" 项"} open={supplementsOpen} onToggle={()=>setSupplementsOpen(value=>!value)}>{items(supplements)}</TaskGroup>}
    <TaskGroup kind="tools" title="常用功能" description="使用说明、AI 接入等" count={assistantTools.length + 1 + " 个功能"} open={tools} onToggle={() => setTools(value => !value)}>
      <nav className={styles.toolsList} aria-label="常用功能">
        <LoadingLink returnScope="assistant" href={"/dashboard/training?date=" + today} beforeNavigate={navigate}>训练计划</LoadingLink>
        {assistantTools.map(action => <LoadingLink returnScope="assistant" key={action.label} href={action.href} beforeNavigate={navigate}>{action.label}</LoadingLink>)}
      </nav>
    </TaskGroup>
    <section className={styles.quick} aria-label="快捷记录"><div>{assistantQuickActions(today).map(action=><LoadingLink returnScope="assistant" prefetch={false} key={action.label} href={action.href} beforeNavigate={navigate}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      <span>{mobile?action.label.replace(/^手动/,""):action.label}</span>
    </LoadingLink>)}</div></section>
  </div>;
}
