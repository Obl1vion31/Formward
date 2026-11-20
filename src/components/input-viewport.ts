import {MOBILE_MEDIA} from "./use-mobile-mode";

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
