let transition: ViewTransition | null = null;
let animation: Animation | null = null;
let revision = 0;

export function cancelAppearanceReveal() {
  revision++;
  animation?.cancel();
  animation = null;
  transition?.skipTransition();
  transition = null;
  document.documentElement.removeAttribute("data-theme-reveal");
}

/** 只揭示真实的新主题，不复制表单或重新挂载页面。 */
export function revealAppearance(update: () => void, origin?: HTMLElement) {
  const interrupted = transition !== null;
  cancelAppearanceReveal();
  if (!origin?.isConnected || interrupted || !document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  const bounds = origin.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2, y = bounds.top + bounds.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 1;
  const current = ++revision;
  document.documentElement.setAttribute("data-theme-reveal", "");
  try {
    const running = document.startViewTransition(() => { if(current === revision)update(); });
    transition = running;
    void running.ready.then(async () => {
      if (current !== revision) return;
      animation = document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, {
        duration: 450, easing: "cubic-bezier(.4,0,.2,1)", fill: "both", pseudoElement: "::view-transition-new(root)",
      });
      await animation.finished;
    }).catch(() => running.skipTransition());
    void running.finished.catch(() => {}).finally(() => {
      if (current !== revision) return;
      animation?.cancel(); animation = null; transition = null;
      document.documentElement.removeAttribute("data-theme-reveal");
    });
  } catch {
    cancelAppearanceReveal();
    update();
  }
}
