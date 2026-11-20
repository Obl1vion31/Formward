"use client";

import { useLayoutEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { MOBILE_MEDIA } from "./use-mobile-mode";

type Slot = { index: number; center: number; width: number; item: HTMLElement };
type Gesture = { id: number; x: number; y: number; left: number; dragging: boolean };
type Slide = {
  root: HTMLElement | null;
  plate: HTMLElement | null;
  slots: Slot[];
  selected: number;
  center: number;
  width: number;
  velocity: number;
  frame: number;
  gesture: Gesture | null;
  suppressClick: boolean;
  enabled: boolean;
  reduced: boolean;
};

function stop(slide: Slide) {
  cancelAnimationFrame(slide.frame);
  slide.frame = 0;
}

function paint(slide: Slide) {
  if (!slide.plate) return;
  slide.plate.style.width = slide.width + "px";
  slide.plate.style.transform = `translate3d(${slide.center - slide.width / 2}px,0,0)`;
}

function settle(slide: Slide, target: Slot | undefined, immediate = false) {
  stop(slide);
  if (!target || !slide.root) return;
  if (immediate || slide.reduced || !slide.width) {
    slide.center = target.center;
    slide.width = target.width;
    slide.velocity = 0;
    paint(slide);
    return;
  }

  let previous = performance.now();
  const tick = (time: number) => {
    const elapsed = Math.min((time - previous) / 1000, .024);
    previous = time;
    slide.velocity += (-430 * (slide.center - target.center) - 31 * slide.velocity) * elapsed;
    slide.center += slide.velocity * elapsed;
    slide.width += (target.width - slide.width) * Math.min(1, elapsed * 36);
    if (Math.abs(slide.center - target.center) < .15 &&
      Math.abs(slide.width - target.width) < .15 && Math.abs(slide.velocity) < .25) {
      settle(slide, target, true);
      return;
    }
    paint(slide);
    slide.frame = requestAnimationFrame(tick);
  };
  slide.frame = requestAnimationFrame(tick);
}

function selectedSlot(slide: Slide) {
  return slide.slots.find(slot => slot.index === slide.selected);
}

function finishGesture(slide: Slide) {
  const gesture = slide.gesture;
  slide.gesture = null;
  const root = slide.root;
  if (!root) return;
  delete root.dataset.capsulePressed;
  if (gesture && root.hasPointerCapture(gesture.id)) root.releasePointerCapture(gesture.id);
}

function restore(slide: Slide) {
  finishGesture(slide);
  settle(slide, selectedSlot(slide));
}

function measure(slide: Slide, immediate: boolean) {
  const root = slide.root;
  if (!root) return;
  const area = root.getBoundingClientRect();
  if (!slide.enabled || !area.width) {
    finishGesture(slide);
    stop(slide);
    slide.slots = [];
    delete root.dataset.capsuleReady;
    return;
  }

  const inset = Number.parseFloat(getComputedStyle(root).getPropertyValue("--capsule-side-inset")) || 0;
  const slots = [...root.querySelectorAll<HTMLElement>(":scope > [data-capsule-choice]")].map(item => {
    const box = item.getBoundingClientRect();
    return {
      item,
      index: Number(item.dataset.capsuleChoice),
      center: box.left - area.left - root.clientLeft + box.width / 2,
      width: Math.max(0, box.width - 2 * inset),
    };
  });
  const changed = slots.length !== slide.slots.length ||
    slots.some((slot, index) => slot.center !== slide.slots[index]?.center || slot.width !== slide.slots[index]?.width);
  slide.slots = slots;
  if (changed || immediate) {
    finishGesture(slide);
    settle(slide, selectedSlot(slide), true);
  }
  root.toggleAttribute("data-capsule-ready", Boolean(selectedSlot(slide)));
}

/** 只绘制选中底片，业务状态由链接、标签或表单自己的选择事件提交。 */
export function useSlidingSelection(selected: number, choose: (index: number) => void | Promise<boolean | void>) {
  const slideRef = useRef<Slide>({
    root: null, plate: null, slots: [], selected, center: 0, width: 0, velocity: 0, frame: 0,
    gesture: null, suppressClick: false, enabled: false, reduced: false,
  });

  useLayoutEffect(() => {
    const slide = slideRef.current;
    const root = slide.root;
    if (!root) return;
    slide.plate = root.querySelector<HTMLElement>("[data-capsule-indicator]");
    const media = matchMedia(MOBILE_MEDIA);
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      slide.enabled = media.matches;
      slide.reduced = motion.matches;
      measure(slide, true);
    };
    sync();
    const observer = new ResizeObserver(() => measure(slide, false));
    observer.observe(root);
    root.querySelectorAll(":scope > [data-capsule-choice]").forEach(item => observer.observe(item));
    media.addEventListener("change", sync);
    motion.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
      motion.removeEventListener("change", sync);
      finishGesture(slide);
      stop(slide);
    };
  }, []);

  useLayoutEffect(() => {
    const slide = slideRef.current;
    slide.selected = selected;
    if (slide.enabled) {
      const target = selectedSlot(slide);
      slide.root?.toggleAttribute("data-capsule-ready", Boolean(target));
      if (!slide.gesture) settle(slide, target);
    }
  }, [selected]);

  function pointerDown(event: PointerEvent<HTMLElement>) {
    const slide = slideRef.current;
    if (!slide.enabled || event.button !== 0 || !event.isPrimary || !slide.slots.length) return;
    slide.suppressClick = false;
    const target = (event.target as Element).closest("[data-capsule-choice]");
    if (target?.matches(":disabled,[aria-disabled=true]")) return;
    const root = event.currentTarget;
    slide.gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: root.getBoundingClientRect().left + root.clientLeft,
      dragging: false,
    };
    root.dataset.capsulePressed = "";
  }

  function pointerMove(event: PointerEvent<HTMLElement>) {
    const slide = slideRef.current;
    const drag = slide.gesture;
    if (!drag || drag.id !== event.pointerId) return;

    if (!drag.dragging) {
      const dx = Math.abs(event.clientX - drag.x);
      const dy = Math.abs(event.clientY - drag.y);
      if (dy > 7 && dy >= dx) {
        restore(slide);
        return;
      }
      if (dx <= 7) return;
      drag.dragging = true;
      if (!(event.target as Element).hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      stop(slide);
      slide.velocity = 0;
    }

    const first = slide.slots[0];
    const last = slide.slots.at(-1);
    if (!first || !last) return;
    const center = Math.max(first.center - 4, Math.min(last.center + 4, event.clientX - drag.left));
    const right = slide.slots.findIndex(slot => slot.center >= center);
    const after = right < 0 ? last : slide.slots[right];
    const before = right <= 0 ? after : slide.slots[right - 1];
    const span = after.center - before.center;
    slide.center = center;
    slide.width = span ? before.width + (after.width - before.width) * (center - before.center) / span : after.width;
    paint(slide);
  }

  function pointerUp(event: PointerEvent<HTMLElement>) {
    const slide = slideRef.current;
    const drag = slide.gesture;
    if (!drag || drag.id !== event.pointerId) return;
    finishGesture(slide);
    if (!drag.dragging) return;

    slide.suppressClick = true;
    const center = event.clientX - drag.left;
    const direction = Math.sign(center - (selectedSlot(slide)?.center ?? center));
    const target = slide.slots
      .filter(slot => !slot.item.matches(":disabled,[aria-disabled=true]"))
      .sort((a, b) => Math.abs(a.center - center) - Math.abs(b.center - center) || direction * (b.center - a.center))[0];
    if (!target || target.index === slide.selected) {
      settle(slide, selectedSlot(slide));
      return;
    }

    settle(slide, target);
    // 让浏览器先完成松手与原始点击的派发，再切换正文。
    requestAnimationFrame(() => {
      if (!slide.root) return;
      const accepted = choose(target.index);
      if (accepted instanceof Promise) {
        void accepted.then(result => {
          if (result === false && !slide.gesture) settle(slide, selectedSlot(slide));
        }, () => {
          if (!slide.gesture) settle(slide, selectedSlot(slide));
        });
      }
    });
  }

  function pointerCancel(event: PointerEvent<HTMLElement>) {
    const slide = slideRef.current;
    if (slide.gesture?.id === event.pointerId) restore(slide);
  }

  return {
    ref: (node: HTMLElement | null) => { slideRef.current.root = node; },
    onPointerDown: pointerDown,
    onPointerMove: pointerMove,
    onPointerUp: pointerUp,
    onPointerCancel: pointerCancel,
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
      // 触屏从子按钮移交到容器时，子按钮的丢失事件也会冒泡。
      if (event.target === event.currentTarget) pointerCancel(event);
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      if (!slideRef.current.gesture?.dragging) pointerCancel(event);
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      const slide = slideRef.current;
      if (!slide.suppressClick || event.detail === 0) return;
      slide.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
