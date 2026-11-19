// 多个模态层共用一次滚动锁；先关闭任意一层都不能释放其他层的锁。
const owners = new Set<symbol>();
let original: { body: HTMLElement; root: HTMLElement; overflow: string; rootOverflow: string; paddingRight: string } | null = null;

export function lockPageScroll() {
  const owner = Symbol("scroll-lock");
  if (!owners.size) {
    const body = document.body, root = document.documentElement;
    original = { body, root, overflow: body.style.overflow, rootOverflow: root.style.overflow, paddingRight: body.style.paddingRight };
    const before = body.getBoundingClientRect().width;
    const padding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    const released = Math.max(0, body.getBoundingClientRect().width - before);
    if (released > 0) body.style.paddingRight = `${padding + released}px`;
  }
  owners.add(owner);
  return () => {
    if (!owners.delete(owner) || owners.size || !original) return;
    original.body.style.overflow = original.overflow;
    original.root.style.overflow = original.rootOverflow;
    original.body.style.paddingRight = original.paddingRight;
    original = null;
  };
}
