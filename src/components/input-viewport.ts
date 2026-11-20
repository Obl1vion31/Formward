import {useLayoutEffect, useRef} from "react";
import {MOBILE_MEDIA} from "./use-mobile-mode";

export const INPUT_VIEWPORT_APPLIED = "formward:input-viewport-applied";

export type VisibleViewport = {
  left: number; top: number; right: number; bottom: number;
  width: number; height: number; scale: number;
};

export function readVisibleViewport(): VisibleViewport {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? document.documentElement.clientWidth;
  const height = viewport?.height ?? window.innerHeight;
  return {left, top, right: left + width, bottom: top + height, width, height, scale: viewport?.scale ?? 1};
}

type InputViewport = VisibleViewport & {keyboard: boolean; field: HTMLElement | null};
const editable = [
  "textarea:not(:disabled):not([readonly])",
  "input:is(:not([type]),[type=text],[type=search],[type=email],[type=tel],[type=url],[type=password],[type=number]):not(:disabled):not([readonly])",
  "[contenteditable=true]", "[contenteditable=plaintext-only]", '[contenteditable=""]',
].join(",");

export function observeInputViewport(owner: HTMLElement, apply: (state: InputViewport) => void): () => void {
  const viewport = window.visualViewport;
  const mobile = matchMedia(MOBILE_MEDIA);
  let frame = 0, keyboard = false;
  let restingHeight = Math.max(readVisibleViewport().height, innerHeight);
  let layoutWidth = document.documentElement.clientWidth;

  function update() {
    frame = 0;
    const visible = readVisibleViewport();
    const focused = document.activeElement;
    const field = focused instanceof HTMLElement && owner.contains(focused) && focused.matches(editable) ? focused : null;
    const width = document.documentElement.clientWidth;
    if (width !== layoutWidth) {
      layoutWidth = width;
      restingHeight = Math.max(document.documentElement.clientHeight, innerHeight);
    }
    if (visible.scale === 1 && ((!field && !keyboard) || visible.height > restingHeight)) restingHeight = visible.height;
    // Toolbars can change the viewport without a keyboard. Keep the open state
    // through blur until the actual keyboard transition has finished.
    keyboard = mobile.matches && visible.scale === 1 && (!!field || keyboard)
      && restingHeight - visible.height >= (keyboard ? 8 : 72);
    apply({...visible, field, keyboard});
    owner.dispatchEvent(new Event(INPUT_VIEWPORT_APPLIED));
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  update();
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule);
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  mobile.addEventListener("change", schedule);
  owner.addEventListener("focusin", schedule);
  owner.addEventListener("focusout", schedule);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("scroll", schedule);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    mobile.removeEventListener("change", schedule);
    owner.removeEventListener("focusin", schedule);
    owner.removeEventListener("focusout", schedule);
  };
}

/** Scroll only containers from the field up to its owning surface. */
export function revealFocusedInput(field: HTMLElement, owner: HTMLElement, top: number, bottom: number): void {
  if (bottom <= top || !owner.contains(field)) return;
  for (let scroller = field.parentElement; scroller; scroller = scroller.parentElement) {
    if (scroller.scrollHeight > scroller.clientHeight + 1 && /^(auto|scroll|overlay)$/.test(getComputedStyle(scroller).overflowY)) {
      const surface = scroller.getBoundingClientRect();
      const edgeTop = Math.max(top, surface.top);
      const edgeBottom = Math.min(bottom, surface.bottom);
      const box = field.getBoundingClientRect();
      const gap = edgeBottom - edgeTop;
      if (gap > 0) {
        const delta = box.height > gap || box.top < edgeTop ? box.top - edgeTop : Math.max(0, box.bottom - edgeBottom);
        if (Math.abs(delta) > 1) scroller.scrollTop += delta;
      }
    }
    if (scroller === owner) break;
  }
}

/** Normal pages can scroll the document when a shorter viewport hides the field. */
export function useDocumentInputViewport<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const owner = ref.current;
    if (!enabled || !owner) return;
    let last: {field: HTMLElement; height: number; top: number} | undefined;
    function reset() {
      last = undefined;
      owner?.style.removeProperty("--document-input-space");
    }
    const stop = observeInputViewport(owner, ({field, keyboard, top, bottom, height}) => {
      if (!keyboard) {
        reset();
        return;
      }
      if (!field || field.closest("dialog")) return;
      if (last?.field === field && last.height === height && last.top === top) return;
      last = {field, height, top};
      owner.style.setProperty("--document-input-space", Math.max(0, document.documentElement.clientHeight - height) + "px");
      const box = field.getBoundingClientRect();
      const delta = box.top < top + 12 ? box.top - top - 12 : Math.max(0, box.bottom - bottom + 12);
      if (Math.abs(delta) > 1) window.scrollBy({top: delta, behavior: "instant"});
    });
    return () => { stop(); reset(); };
  }, [enabled]);
  return ref;
}
