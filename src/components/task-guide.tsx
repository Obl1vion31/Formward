"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { followPopoverAnchor, readPopoverBounds } from "./anchored-popover";
import { guidePresent, guideScope, guideTarget, openGuide, operationObstacles, placeGuideCard, type GuideStep } from "./guide-position";
import { PageTour } from "./page-tour";
import { WorkspaceRefreshingContext } from "@/features/dashboard/workspace-cache-context";
import styles from "./task-guide.module.css";

type GuideRun = { task: string; spotlight: boolean };
type GuideState = { account: string; workflow: GuideRun | null; setWorkflow: Dispatch<SetStateAction<GuideRun | null>> };
const GuideContext = createContext<GuideState>({ account: "", workflow: null, setWorkflow: () => {} });
const storageKey = (account: string, task: string) => "formward:guide-v2:" + account + ":" + task;

export function TaskGuideProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  return <GuideSession key={accountId} account={accountId}>{children}</GuideSession>;
}

function GuideSession({ account, children }: { account: string; children: ReactNode }) {
  const [workflow, setWorkflow] = useState<GuideRun | null>(null);
  return <GuideContext value={{ account, workflow, setWorkflow }}>{children}</GuideContext>;
}

export function useGuideWorkflow() {
  const { account, workflow, setWorkflow } = useContext(GuideContext);
  return {
    workflow: workflow?.task ?? null,
    finish(task: string) {
      if (workflow?.task !== task) return;
      try { localStorage.setItem(storageKey(account, task), "complete"); } catch {}
      setWorkflow(current => current?.task === task ? null : current);
    },
  };
}

function canPointAt(anchor: HTMLElement) {
  if (document.hidden || anchor.closest('[data-surface-phase="opening"],[data-surface-phase="closing"]')) return false;
  const box = anchor.getBoundingClientRect();
  return anchor.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
}

type GuideProps = { task: string; target?: string; text?: string; steps?: GuideStep[]; mode?: "tour" | "operation"; auto?: boolean };

