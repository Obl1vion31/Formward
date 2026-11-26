import {INPUT_VIEWPORT_APPLIED, readVisibleViewport} from "./input-viewport";

type Position = {
  width: number | (() => number);
  owner?: HTMLElement;
  avoidHeading?: boolean;
  minHeight?: number;
  maxHeight?: number;
  margin?: number;
  gap?: number;
  align?: "start" | "end";
  horizontalAnchor?: HTMLElement;
  preferAbove?: boolean;
  preferLeft?: boolean;
  onUnavailable?: () => void;
  onPosition?: (box: DOMRect) => void;
};

/** The visual viewport and the actual surface both constrain lifted controls. */
export function readPopoverBounds(owner: HTMLElement | undefined, margin: number, avoidHeading = false) {
  const viewport = readVisibleViewport();
  const rect = owner === document.body ? undefined : owner?.getBoundingClientRect();
  const heading = avoidHeading && rect
    ? owner?.querySelector<HTMLElement>("[data-inspector-heading]")?.getBoundingClientRect()
    : undefined;
  return {
    left: Math.max(viewport.left, rect?.left ?? viewport.left) + margin,
    right: Math.min(viewport.right, rect?.right ?? viewport.right) - margin,
    top: Math.max(Math.max(viewport.top, rect?.top ?? viewport.top) + margin, heading?.bottom ?? -Infinity),
    bottom: Math.min(viewport.bottom, rect?.bottom ?? viewport.bottom) - margin,
  };
}

/** Wait for viewport changes, scroll and size changes to settle into one measurement. */
export function followPopoverAnchor(panel: HTMLElement, trigger: HTMLElement, owner: HTMLElement | undefined, place: () => void) {
  let frame = 0;
  const viewport = window.visualViewport;
  const measure = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    place();
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(panel);
  observer.observe(trigger);
  if (owner) observer.observe(owner);
  // A fixed sheet can move with the keyboard without changing size.
  owner?.addEventListener(INPUT_VIEWPORT_APPLIED, measure);
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  place();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    owner?.removeEventListener(INPUT_VIEWPORT_APPLIED, measure);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("scroll", schedule, true);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
  };
}

/** Keep the floating panel next to the visible trigger, within its usable bounds. */
export function trackPopoverPosition(panel: HTMLElement, trigger: HTMLElement, options: Position) {
  const {owner, avoidHeading, margin = 12, gap = 6, minHeight = 1, maxHeight = Infinity} = options;
  let dismissFrame = 0;
  function place() {
    if (!panel.matches(":popover-open")) return;
    const bounds = readPopoverBounds(owner, margin, avoidHeading);
    const anchor = trigger.getBoundingClientRect();
    const {left, top, right, bottom} = bounds;
    const availableWidth = right - left;
    const above = anchor.top - top - gap;
    const below = bottom - anchor.bottom - gap;
    const width = Math.min(typeof options.width === "function" ? options.width() : options.width, availableWidth);
    const beside = !!options.preferLeft && anchor.left - left >= width + gap;
    const openRoom = beside ? bottom - top : Math.max(above, below);
    if (!anchor.width || anchor.top >= bottom || anchor.bottom <= top ||
      anchor.right <= left || anchor.left >= right || width < 1 || Math.min(openRoom, maxHeight) < minHeight) {
      panel.style.visibility = "hidden";
      if (!dismissFrame) {
        // The entry surface can move one frame after Safari reports the keyboard.
        dismissFrame = requestAnimationFrame(() => {
          if (panel.matches(":popover-open")) place();
        });
      } else {
        cancelAnimationFrame(dismissFrame);
        dismissFrame = 0;
        if (options.onUnavailable) options.onUnavailable();
        else panel.hidePopover();
      }
      return;
    }
    cancelAnimationFrame(dismissFrame);
    dismissFrame = 0;
    panel.style.inlineSize = width + "px";
    const naturalHeight = Math.min(maxHeight, panel.scrollHeight + panel.offsetHeight - panel.clientHeight);
    const opensBelow = !(options.preferAbove && above >= naturalHeight) && (below >= naturalHeight || below >= above);
    const room = Math.min(maxHeight, beside ? bottom - top : opensBelow ? below : above);
    panel.style.maxBlockSize = room + "px";
    const height = panel.getBoundingClientRect().height;
    const horizontal = options.horizontalAnchor?.getBoundingClientRect() ?? anchor;
    const intendedLeft = beside ? horizontal.left - width - gap : options.align === "end" ? horizontal.right - width : horizontal.left;
    const intendedTop = beside ? anchor.top : opensBelow ? anchor.bottom + gap : anchor.top - gap - height;
    panel.style.left = Math.max(left, Math.min(intendedLeft, right - width)) + "px";
    panel.style.top = Math.max(top, Math.min(intendedTop, bottom - height)) + "px";
    panel.style.removeProperty("visibility");
    options.onPosition?.(panel.getBoundingClientRect());
  }
  const stop = followPopoverAnchor(panel, trigger, owner, place);
  return () => {
    stop();
    cancelAnimationFrame(dismissFrame);
    for (const property of ["visibility", "inline-size", "left", "top", "max-block-size"]) {
      panel.style.removeProperty(property);
    }
  };
}
