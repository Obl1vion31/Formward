"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { LoadingLink } from "@/components/loading-link";
import { useDelayedReading } from "@/components/local-loading";
import { NavigationIcon } from "@/components/mobile-navigation";
import { useWorkspaceReturn } from "@/components/workspace-return";
import { addCalendarDays } from "../measurements/calendar";
import { localMeasurementDate } from "../measurements/entry-state";
import type { AssistantTasksState } from "./context";
import { assistantTools, type AssistantItem } from "./model";
import { TaskGroup } from "./task-group";
import styles from "./surface.module.css";

const dailyIcons = { meals: 1, energy: 3, body: 4, training: 2 } as const;

type DepartingTask = {
  item: AssistantItem;
  scope: string;
  following: string[];
};
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
  const [reviewOpen, setReviewOpen] = useState(restored?.reviews);
  const [tools, setTools] = useState(restored?.tools ?? false);
  const [applied, setApplied] = useState(restored);
  if (restored && restored !== applied) {
    setApplied(restored);
    setReviewOpen(restored.reviews);
    setTools(restored.tools);
  }
  const [busy, setBusy] = useState<{ id: string; action: "confirm" | "dismiss" } | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const [departing, setDeparting] = useState<DepartingTask[]>([]);
  const attempts = useRef(new Map<string, string>());
  const mutationRunning = useRef(false);
  const reading = useDelayedReading(!data && loading && !error);
  const content = useRef<HTMLDivElement>(null);
  const today = data?.localDate ?? localMeasurementDate(new Date());
  const yesterday = addCalendarDays(today, -1);
  const daily = data?.pending.filter(item => item.category !== "ai") ?? [];
  const reviews = data?.pending.filter(item => item.category === "ai") ?? [];
  const scope = data ? data.localDate + "/" + data.timezone : "";
  const visibleDaily = daily.slice();
  const leaving = new Set<string>();
  // Insert later removals first so earlier rows can still find their original neighbors.
  for (const entry of departing.slice().reverse()) {
    if (entry.scope !== scope || visibleDaily.some(item => item.id === entry.item.id)) continue;
    const next = visibleDaily.findIndex(item => entry.following.includes(item.id));
    visibleDaily.splice(next < 0 ? visibleDaily.length : next, 0, entry.item);
    leaving.add(entry.item.id);
  }
  if (failure && !visibleDaily.some(item => item.id === failure.id)) setFailure(null);

  useLayoutEffect(() => {
    if (!departing.length || !content.current) return;
    const animations = Array.from(content.current.querySelectorAll("[data-task-motion]"))
      .flatMap(node => node.getAnimations());
    let active = true;
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (active) setDeparting(previous => previous.filter(entry => !departing.includes(entry)));
    });
    return () => { active = false; };
  }, [departing]);

  async function run(item: AssistantItem, action: "confirm" | "dismiss", following: AssistantItem[]) {
    if (mutationRunning.current) return;
    const confirm = action === "confirm";
    const confirmation = item.mealConfirmation;
    if (confirm ? !confirmation : !item.dismissible) return;
    mutationRunning.current = true;
    setBusy({ id: item.id, action });
    const signature = confirmation && item.id + ":" + confirmation.version + ":" + confirmation.contentDigest;
    const willRemove = () => {
      const panel = content.current;
      if (!panel?.getClientRects().length || panel.closest("[inert]") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      setDeparting(previous => [...previous, { item, scope, following: following.map(row => row.id) }]);
    };
    try {
      let message: string;
      if (confirm && signature) {
        const operationId = attempts.current.get(signature) ?? crypto.randomUUID();
        attempts.current.set(signature, operationId);
        message = await completeMealDay(item, operationId, willRemove);
      } else message = await dismissItem(item.id, willRemove);
      if (message) setFailure({ id: item.id, message });
      else {
        if (signature) attempts.current.delete(signature);
        requestAnimationFrame(() => {
          if (document.activeElement === document.body) {
            content.current?.querySelector<HTMLElement>(
              ":is(h3, [data-task-empty], [data-assistant-group]):not([inert] *)",
            )?.focus({ preventScroll: true });
          }
        });
      }
    } catch {
      setFailure({ id: item.id, message: confirm ? "确认暂未完成，请重试。" : "忽略未保存，请重试。" });
    } finally {
      mutationRunning.current = false;
      setBusy(null);
    }
  }

  const items = (rows: AssistantItem[], groupLeaving: boolean) => <ul className={styles.dailyTasks}>{rows.map((item, index) => {
    if (item.category === "ai") return null;
    const confirming = busy?.id === item.id && busy.action === "confirm";
    const dismissing = busy?.id === item.id && busy.action === "dismiss";
    const rowLeaving = leaving.has(item.id);
    return <li key={item.id} data-assistant-item={item.id} inert={rowLeaving}
      className={styles.dailyTaskPresence} data-task-motion={rowLeaving && (!groupLeaving || rows.length > 1) ? "exit" : undefined}>
      <div className={styles.dailyTaskClip}><div className={styles.dailyTaskRow}>
        <span className={styles.dailyTaskIcon}><NavigationIcon index={dailyIcons[item.category]}/></span>
        <div className={styles.dailyTaskCopy}>
          <strong>{item.title}</strong>
          <div className={styles.dailyTaskDetail}>{item.detail && <span>{item.detail}</span>}{item.mealConfirmation &&
            <LoadingLink returnScope="assistant" prefetch={false} href={item.action.href} beforeNavigate={navigate}>查看餐次</LoadingLink>}
          </div>
        </div>
        <div className={styles.dailyTaskControls}>
          {item.dismissible && <button className={styles.dailyTaskDismiss} type="button" disabled={!!busy || rowLeaving}
            aria-busy={dismissing || undefined} aria-label={"忽略" + item.title + "提醒"}
            onClick={() => void run(item, "dismiss", rows.slice(index + 1))}>忽略</button>}
          {item.mealConfirmation
            ? <button className={styles.dailyTaskPrimary} type="button" disabled={!!busy || rowLeaving} aria-busy={confirming || undefined}
              onClick={() => void run(item, "confirm", rows.slice(index + 1))}>{confirming ? "正在确认…" : "标为已记全"}</button>
            : <LoadingLink returnScope="assistant" className={styles.dailyTaskAction} prefetch={false} href={item.action.href} beforeNavigate={navigate}>
              {item.action.label}<span aria-hidden="true">›</span>
            </LoadingLink>}
        </div>
        {failure?.id===item.id && <p role="alert" className={styles.dailyTaskError}>{failure.message}</p>}
      </div></div>
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

  return <div ref={content} className={styles.content+" "+styles.taskContent} data-assistant-task-scroll onKeyDown={event => {
    if (event.key !== "Escape" || !tools) return;
    event.preventDefault();
    event.stopPropagation();
    setTools(false);
    event.currentTarget.querySelector<HTMLButtonElement>('[data-assistant-group="tools"]')?.focus();
  }}>
    {!mobile&&<h3 tabIndex={-1} className={styles.taskHeading}>待办{data&&data.pending.length>0&&<span>{data.pending.length}</span>}</h3>}
    {error&&<div role="alert">{error}<button type="button" onClick={retry}>重新读取</button></div>}
    {!data&&reading&&<p role="status" className={styles.muted}>正在读取事项…</p>}
    {[{date:today,label:"今天"},{date:yesterday,label:"昨天"}].map(({date,label})=>{
      const rows = visibleDaily.filter(item => item.date === date);
      const groupLeaving = rows.every(item => leaving.has(item.id));
      return rows.length > 0 && <section key={date} inert={groupLeaving} className={styles.dailyTaskPresence}
        data-task-motion={groupLeaving ? "exit" : undefined}>
        <div className={styles.dailyTaskClip}><div className={styles.dailyTaskGroup}>
          <h3 tabIndex={-1}>{label} <time dateTime={date}>{shortDate(date)}</time></h3>
          {items(rows, groupLeaving)}
        </div></div>
      </section>;
    })}
    {data && data.pending.length === 0 && <div className={styles.dailyTaskPresence} data-task-motion={leaving.size ? "enter" : undefined}>
      <div className={styles.dailyTaskClip}>
        <p className={styles.muted} data-task-empty tabIndex={-1}>暂无待办</p>
      </div>
    </div>}
    {reviews.length>0&&<TaskGroup kind="reviews" title="AI 确认" description="核对待保存的提交"
      count={reviews.length+" 项"} open={reviewOpen??true} onToggle={()=>setReviewOpen(value=>!(value??true))}>{reviewItems}</TaskGroup>}
    <TaskGroup kind="tools" title="常用功能" description="使用说明、AI 接入等" count={assistantTools.length + 1 + " 个功能"} open={tools} onToggle={() => setTools(value => !value)}>
      <nav className={styles.toolsList} aria-label="常用功能">
        <LoadingLink returnScope="assistant" href={"/dashboard/training?date=" + today} beforeNavigate={navigate}>训练计划</LoadingLink>
        {assistantTools.map(action => <LoadingLink returnScope="assistant" key={action.label} href={action.href} beforeNavigate={navigate}>{action.label}</LoadingLink>)}
      </nav>
    </TaskGroup>
  </div>;
}