export function TaskGuide({ task, target = task, text, steps, mode = "operation", auto = false }: GuideProps) {
  const { account, workflow, setWorkflow } = useContext(GuideContext);
  const refreshing = useContext(WorkspaceRefreshingContext);
  const id = useId(), hint = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<HTMLButtonElement | null>(null);
  const [tour, setTour] = useState(false);
  const [message, setMessage] = useState("");
  const [hintOpen, setHintOpen] = useState(false);
  const configured = JSON.stringify(steps ?? (text ? [{ target, text }] : []));
  const count = steps?.length ?? (text ? 1 : 0);
  const running = workflow?.task === task;
  const spotlight = mode === "tour" ? tour : running && !!workflow?.spotlight;
  const key = storageKey(account, task);

  const close = useCallback((restoreFocus: boolean) => {
    if (mode === "tour") setTour(false);
    else {
      if (hint.current?.matches(":popover-open")) hint.current.hidePopover();
      try { localStorage.setItem(key, "dismissed"); } catch {}
      setWorkflow(current => current?.task === task ? null : current);
    }
    if (restoreFocus && guidePresent(origin)) origin.focus({ preventScroll: true });
  }, [key, mode, origin, setWorkflow, task]);

  useEffect(() => {
    function opened(event: Event) {
      const selected = (event as CustomEvent<HTMLElement>).detail;
      if (selected?.dataset.guideOwner !== id) setTour(false);
    }
    window.addEventListener("formward-guide-open", opened);
    return () => window.removeEventListener("formward-guide-open", opened);
  }, [id]);

  useEffect(() => {
    if (mode !== "operation" || !account || !count || !origin || refreshing || workflow?.spotlight || (!running && !auto)) return;
    if (!running) {
      if (workflow && Array.from(document.querySelectorAll<HTMLElement>("[data-task-guide]")).some(other =>
        other.dataset.taskGuide === workflow.task && guidePresent(other))) return;
      try { if (localStorage.getItem(key)) return; } catch {}
    }
    const node = hint.current;
    if (!node) return;
    const options = JSON.parse(configured) as GuideStep[];
    const scope = guideScope(origin);
    let frame = 0, active: HTMLElement | undefined, reposition: (() => void) | undefined, release = () => {};
    function hide() {
      release();
      release = () => {};
      active = undefined;
      reposition = undefined;
      if (node?.matches(":popover-open")) node.hidePopover();
    }
    function inspect() {
      frame = 0;
      if (!guidePresent(origin) || !node?.isConnected || document.documentElement.dataset.guideTour) return hide();
      const pair = options.map(step => ({ step, anchor: guideTarget(origin, step.target) })).find(choice => choice.anchor);
      if (!pair?.anchor || !canPointAt(pair.anchor)) return hide();
      const { step, anchor } = pair;
      if (active === anchor) { reposition?.(); return; }
      hide();
      active = anchor;
      if (!running) {
        try { localStorage.setItem(key, "started"); } catch {}
        setWorkflow({ task, spotlight: false });
        return;
      }
      setMessage(step.text);
      const owner = anchor.closest<HTMLElement>("dialog,[data-assistant-page]") ?? document.body;
      const old = anchor.getAttribute("aria-describedby");
      anchor.setAttribute("aria-describedby", [old, id + "-text"].filter(Boolean).join(" "));
      anchor.setAttribute("data-guide-highlight", "");
      openGuide(node);
      const position = () => {
        if (!node.matches(":popover-open")) return;
        const placement = placeGuideCard(node, anchor.getBoundingClientRect(), readPopoverBounds(owner, 12, true), {
          width: 238, sides: ["left", "right", "bottom", "top"], avoid: operationObstacles(scope, anchor),
        });
        node.style.visibility = placement ? "visible" : "hidden";
      };
      reposition = position;
      const stop = followPopoverAnchor(node, anchor, owner, position);
      owner.addEventListener("focusin", position);
      release = () => {
        stop();
        owner.removeEventListener("focusin", position);
        node.style.removeProperty("visibility");
        anchor.removeAttribute("data-guide-highlight");
        const remaining = anchor.getAttribute("aria-describedby")?.split(/\s+/).filter(token => token !== id + "-text").join(" ");
        if (remaining) anchor.setAttribute("aria-describedby", remaining); else anchor.removeAttribute("aria-describedby");
      };
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(inspect); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !node.matches(":popover-open")) return;
      event.preventDefault();
      event.stopPropagation();
      close(node.contains(document.activeElement));
    };
    const observer = new MutationObserver(schedule);
    observer.observe(scope, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["open", "disabled", "hidden", "inert", "data-guide-target", "data-return-prepared", "data-surface-phase", "data-meal-pane-transition", "aria-disabled"] });
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    document.addEventListener("toggle", schedule, true);
    document.addEventListener("visibilitychange", schedule);
    document.addEventListener("keydown", escape, true);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      hide();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      document.removeEventListener("toggle", schedule, true);
      document.removeEventListener("visibilitychange", schedule);
      document.removeEventListener("keydown", escape, true);
    };
  }, [account, auto, close, configured, count, id, key, mode, origin, refreshing, running, setWorkflow, task, workflow]);

  if (!account || !count) return null;
  return <div className={styles.guide} data-task-guide={task}>
    <button type="button" className={styles.trigger} ref={setOrigin} aria-pressed={spotlight} onClick={() => {
      if (spotlight) { close(true); return; }
      if (mode === "tour") {
        if (workflow) setWorkflow(null);
        setTour(true);
        return;
      }
      try { localStorage.setItem(key, "started"); } catch {}
      setWorkflow({ task, spotlight: true });
    }}>使用指引</button>
    {mode === "operation" && <div ref={hint} className={styles.hint} popover="manual" data-guide-float="hint" data-guide-owner={id} data-guide-hint
      aria-label="首次操作提示" onToggle={event => setHintOpen(event.newState === "open")}>
      <div className={styles.hintText}>
        <span id={id + "-text"}>{message.split(/(「[^」]+」)/).map((part, index) =>
          part.startsWith("「") ? <strong key={index}>{part}</strong> : part
        )}</span>
        <button className={styles.close} type="button" aria-label="关闭使用指引" onClick={() => close(true)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg>
        </button>
      </div>
      {hintOpen && <span className="sr-only" role="status">{message}</span>}
    </div>}
    {origin && spotlight && !refreshing && <PageTour ownerId={id} origin={origin} configuration={configured} operation={mode === "operation"} onClose={close}/>}
  </div>;
}

const trendCopy = {
  nutrition: { summary: "看所选日期的摄入热量、餐数和营养。选历史日期后可补记当天。", chart: "柱形显示每天的摄入，图例说明营养组成和待确认状态。" },
  energy: { summary: "看所选日期的总消耗、静息和活动，以及当日可用的入口。", chart: "柱形显示每天已记录的消耗。点日期，读数会切到同一天。" },
  body: { summary: "读数来自所选日期的实测记录。7 日平均按有效样本计算。", chart: "点日期查看当天实测。缺测的位置留空，可切换看晚间记录。" },
} as const;

export function TrendGuide({ kind, device }: { kind: keyof typeof trendCopy; device?: boolean }) {
  const copy = trendCopy[kind];
  return <TaskGuide task={kind + "-page"} mode="tour" steps={[
    { target: "trend-" + kind + "-metrics", text: kind === "energy" && device ? "这里显示所选日期的设备消耗。今日累计会随同步更新。" : copy.summary },
    { target: "trend-range", text: "选择要看的日期区间，图表和记录读数会一起更新。" },
    { target: "trend-chart", text: copy.chart },
    { target: "selected-day-details", text: "这里打开当前选中的日期，查看记录及其来源。" },
  ]}/>;
}
