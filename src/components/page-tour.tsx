"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { MOBILE_MEDIA } from "./use-mobile-mode";
import { readPopoverBounds } from "./anchored-popover";
import { guidePageBounds, guidePresent, guideScope, guideTarget, intersectGuideBox, openGuide, operationObstacles, placeGuideCard, type GuideBox, type GuideStep } from "./guide-position";
import { readVisibleViewport } from "./input-viewport";
import styles from "./task-guide.module.css";

const reduce = "(prefers-reduced-motion: reduce)";
const actions = "a[href],button,input,select,textarea,[role=button],[role=tab],[tabindex]";

function belowOrAbove(start: number, end: number, min: number, max: number) {
  if (end - start <= max - min) return start < min ? start - min : Math.max(0, end - max);
  if (end <= min || start >= max) return start - min;
  return 0;
}

/** Only uncover the target. A horizontal gesture must not also move the document. */
function revealTourTarget(anchor: HTMLElement) {
  const rail = anchor.closest<HTMLElement>('[data-metric-layout="rail"]');
  if (rail) {
    const card = anchor.getBoundingClientRect(), track = rail.getBoundingClientRect();
    const left = belowOrAbove(card.left, card.right, track.left + 1, track.right - 1);
    if (Math.abs(left) > 1) rail.scrollBy({ left, behavior: "instant" });
  }
  const box = anchor.getBoundingClientRect(), bounds = guidePageBounds(5);
  const top = belowOrAbove(box.top, box.bottom, bounds.top, bounds.bottom);
  if (Math.abs(top) > 1) window.scrollBy({ top, behavior: "instant" });
}

function targetBox(anchor: HTMLElement, owner?: HTMLElement): GuideBox | null {
  const rect = anchor.getBoundingClientRect();
  const rail = anchor.closest('[data-metric-layout="rail"]')?.getBoundingClientRect();
  const viewport = owner ? readPopoverBounds(owner, 3, true) : guidePageBounds(3);
  const bounds = rail ? intersectGuideBox(viewport, rail) : viewport;
  return bounds && intersectGuideBox({ left: rect.left - 2, top: rect.top - 2, right: rect.right + 2, bottom: rect.bottom + 2 }, bounds);
}

function paint(box: GuideBox, radius: string) {
  return { transform: `translate3d(${box.left}px,${box.top}px,0)`,
    width: box.right - box.left + "px", height: box.bottom - box.top + "px", borderRadius: radius };
}

async function motion(element: HTMLElement, from: Keyframe, to: Keyframe, duration: number, signal: AbortSignal, easing = "linear") {
  if (signal.aborted) return;
  const animation = element.animate([from, to], { duration, easing, fill: "forwards" });
  const cancel = () => animation.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    await animation.finished;
    if (!signal.aborted) Object.assign(element.style, to);
  } catch { /* A closed guide discards every unfinished frame. */ }
  finally {
    animation.cancel();
    signal.removeEventListener("abort", cancel);
  }
}

type Props = {
  ownerId: string;
  origin: HTMLButtonElement;
  configuration: string;
  operation?: boolean;
  onClose: (restoreFocus: boolean) => void;
};

