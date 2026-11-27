"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { MOBILE_MEDIA } from "./use-mobile-mode";
import { guidePageBounds, guidePresent, guideScope, guideTarget, intersectGuideBox, openGuide, placeGuideCard, type GuideBox, type GuideStep } from "./guide-position";
import styles from "./task-guide.module.css";

const actions = "a[href],button,input,select,textarea,[role=button],[role=tab],[tabindex]";
const navigation = ".dashboard-header a,nav[aria-label=主导航] a,[data-workspace-dock] a,[data-workspace-dock] button,.dashboard-subpage-return,[data-guide-exit]";
type Status = "preparing" | "ready" | "waiting" | "failed" | "outside";
type Props = { ownerId: string; getOrigin: () => HTMLElement | null; configuration: string; onClose: (restoreFocus: boolean) => void; onRetry: () => void };

function revealTourTarget(anchor: HTMLElement) {
  let moved = false;
  const rail = anchor.closest<HTMLElement>('[data-metric-layout="rail"]');
  if (rail) {
    const card = anchor.getBoundingClientRect(), track = rail.getBoundingClientRect();
    if (card.left < track.left - 2 || card.right > track.right + 2) {
      rail.scrollTo({ left: rail.scrollLeft + card.left - track.left, behavior: "instant" });
      moved = true;
    }
  }
  const box = anchor.getBoundingClientRect(), bounds = guidePageBounds(5);
  const top = box.height <= bounds.bottom - bounds.top
    ? box.top < bounds.top ? box.top - bounds.top : Math.max(0, box.bottom - bounds.bottom)
    : box.top >= bounds.bottom || box.bottom <= bounds.top ? box.top - bounds.top : 0;
  if (Math.abs(top) > 1) { window.scrollBy({ top, behavior: "instant" }); moved = true; }
  return moved;
}

function targetBox(anchor: HTMLElement): GuideBox | null {
  const rect = anchor.getBoundingClientRect();
  const rail = anchor.closest('[data-metric-layout="rail"]')?.getBoundingClientRect();
  const bounds = rail ? intersectGuideBox(guidePageBounds(3), rail) : guidePageBounds(3);
  return bounds && intersectGuideBox({ left: rect.left - 2, top: rect.top - 2, right: rect.right + 2, bottom: rect.bottom + 2 }, bounds);
}

function geometry(box: GuideBox, radius: string) {
  return { transform: "translate3d(" + box.left + "px," + box.top + "px,0)", width: box.right - box.left + "px",
    height: box.bottom - box.top + "px", borderRadius: radius };
}

