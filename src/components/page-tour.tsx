"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { MOBILE_MEDIA } from "./use-mobile-mode";
import { guidePageBounds, guidePresent, guideScope, guideTarget, intersectGuideBox, openGuide, placeGuideCard, type GuideBox, type GuideStep } from "./guide-position";
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

function tourBox(anchor: HTMLElement): GuideBox | null {
  const rect = anchor.getBoundingClientRect();
  const rail = anchor.closest('[data-metric-layout="rail"]')?.getBoundingClientRect();
  const viewport = guidePageBounds(3);
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
  origin: RefObject<HTMLButtonElement | null>;
  configuration: string;
  onClose: (restoreFocus: boolean) => void;
};

export function PageTour({ ownerId, origin, configuration, onClose }: Props) {
  const layerRef = useRef<HTMLDivElement>(null), frameRef = useRef<HTMLDivElement>(null), fillRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null), surfaceRef = useRef<HTMLDivElement>(null), forwardRef = useRef<HTMLButtonElement>(null);
  const control = useRef<{ step: (direction: number) => void; close: () => void }>(null);
  const [index, setIndex] = useState(0);
  const steps = JSON.parse(configuration) as GuideStep[];
  const currentStep = steps[index] ?? steps[0];

  useLayoutEffect(() => {
    const layer = layerRef.current, frame = frameRef.current, fill = fillRef.current, tip = tipRef.current, surface = surfaceRef.current;
    const opener = origin.current, list = JSON.parse(configuration) as GuideStep[];
    if (!layer || !frame || !fill || !tip || !surface || !opener || !list.length) return;
    const mask = layer, outline = frame, apertureFill = fill, card = tip, cardSurface = surface;
    const controller = new AbortController();
    const { signal } = controller;
    const scope = guideScope(opener);
    const reduced = matchMedia(reduce);
    let current = 0, active: HTMLElement | undefined, rect: GuideBox | null = null;
    let busy = false, pendingFrame = 0;

    function phase(value: string) { mask.dataset.guidePhase = value; }
    function dismiss(focus: boolean) {
      controller.abort();
      if (mask.matches(":popover-open")) mask.hidePopover();
      onClose(focus);
    }
    function setAnchor(target: HTMLElement) {
      if (active === target) return;
      if (active) {
        active.removeAttribute("data-guide-highlight");
        observer.unobserve(active);
      }
      active = target;
      target.setAttribute("data-guide-highlight", "tour");
      observer.observe(target);
    }
    function layoutCard(box: GuideBox) {
      return placeGuideCard(card, box, guidePageBounds(16), {
        width: 310, sides: matchMedia(MOBILE_MEDIA).matches ? ["top", "bottom", "left", "right"] : ["left", "right", "top", "bottom"], dock: true,
      });
    }
    function position(target: HTMLElement, box: GuideBox) {
      const placement = layoutCard(box);
      if (!placement) return false;
      rect = placement;
      Object.assign(outline.style, paint(rect, getComputedStyle(target).borderTopLeftRadius));
      return true;
    }
    function refresh() {
      pendingFrame = 0;
      if (busy || signal.aborted) return;
      if (!guidePresent(opener) || !guidePresent(active ?? null) || !active) return dismiss(true);
      const box = tourBox(active);
      if (!box || !position(active, box)) dismiss(true);
    }
    function schedule() {
      if (!pendingFrame && !signal.aborted) pendingFrame = requestAnimationFrame(refresh);
    }
    async function go(to: number, initial = false) {
      if (busy || signal.aborted || to < 0 || to >= list.length) return;
      const target = guideTarget(opener!, list[to].target);
      if (!target) return dismiss(true);
      busy = true;
      const animated = !reduced.matches;
      const oldRect = rect;
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
      revealTourTarget(target);
      // Measure the new copy after React lays it out. Its height can change on a narrow screen.
      if (!initial) flushSync(() => setIndex(to));
      if (signal.aborted) return;
      const destination = tourBox(target);
      if (!destination) return dismiss(true);
      const oldRadius = outline.style.borderRadius;
      const layout = layoutCard(destination);
      if (!layout) return dismiss(true);
      rect = layout;
      const final = paint(rect, getComputedStyle(target).borderTopLeftRadius);
      if (animated && oldRect && !initial) {
        await motion(outline, paint(oldRect, oldRadius), final, 160, signal, "cubic-bezier(.22,.75,.28,1)");
      } else Object.assign(outline.style, final);
      if (signal.aborted) return;
      current = to;
      setAnchor(target);
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
      if (initial || !card.contains(document.activeElement)) forwardRef.current?.focus({ preventScroll: true });
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
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss(true);
      } else if (event.key === "Tab") {
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
    mutations.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "inert", "data-return-prepared"] });
    control.current = {
      step(direction) {
        if (busy || signal.aborted) return;
        if (current + direction === list.length) dismiss(true);
        else void go(current + direction);
      },
      close() { dismiss(true); },
    };
    document.documentElement.dataset.guideTour = ownerId;
    phase("initial");
    openGuide(mask);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", intercept, true);
    document.addEventListener("click", intercept, true);
    void go(0, true);
    return () => {
      controller.abort();
      cancelAnimationFrame(pendingFrame);
      observer.disconnect();
      mutations.disconnect();
      active?.removeAttribute("data-guide-highlight");
      if (mask.matches(":popover-open")) mask.hidePopover();
      if (document.documentElement.dataset.guideTour === ownerId) delete document.documentElement.dataset.guideTour;
      control.current = null;
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", intercept, true);
      document.removeEventListener("click", intercept, true);
    };
  }, [configuration, onClose, origin, ownerId]);

  if (!currentStep) return null;
  return <div ref={layerRef} className={styles.tour} popover="manual" data-guide-layer data-guide-owner={ownerId}
    data-guide-float="tour" role="group" aria-label="页面导览">
    <div ref={frameRef} className={styles.tourFrame} data-guide-frame aria-hidden="true"><div ref={fillRef} className={styles.apertureFill}/></div>
    <div ref={tipRef} className={styles.tourTip} data-guide-tip>
      <div ref={surfaceRef} className={styles.tourSurface}>
        <p className={styles.tourText} aria-live="polite">{currentStep.text}</p>
        <div className={styles.tourNav}>
          <span aria-live="polite">{index + 1} / {steps.length}</span>
          <button type="button" disabled={index === 0} onClick={() => control.current?.step(-1)}>上一步</button>
          <button ref={forwardRef} type="button" data-next onClick={() => control.current?.step(1)}>{index === steps.length - 1 ? "完成" : "下一步"}</button>
        </div>
      </div>
      <button type="button" data-guide-close className={styles.close} aria-label="关闭使用指引" onClick={() => control.current?.close()}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg>
      </button>
    </div>
  </div>;
}