export function PageTour({ ownerId, origin, configuration, operation = false, onClose }: Props) {
  const layerRef = useRef<HTMLDivElement>(null), frameRef = useRef<HTMLDivElement>(null), fillRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null), surfaceRef = useRef<HTMLDivElement>(null), forwardRef = useRef<HTMLButtonElement>(null);
  const control = useRef<{ step: (direction: number) => void; close: () => void; configure: (steps: GuideStep[]) => void }>(null);
  const [{ index, count, text: copy }, setStep] = useState({ index: 0, count: 0, text: "" });
  const portal = operation ? origin.closest<HTMLDialogElement>("dialog") ?? document.body : document.body;
  const noteId = ownerId + "-guide-note";

  useLayoutEffect(() => {
    const layer = layerRef.current, frame = frameRef.current, fill = fillRef.current, tip = tipRef.current, surface = surfaceRef.current;
    const opener = origin;
    if (!layer || !frame || !fill || !tip || !surface) return;
    const mask = layer, outline = frame, apertureFill = fill, card = tip, cardSurface = surface;
    const controller = new AbortController();
    const { signal } = controller;
    const scope = guideScope(opener);
    const container = operation ? opener.closest<HTMLElement>("dialog,[data-assistant-page]") ?? document.body : undefined;
    const reduced = matchMedia(reduce);
    let list: GuideStep[] = [];
    let current = 0, active: HTMLElement | undefined, text = "", rect: GuideBox | null = null;
    let busy = false, pendingFrame = 0;

    function phase(value: string) { mask.dataset.guidePhase = value; }
    function clearAnchor() {
      if (!active) return;
      active.removeAttribute("data-guide-highlight");
      if (operation) {
        const ids = active.getAttribute("aria-describedby")?.split(/\s+/).filter(id => id !== noteId);
        if (ids?.length) active.setAttribute("aria-describedby", ids.join(" "));
        else active.removeAttribute("aria-describedby");
      }
      observer.unobserve(active);
      active = undefined;
    }
    function hide() {
      clearAnchor();
      rect = null;
      if (mask.matches(":popover-open")) mask.hidePopover();
      if (document.documentElement.dataset.guideTour === ownerId) delete document.documentElement.dataset.guideTour;
    }
    function dismiss(focus: boolean) {
      controller.abort();
      hide();
      onClose(focus);
    }
    function setAnchor(target: HTMLElement) {
      if (active === target) return;
      clearAnchor();
      active = target;
      target.setAttribute("data-guide-highlight", "tour");
      if (operation) target.setAttribute("aria-describedby", [target.getAttribute("aria-describedby"), noteId].filter(Boolean).join(" "));
      observer.observe(target);
    }
    function layoutCard(box: GuideBox, target: HTMLElement) {
      const placement = placeGuideCard(card, box, container ? readPopoverBounds(container, 12, true) : guidePageBounds(16), {
        width: operation ? 270 : 310,
        sides: matchMedia(MOBILE_MEDIA).matches ? ["top", "bottom", "left", "right"] : ["left", "right", "top", "bottom"],
        dock: !operation,
        nearest: operation || undefined,
        avoid: operation ? operationObstacles(scope, target) : undefined,
      });
      card.style.visibility = placement ? "visible" : "hidden";
      return operation ? box : placement;
    }
    function nextOperation() {
      for (const [index, step] of list.entries()) {
        const target = guideTarget(opener, step.target);
        if (target) return { index, step, target };
      }
    }
    function refresh() {
      pendingFrame = 0;
      if (busy || signal.aborted) return;
      if (!guidePresent(opener) || opener.closest('[data-surface-phase="opening"],[data-surface-phase="closing"]')) {
        if (operation) hide(); else dismiss(true);
        return;
      }
      if (operation) {
        const next = nextOperation();
        if (!next) return hide();
        if (next.target !== active || next.step.text !== text) {
          void go(next.index, next.target);
          return;
        }
      } else if (!active) {
        const target = list[0] && guideTarget(opener, list[0].target);
        if (target) void go(0, target); else dismiss(true);
        return;
      }
      if (!active || !guidePresent(active)) return dismiss(true);
      const box = targetBox(active, container);
      const placement = box && layoutCard(box, active);
      if (!placement) {
        if (operation) hide(); else dismiss(true);
        return;
      }
      rect = placement;
      Object.assign(outline.style, paint(rect, getComputedStyle(active).borderTopLeftRadius));
    }
    function schedule() {
      if (!pendingFrame && !signal.aborted) pendingFrame = requestAnimationFrame(refresh);
    }
    async function go(to: number, target: HTMLElement) {
      if (busy || signal.aborted || !list[to]) return;
      busy = true;
      const animated = !reduced.matches;
      const oldRect = rect, initial = !mask.matches(":popover-open");
      const selected = list[to];
      if (initial) {
        document.documentElement.dataset.guideTour = ownerId;
        phase("initial");
        openGuide(mask);
      }
      if (animated && !initial && oldRect) {
        phase("covering");
        await Promise.all([
          motion(apertureFill, { opacity: "0" }, { opacity: "1" }, 80, signal),
          motion(cardSurface, { opacity: "1" }, { opacity: "0" }, 80, signal),
        ]);
      } else if (initial) {
        apertureFill.style.opacity = "1";
        cardSurface.style.opacity = "0";
      }
      if (signal.aborted) return;
      if (animated) phase("moving");
      if (operation) {
        if (!targetBox(target, container)) target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      } else revealTourTarget(target);
      // Measure the current copy after wrapping it at the actual width.
      flushSync(() => setStep({ index: to, count: list.length, text: selected.text }));
      if (signal.aborted) return;
      const destination = targetBox(target, container);
      const layout = destination && layoutCard(destination, target);
      if (!layout) {
        busy = false;
        if (operation) hide(); else dismiss(true);
        return;
      }
      const oldRadius = outline.style.borderRadius;
      rect = layout;
      const final = paint(rect, getComputedStyle(target).borderTopLeftRadius);
      if (animated && oldRect && !initial) {
        await motion(outline, paint(oldRect, oldRadius), final, 160, signal, "cubic-bezier(.22,.75,.28,1)");
      } else Object.assign(outline.style, final);
      if (signal.aborted) return;
      current = to;
      text = selected.text;
      if (target.isConnected) setAnchor(target);
      if (animated) {
        phase("revealing");
        await Promise.all([
          motion(apertureFill, { opacity: "1" }, { opacity: "0" }, 80, signal),
          motion(cardSurface, { opacity: "0" }, { opacity: "1" }, 80, signal),
        ]);
      } else {
        apertureFill.style.opacity = "0";
        cardSurface.style.opacity = "1";
      }
      if (signal.aborted) return;
      phase("ready");
      busy = false;
      if (!operation && (initial || !card.contains(document.activeElement))) forwardRef.current?.focus({ preventScroll: true });
      if (operation) schedule();
    }

    function intercept(event: Event) {
      const node = event.target;
      if (!(node instanceof Element) || card.contains(node)) return;
      if (!busy && active?.contains(node)) {
        if (event.type === "click" && node.closest(actions)) dismiss(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    }
    function onKey(event: KeyboardEvent) {
      if (!mask.matches(":popover-open")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss(!operation || card.contains(document.activeElement));
      } else if (!operation && event.key === "Tab") {
        const inCard = [...card.querySelectorAll<HTMLElement>("button")].filter(button => !busy || button.matches("[data-guide-close]"));
        const targets = busy || !active ? [] : [active, ...active.querySelectorAll<HTMLElement>(actions)].filter(element =>
          element.matches(actions) && element.tabIndex >= 0 && guidePresent(element) &&
          !!intersectGuideBox(element.getBoundingClientRect(), readVisibleViewport()));
        const order = [...inCard, ...targets].filter(element => guidePresent(element));
        if (!order.length) return;
        event.preventDefault();
        const offset = order.indexOf(document.activeElement as HTMLElement);
        const next = offset < 0 ? event.shiftKey ? order.length - 1 : 0 : (offset + (event.shiftKey ? -1 : 1) + order.length) % order.length;
        order[next]?.focus({ preventScroll: true });
      }
    }
    const observer = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    observer.observe(card);
    mutations.observe(container ?? scope, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["open", "disabled", "hidden", "inert", "data-guide-target", "data-return-prepared", "data-surface-phase", "aria-disabled"] });
    control.current = {
      step(direction) {
        if (busy || signal.aborted) return;
        const next = current + direction;
        if (next === list.length) dismiss(true);
        else if (list[next]) {
          const target = guideTarget(opener, list[next].target);
          if (target) void go(next, target); else dismiss(true);
        }
      },
      close() { dismiss(true); },
      configure(steps) { list = steps; schedule(); },
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    document.addEventListener("keydown", onKey, true);
    if (!operation) {
      document.addEventListener("pointerdown", intercept, true);
      document.addEventListener("click", intercept, true);
    }
    return () => {
      controller.abort();
      cancelAnimationFrame(pendingFrame);
      hide();
      observer.disconnect();
      mutations.disconnect();
      control.current = null;
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", intercept, true);
      document.removeEventListener("click", intercept, true);
    };
  }, [noteId, onClose, operation, origin, ownerId]);

  useLayoutEffect(() => {
    control.current?.configure(JSON.parse(configuration) as GuideStep[]);
  }, [configuration, onClose, operation, origin]);
  return createPortal(<div ref={layerRef} className={styles.tour} popover="manual" data-guide-layer data-guide-owner={ownerId}
    data-guide-float="tour" data-operation={operation || undefined} role="group" aria-label={operation ? "操作引导" : "页面导览"}>
    <div ref={frameRef} className={styles.tourFrame} data-guide-frame aria-hidden="true"><div ref={fillRef} className={styles.apertureFill}/></div>
    <div ref={tipRef} className={styles.tourTip} data-guide-tip>
      <div ref={surfaceRef} className={styles.tourSurface}>
        <p className={styles.tourText} id={noteId} aria-live="polite">{copy}</p>
        {!operation && <div className={styles.tourNav}>
          <span aria-live="polite">{index + 1} / {count}</span>
          <button type="button" disabled={index === 0} onClick={() => control.current?.step(-1)}>上一步</button>
          <button ref={forwardRef} type="button" data-next onClick={() => control.current?.step(1)}>{index === count - 1 ? "完成" : "下一步"}</button>
        </div>}
      </div>
      <button type="button" data-guide-close className={styles.close} aria-label="关闭使用指引" onClick={() => control.current?.close()}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg>
      </button>
    </div>
  </div>, portal);
}