function nextFrame(signal: AbortSignal) {
  return new Promise<void>(done => {
    const finish = () => { signal.removeEventListener("abort", cancel); done(); };
    const frame = requestAnimationFrame(finish);
    const cancel = () => { cancelAnimationFrame(frame); finish(); };
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function settledTarget(resolve: () => HTMLElement | undefined, signal: AbortSignal) {
  let previous = "", stable = 0;
  const started = performance.now();
  while (!signal.aborted && performance.now() - started < 1600) {
    await nextFrame(signal);
    if (signal.aborted) return;
    const node = resolve();
    if (!node) return;
    const r = node.getBoundingClientRect();
    const next = [r.left, r.top, r.width, r.height, node.closest<HTMLElement>("[data-metric-rail]")?.scrollLeft].join(":");
    stable = next === previous ? stable + 1 : 0;
    previous = next;
    if (stable >= 2) return node;
  }
  return resolve();
}

export function PageTour({ ownerId, getOrigin, configuration, onClose, onRetry }: Props) {
  const layerRef = useRef<HTMLDivElement>(null), frameRef = useRef<HTMLDivElement>(null), tipRef = useRef<HTMLDivElement>(null);
  const apertureRef = useRef<HTMLDivElement>(null), fillRef = useRef<HTMLDivElement>(null), nextRef = useRef<HTMLButtonElement>(null);
  const control = useRef<{ step: (direction: number) => void; close: () => void; retry: () => void }>(null);
  const [view, setView] = useState(() => {
    const steps = JSON.parse(configuration) as GuideStep[];
    return { index: 0, count: steps.length, text: steps[0].text, status: "preparing" as Status, busy: false };
  });

  useLayoutEffect(() => {
    const layer = layerRef.current!, frame = frameRef.current!, tip = tipRef.current!;
    const aperture = apertureRef.current!, fill = fillRef.current!;
    const list = JSON.parse(configuration) as GuideStep[], reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const controller = new AbortController(), { signal } = controller;
    let current = 0, shown = 0, active: HTMLElement | undefined, busy = false, focused = false;
    let pendingFrame = 0, watchFrame = 0, waitingTimer = 0, status: Status = "preparing";
    let lastGeometry = "", lastTarget: HTMLElement | undefined, positionKey = "";
    const animations = new Set<Animation>();
    const resolveTarget = () => { const origin = getOrigin(); return origin ? guideTarget(origin, list[current].target) : undefined; };

    function update(next: Status, index = shown) {
      shown = index; status = next;
      setView(previous => previous.index === shown && previous.status === next && previous.busy === busy ? previous : {
        index: shown, count: list.length, text: list[shown].text, status: next, busy,
      });
    }
    function clearAnchor() {
      if (active) { active.removeAttribute("data-guide-highlight"); observer.unobserve(active); active = undefined; }
    }
    function attach(target: HTMLElement) {
      if (active === target) return;
      clearAnchor(); active = target;
      target.setAttribute("data-guide-highlight", "tour");
      observer.observe(target);
    }
    async function animate(node: HTMLElement, frames: Keyframe[], duration: number) {
      if (signal.aborted || reduced.matches || !duration || !node.animate) return;
      const animation = node.animate(frames, { duration, easing: "ease-in-out" });
      animations.add(animation);
      await animation.finished.catch(() => {});
      animations.delete(animation);
    }
    function place(box: GuideBox) {
      const bounds = guidePageBounds(16);
      const placement = placeGuideCard(tip, box, bounds, { width: 310, dock: true,
        sides: matchMedia(MOBILE_MEDIA).matches ? ["top", "bottom", "left", "right"] : ["left", "right", "top", "bottom"] });
      if (!placement) {
        tip.style.left = bounds.left + "px"; tip.style.top = bounds.bottom - tip.getBoundingClientRect().height + "px";
        tip.dataset.pointSide = "";
      }
    }
    function currentFailure() {
      const origin = getOrigin();
      return !!(origin?.closest('[data-guide-failed="true"]') || origin && guideScope(origin).closest('[data-guide-failed="true"]'));
    }
    function unavailable(outside = false) {
      clearAnchor();
      if (currentFailure()) {
        fill.style.opacity = "1";
        clearTimeout(waitingTimer); waitingTimer = 0;
        layer.dataset.guidePhase = "waiting";
        update("failed", current);
      } else if (!waitingTimer && status !== "waiting" && status !== "outside") {
        waitingTimer = window.setTimeout(() => {
          waitingTimer = 0;
          if (signal.aborted) return;
          fill.style.opacity = "1";
          layer.dataset.guidePhase = "waiting";
          update(outside ? "outside" : "waiting", current);
        }, 350);
      }
    }
    function paint(target: HTMLElement, box: GuideBox) {
      const rect = geometry(box, getComputedStyle(target).borderTopLeftRadius);
      const key = Object.values(rect).join(":");
      if (key !== positionKey) {
        Object.assign(frame.style, rect);
        Object.assign(aperture.style, rect);
        positionKey = key;
      }
      attach(target);
      place(box);
    }

    async function position(reveal: boolean) {
      if (busy || signal.aborted) return;
      const still = reduced.matches;
      const old = still || !layer.hasAttribute("data-guide-framed") ? null : geometry(frame.getBoundingClientRect(), frame.style.borderRadius);
      const opening = layer.dataset.guidePhase === "ready";
      busy = true;
      clearTimeout(waitingTimer); waitingTimer = 0;
      clearAnchor();
      update("preparing");
      if (opening && !still) {
        layer.dataset.guidePhase = "dimming";
        fill.style.opacity = "1";
        await animate(fill, [{ opacity: 0 }, { opacity: 1 }], 80);
      }
      if (signal.aborted) return;
      if (!still) fill.style.opacity = "1";
      let target = resolveTarget();
      if (target && reveal && revealTourTarget(target) && !still) target = await settledTarget(resolveTarget, signal);
      if (signal.aborted) return;
      const box = target && targetBox(target);
      if (!target || !box) {
        busy = false;
        layer.dataset.guidePhase = "preparing";
        unavailable(!!target);
        return;
      }

      const oldTip = old && tip.getBoundingClientRect();
      // 在下一次绘制前用新说明的实际高度定位置，卡片从上一位置连续接过去。
      flushSync(() => update("preparing", current));
      const next = geometry(box, getComputedStyle(target).borderTopLeftRadius);
      Object.assign(frame.style, next);
      place(box);
      const newTip = tip.getBoundingClientRect();
      layer.dataset.guideFramed = "";
      if (old && oldTip) {
        layer.dataset.guidePhase = "moving";
        await Promise.all([
          animate(frame, [old, next], 160),
          animate(tip, [{ transform: "translate3d(" + (oldTip.left - newTip.left) + "px," + (oldTip.top - newTip.top) + "px,0)" },
            { transform: "translate3d(0,0,0)" }], 160),
        ]);
      }
      if (signal.aborted) return;

      // 移动期间整页压暗；框到新位置以后才替换遮罩开口。
      const live = resolveTarget();
      const finalBox = live && targetBox(live);
      if (!live || !finalBox) {
        busy = false;
        unavailable(!!live);
        return;
      }
      layer.dataset.guideAperture = "";
      paint(live, finalBox);
      fill.style.opacity = "0";
      if (!still) {
        layer.dataset.guidePhase = "revealing";
        await animate(fill, [{ opacity: 1 }, { opacity: 0 }], 80);
      }
      if (signal.aborted) return;
      busy = false;
      layer.dataset.guidePhase = "ready";
      update("ready", current);
      if (!focused) { nextRef.current?.focus({ preventScroll: true }); focused = true; }
      schedule();
    }
    function refresh() {
      pendingFrame = 0;
      if (signal.aborted || busy) return;
      const target = resolveTarget(), box = target && targetBox(target);
      if (!target || !box) {
        if (!target || status !== "outside") unavailable(!!target);
        return;
      }
      clearTimeout(waitingTimer); waitingTimer = 0;
      if (status !== "ready") { void position(false); return; }
      paint(target, box);
    }
    function schedule() {
      if (!signal.aborted && !busy && !pendingFrame) pendingFrame = requestAnimationFrame(refresh);
    }
    // WebKit 可晚于 ResizeObserver 落实横向吸附。只在导览开启时监听实际位置。
    function watchGeometry() {
      if (signal.aborted) return;
      const target = resolveTarget(), bounds = guidePageBounds(3), rect = target?.getBoundingClientRect();
      const key = [rect?.left, rect?.top, rect?.width, rect?.height, bounds.left, bounds.right, bounds.top, bounds.bottom].join(":");
      if (key !== lastGeometry || target !== lastTarget) { lastGeometry = key; lastTarget = target; schedule(); }
      watchFrame = requestAnimationFrame(watchGeometry);
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
        current = next; void position(true);
      },
      close() { dismiss(true); },
      retry() { if (busy) return; if (status === "outside") void position(true); else { onRetry(); schedule(); } },
    };
    document.documentElement.dataset.guideTour = ownerId; layer.dataset.guidePhase = "preparing"; openGuide(layer);
    const origin = getOrigin(), bounds = guidePageBounds(16);
    place(origin?.getBoundingClientRect() ?? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.top });
    // 第一帧定位说明卡，避开 React 布局提交中的同步更新。
    pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; void position(true); });
    watchFrame = requestAnimationFrame(watchGeometry);
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
      controller.abort(); clearTimeout(waitingTimer); cancelAnimationFrame(pendingFrame); cancelAnimationFrame(watchFrame);
      animations.forEach(animation => animation.cancel());
      clearAnchor(); observer.disconnect(); mutations.disconnect(); control.current = null;
      if (layer.matches(":popover-open")) layer.hidePopover();
      if (document.documentElement.dataset.guideTour === ownerId) delete document.documentElement.dataset.guideTour;
    };
  }, [configuration, getOrigin, onClose, onRetry, ownerId]);

  const waiting = view.status !== "ready" && view.status !== "preparing";
  return createPortal(<div ref={layerRef} className={styles.tour} popover="manual" data-guide-layer data-guide-owner={ownerId}
    data-guide-float="tour" role="group" aria-label="页面导览">
    <div ref={apertureRef} className={styles.tourAperture} aria-hidden="true"><div ref={fillRef} className={styles.tourFill}/></div>
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
