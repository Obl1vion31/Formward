const reducedMotion = "(prefers-reduced-motion: reduce)";
export const localMotionEasing = "cubic-bezier(.2,.72,.26,1)";

export function permitsLocalMotion() {
  return !matchMedia(reducedMotion).matches;
}

export function localTargetVisible(node: HTMLElement) {
  if (!node.isConnected || document.hidden || node.closest("[hidden]")) return false;
  const rect = node.getBoundingClientRect();
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop ?? 0;
  const bottom = top + (viewport?.height ?? window.innerHeight);
  const panel = node.closest("dialog")?.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > Math.max(top, panel?.top ?? top)
    && rect.top < Math.min(bottom, panel?.bottom ?? bottom) && rect.right > 0 && rect.left < window.innerWidth;
}

const highlights = new WeakMap<HTMLElement, Animation>();

/** 反馈对应已经画出的真实行或读数，浏览和读取期间不会自动重放。 */
export function highlightLocalChange(node: HTMLElement, reason: "food" | "saved") {
  if (node.closest("[inert]") || !localTargetVisible(node) || typeof node.animate !== "function") return false;
  highlights.get(node)?.cancel();
  const color = getComputedStyle(node).backgroundColor;
  const warm = "color-mix(in srgb, var(--gold) 15%, " + color + ")";
  const animated = permitsLocalMotion();
  const animation = node.animate(animated
    ? [{ backgroundColor: warm }, { backgroundColor: warm, offset: .25 }, { backgroundColor: color }]
    : [{ backgroundColor: warm }, { backgroundColor: warm }],
  { duration: animated ? 360 : 400, easing: animated ? localMotionEasing : "linear" });
  highlights.set(node, animation);
  node.dataset.localFeedback = reason;
  const finish = () => {
    if (highlights.get(node) !== animation) return;
    highlights.delete(node);
    delete node.dataset.localFeedback;
  };
  void animation.finished.then(finish, finish);
  return true;
}
