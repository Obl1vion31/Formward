type Position = { width: number; maxHeight?: number; align?: "start" | "end"; preferAbove?: boolean };

/** Keep a native popover within the visible viewport, attached to its trigger. */
export function trackPopoverPosition(panel: HTMLElement, trigger: HTMLElement, options: Position) {
  function place() {
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? document.documentElement.clientWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const margin = 12;
    const gap = 6;
    const leftEdge = viewportLeft + margin;
    const topEdge = viewportTop + margin;
    const rightEdge = viewportLeft + viewportWidth - margin;
    const bottomEdge = viewportTop + viewportHeight - margin;
    const box = trigger.getBoundingClientRect();
    const width = Math.min(options.width, rightEdge - leftEdge);
    const left = options.align === "end" ? box.right - width : box.left;

    panel.style.inlineSize = width + "px";
    panel.style.left = Math.max(leftEdge, Math.min(left, rightEdge - width)) + "px";

    const below = bottomEdge - box.bottom - gap;
    const above = box.top - topEdge - gap;
    const contentHeight = Math.min(panel.scrollHeight + 2, options.maxHeight ?? Infinity);
    const preferAbove = options.preferAbove && above >= contentHeight;
    const opensBelow = !preferAbove && (below >= contentHeight || below >= above);
    const room = Math.max(0, opensBelow ? below : above);
    panel.style.maxBlockSize = Math.min(options.maxHeight ?? Infinity, room) + "px";
    const height = panel.getBoundingClientRect().height;
    const top = opensBelow ? box.bottom + gap : box.top - gap - height;
    panel.style.top = Math.max(topEdge, Math.min(top, bottomEdge - height)) + "px";
  }

  place();
  const resize = new ResizeObserver(place);
  resize.observe(trigger);
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  window.visualViewport?.addEventListener("resize", place);
  window.visualViewport?.addEventListener("scroll", place);
  return () => {
    resize.disconnect();
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    window.visualViewport?.removeEventListener("resize", place);
    window.visualViewport?.removeEventListener("scroll", place);
  };
}
