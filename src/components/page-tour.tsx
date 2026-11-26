"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MOBILE_MEDIA } from "./use-mobile-mode";
import { guidePageBounds, guidePresent, guideScope, guideTarget, intersectGuideBox, openGuide, placeGuideCard, type GuideBox, type GuideStep } from "./guide-position";
import styles from "./task-guide.module.css";

const actions = "a[href],button,input,select,textarea,[role=button],[role=tab],[tabindex]";
const navigation = ".dashboard-header a,nav[aria-label=主导航] a,[data-workspace-dock] a,[data-workspace-dock] button,.dashboard-subpage-return,[data-guide-exit]";
type Status = "waiting" | "positioning" | "ready" | "failed" | "outside";
type Props = { ownerId: string; getOrigin: () => HTMLButtonElement | null; configuration: string; onClose: (restoreFocus: boolean) => void; onRetry: () => void };

function revealTourTarget(anchor: HTMLElement) {
  const rail = anchor.closest<HTMLElement>('[data-metric-layout="rail"]');
  if (rail) {
    const card = anchor.getBoundingClientRect(), track = rail.getBoundingClientRect();
    rail.scrollTo({ left: rail.scrollLeft + card.left - track.left, behavior: "instant" });
  }
  const box = anchor.getBoundingClientRect(), bounds = guidePageBounds(5);
  const top = box.height <= bounds.bottom - bounds.top
    ? box.top < bounds.top ? box.top - bounds.top : Math.max(0, box.bottom - bounds.bottom)
    : box.top >= bounds.bottom || box.bottom <= bounds.top ? box.top - bounds.top : 0;
  if (Math.abs(top) > 1) window.scrollBy({ top, behavior: "instant" });
}

function targetBox(anchor: HTMLElement): GuideBox | null {
  const rect = anchor.getBoundingClientRect();
  const rail = anchor.closest('[data-metric-layout="rail"]')?.getBoundingClientRect();
  const bounds = rail ? intersectGuideBox(guidePageBounds(3), rail) : guidePageBounds(3);
  return bounds && intersectGuideBox({ left: rect.left - 2, top: rect.top - 2, right: rect.right + 2, bottom: rect.bottom + 2 }, bounds);
}

// 等待真实滚动、吸附与布局稳定；卸载或退出立即取消，不把旧卡片坐标交给下一步。
async function settledTarget(resolve: () => HTMLElement | undefined, signal: AbortSignal) {
  let previous: number[] = [], stable = 0;
  const started = performance.now();
  while (!signal.aborted && performance.now() - started < 1600) {
    await new Promise<void>(done => {
      const finish = () => { signal.removeEventListener("abort", cancel); done(); };
      const frame = requestAnimationFrame(finish);
      const cancel = () => { cancelAnimationFrame(frame); finish(); };
      signal.addEventListener("abort", cancel, { once: true });
    });
    if (signal.aborted) return;
    const node = resolve();
    if (!node) { if (performance.now() - started < 80) continue; return; }
    const r = node.getBoundingClientRect();
    const next = [r.left, r.top, r.width, r.height, node.closest<HTMLElement>("[data-metric-rail]")?.scrollLeft ?? 0];
    stable = previous.length && next.every((value, i) => Math.abs(value - previous[i]) < .1) ? stable + 1 : 0;
    previous = next;
    if (stable >= 3 && performance.now() - started >= 80) return node;
  }
}

