"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { trackPopoverPosition } from "./anchored-popover";
import { WorkspaceRefreshingContext } from "@/features/dashboard/workspace-cache-context";
import styles from "./task-guide.module.css";

const TaskGuideAccount = createContext("");

export function TaskGuideProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  return <TaskGuideAccount value={accountId}>{children}</TaskGuideAccount>;
}

function guideTarget(trigger: HTMLElement | null, target: string) {
  if (!trigger?.getClientRects().length || trigger.closest("[inert], [data-return-prepared], [hidden]")) return;
  const scope = trigger.closest("dialog, [data-assistant-page]") ?? document;
  return Array.from(scope.querySelectorAll<HTMLElement>("[data-guide-target]")).find(element =>
    element.dataset.guideTarget === target && element.getClientRects().length &&
    !element.closest("[inert], [hidden], [data-return-prepared]") &&
    !element.matches(":disabled, [aria-disabled=true]"));
}

export function TaskGuide({ task, target = task, text, auto = true }: {
  task: string;
  target?: string;
  text: string;
  auto?: boolean;
}) {
  const account = useContext(TaskGuideAccount);
  const refreshing = useContext(WorkspaceRefreshingContext);
  const key = `formward:guide:${account}:${task}`;
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLSpanElement>(null);
  const detach = useRef<() => void>(() => {});
  const shown = useRef(new Set<string>());
  const [open, setOpen] = useState(false);

  const show = useCallback((anchor: HTMLElement) => {
    const node = panel.current;
    if (!node?.isConnected || node.matches(":popover-open")) return;
    const owner = anchor.closest<HTMLElement>("dialog, [data-assistant-page]") ?? document.body;
    const region = anchor.closest<HTMLElement>("[data-guide-region]");
    node.showPopover();
    const oldDescription = anchor.getAttribute("aria-describedby");
    anchor.setAttribute("aria-describedby", [oldDescription, id + "-text"].filter(Boolean).join(" "));
    anchor.addEventListener("click", hide);
    const stop = trackPopoverPosition(node, region ?? anchor, {
      owner, width: 260, minHeight: 44, gap: 6, margin: 16, preferAbove: !region, align: "end",
    });
    detach.current = () => {
      stop();
      anchor.removeEventListener("click", hide);
      if (oldDescription) anchor.setAttribute("aria-describedby", oldDescription);
      else anchor.removeAttribute("aria-describedby");
    };
    shown.current.add(key);
    try { localStorage.setItem(key, "seen"); } catch {}
    function hide() { if (node?.matches(":popover-open")) node.hidePopover(); }
  }, [id, key]);

  useEffect(() => {
    if (!account || !auto || refreshing || shown.current.has(key)) return;
    try { if (localStorage.getItem(key)) return; } catch {}
    let observer: IntersectionObserver | undefined;
    const frame = requestAnimationFrame(() => {
      const anchor = guideTarget(trigger.current, target);
      if (!anchor) return;
      observer = new IntersectionObserver(([entry]) => {
        if (!entry?.isIntersecting || document.hidden || !guideTarget(trigger.current, target)) return;
        const dialog = Array.from(document.querySelectorAll("dialog[open]")).at(-1);
        if (dialog && !dialog.contains(anchor)) return;
        observer?.disconnect();
        show(anchor);
      }, { threshold: .5 });
      observer.observe(anchor);
    });
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [account, auto, key, refreshing, show, target]);

  useEffect(() => {
    const node = panel.current;
    return () => {
      detach.current();
      if (node?.matches(":popover-open")) node.hidePopover();
    };
  }, [key, target]);

  if (!account) return null;
  return <span className={styles.guide} data-task-guide={task}>
    <button className={styles.trigger} ref={trigger} type="button" aria-expanded={open} aria-controls={id} onClick={() => {
      if (panel.current?.matches(":popover-open")) { panel.current.hidePopover(); return; }
      const anchor = guideTarget(trigger.current, target);
      if (anchor) {
        anchor.scrollIntoView({ block: "nearest", inline: "nearest" });
        show(anchor);
      }
    }}>使用指引</button>
    <span id={id} ref={panel} className={styles.hint} popover="auto" data-guide-hint onToggle={event => {
      const visible = event.newState === "open";
      setOpen(visible);
      if (!visible) { detach.current(); detach.current = () => {}; }
    }}>
      <span id={id + "-text"}>{text}</span>
      <button className={styles.close} type="button" aria-label="关闭使用指引" onClick={() => {
        panel.current?.hidePopover();
        if (document.activeElement === document.body) trigger.current?.focus({ preventScroll: true });
      }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg>
      </button>
    </span>
  </span>;
}