export function PageTour({ ownerId, getOrigin, configuration, onClose, onRetry }: Props) {
  const layerRef = useRef<HTMLDivElement>(null), frameRef = useRef<HTMLDivElement>(null), tipRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const control = useRef<{ step: (direction: number) => void; close: () => void; retry: () => void }>(null);
  const [view, setView] = useState(() => ({ index: 0, count: (JSON.parse(configuration) as GuideStep[]).length,
    text: (JSON.parse(configuration) as GuideStep[])[0]?.text ?? "", status: "waiting" as Status, busy: false }));

  useLayoutEffect(() => {
    const layer = layerRef.current!, frame = frameRef.current!, tip = tipRef.current!;
    const list = JSON.parse(configuration) as GuideStep[];
    const controller = new AbortController(), { signal } = controller;
    let current = 0, active: HTMLElement | undefined, busy = false, pendingFrame = 0, focused = false;
    let status: Status = "waiting";
    const resolveTarget = () => { const origin = getOrigin(); return origin ? guideTarget(origin, list[current].target) : undefined; };

    function update(next: Status) {
      status = next;
      setView(previous => previous.index === current && previous.status === next && previous.busy === busy ? previous : {
        index: current, count: list.length, text: list[current].text, status: next, busy,
      });
    }
    function clearAnchor() {
      if (active) { active.removeAttribute("data-guide-highlight"); observer.unobserve(active); active = undefined; }
    }
    function pending(next: Status) {
      clearAnchor(); layer.dataset.guidePhase = "waiting";
      const bounds = guidePageBounds(16), width = Math.min(310, bounds.right - bounds.left);
      tip.style.inlineSize = width + "px";
      tip.style.left = (bounds.left + Math.max(0, (bounds.right - bounds.left - width) / 2)) + "px";
      tip.style.top = bounds.top + "px";
      tip.dataset.pointSide = "";
      update(next);
    }
    function paint(target: HTMLElement) {
      const box = targetBox(target);
      if (!box) { pending("outside"); return; }
      if (active !== target) { clearAnchor(); active = target; target.setAttribute("data-guide-highlight", "tour"); observer.observe(target); }
      Object.assign(frame.style, { transform: `translate3d(${box.left}px,${box.top}px,0)`, width: box.right - box.left + "px",
        height: box.bottom - box.top + "px", borderRadius: getComputedStyle(target).borderTopLeftRadius });
      const bounds = guidePageBounds(16);
      const placement = placeGuideCard(tip, box, bounds, { width: 310, dock: true,
        sides: matchMedia(MOBILE_MEDIA).matches ? ["top", "bottom", "left", "right"] : ["left", "right", "top", "bottom"] });
      // 小屏大图可能没有完整的旁侧空位；说明可覆盖图的一部分，金框仍按真实目标测量。
      if (!placement) {
        tip.style.left = bounds.left + "px"; tip.style.top = bounds.bottom - tip.getBoundingClientRect().height + "px";
        tip.dataset.pointSide = "";
      }
      layer.dataset.guidePhase = "ready";
      update("ready");
    }
    function unavailable() {
      const origin = getOrigin();
      const failed = origin?.closest('[data-guide-failed="true"]') || origin && guideScope(origin).closest('[data-guide-failed="true"]');
      pending(failed ? "failed" : "waiting");
    }
    async function position() {
      if (busy || signal.aborted) return;
      busy = true; clearAnchor(); update("positioning"); layer.dataset.guidePhase = "waiting";
      const target = resolveTarget();
      if (target) revealTourTarget(target);
      const settled = await settledTarget(resolveTarget, signal);
      if (signal.aborted) return;
      busy = false;
      if (settled) paint(settled); else unavailable();
      if (!focused) { nextRef.current?.focus({ preventScroll: true }); focused = true; }
      // busy期间的scroll/resize/接管变更不丢弃，始终再量一帧最终位置。
      schedule();
    }
    function refresh() {
      pendingFrame = 0;
      if (signal.aborted) return;
      if (busy) return;
      const target = resolveTarget();
      if (!target) return unavailable();
      if (target !== active && status !== "outside") { void position(); return; }
      paint(target);
    }
    function schedule() {
      if (signal.aborted) return;
      if (busy) return;
      if (!pendingFrame) pendingFrame = requestAnimationFrame(refresh);
    }
    function dismiss(restoreFocus: boolean) {
      controller.abort(); clearAnchor();
      if (layer.matches(":popover-open")) layer.hidePopover();
      if (document.documentElement.dataset.guideTour === ownerId) delete document.documentElement.dataset.guideTour;
      onClose(restoreFocus);
    }
    function intercept(event: Event) {
      const node = event.target;
      if (!(node instanceof Element) || tip.contains(node)) return;
      if (node.closest(navigation)) { dismiss(false); return; }
      if (!busy && active?.contains(node)) {
        if (event.type === "click" && node.closest(actions)) dismiss(false);
        return;
      }
      event.preventDefault(); event.stopPropagation();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(true); }
      else if (event.key === "Tab") {
        const order = [...new Set([...tip.querySelectorAll<HTMLElement>(actions), ...(!busy && active ? [active, ...active.querySelectorAll<HTMLElement>(actions)] : []), ...document.querySelectorAll<HTMLElement>(navigation)])]
          .filter(node => node.matches(actions) && node.tabIndex >= 0 && guidePresent(node));
        if (!order.length) return;
        event.preventDefault();
        const at = order.indexOf(document.activeElement as HTMLElement);
        order[(at + (event.shiftKey ? -1 : 1) + order.length) % order.length]?.focus({ preventScroll: true });
      }
    }
    const observer = new ResizeObserver(schedule), mutations = new MutationObserver(schedule);
    observer.observe(tip);
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["open", "disabled", "hidden", "inert", "data-guide-target", "data-return-prepared", "data-guide-failed"] });
    control.current = {
      step(direction) {
        if (busy || signal.aborted) return;
        const next = current + direction;
        if (next === list.length) return dismiss(true);
        if (!list[next]) return;
        current = next; pending("waiting"); void position();
      },
      close() { dismiss(true); },
      retry() { if (busy) return; if (status === "outside") void position(); else { onRetry(); schedule(); } },
    };
    document.documentElement.dataset.guideTour = ownerId; layer.dataset.guidePhase = "waiting"; openGuide(layer);
    pending("waiting"); schedule();
    window.addEventListener("scroll", schedule, { capture: true, signal });
    window.addEventListener("resize", schedule, { signal });
    window.addEventListener("formward-guide-targets", schedule, { signal });
    window.visualViewport?.addEventListener("resize", schedule, { signal });
    window.visualViewport?.addEventListener("scroll", schedule, { signal });
    document.addEventListener("pointerdown", intercept, { capture: true, signal });
    document.addEventListener("click", intercept, { capture: true, signal });
    document.addEventListener("keydown", onKey, { capture: true, signal });
    const leave = () => dismiss(false);
    window.addEventListener("popstate", leave, { signal }); window.addEventListener("pagehide", leave, { signal });
    return () => {
      controller.abort(); cancelAnimationFrame(pendingFrame); clearAnchor(); observer.disconnect(); mutations.disconnect(); control.current = null;
      if (layer.matches(":popover-open")) layer.hidePopover();
      if (document.documentElement.dataset.guideTour === ownerId) delete document.documentElement.dataset.guideTour;
    };
  }, [configuration, getOrigin, onClose, onRetry, ownerId]);

  const waiting = view.status !== "ready";
  return createPortal(<div ref={layerRef} className={styles.tour} popover="manual" data-guide-layer data-guide-owner={ownerId}
    data-guide-float="tour" role="group" aria-label="页面导览">
    <div ref={frameRef} className={styles.tourFrame} data-guide-frame aria-hidden="true"/>
    <div ref={tipRef} className={styles.tourTip} data-guide-tip>
      <div className={styles.tourSurface}>
        <p className={styles.tourText} aria-live="polite">{view.text}</p>
        {waiting && <div className={styles.tourStatus} role="status">
          <p>{view.status === "failed" ? "此区域读取失败，可以重试或返回页面。" : view.status === "outside" ? "当前区域在屏幕外，可以重新定位。" : "正在准备此区域…"}</p>
          {!view.busy && <div><button type="button" onClick={() => control.current?.retry()}>{view.status === "outside" ? "重新定位" : "重试"}</button><button type="button" onClick={() => control.current?.close()}>返回页面</button></div>}
        </div>}
        <div className={styles.tourNav}>
          <span aria-live="polite">{view.index + 1} / {view.count}</span>
          <button type="button" disabled={view.busy || view.index === 0} onClick={() => control.current?.step(-1)}>上一步</button>
          <button ref={nextRef} type="button" data-next disabled={view.busy} onClick={() => control.current?.step(1)}>{view.index === view.count - 1 ? "完成" : "下一步"}</button>
          <button type="button" className={styles.skip} data-guide-close onClick={() => control.current?.close()}>跳过全部</button>
        </div>
      </div>
      <button type="button" data-guide-close className={styles.close} aria-label="关闭使用指引" onClick={() => control.current?.close()}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg>
      </button>
    </div>
  </div>, document.body);
}
