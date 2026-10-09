// 多个模态层共用一次滚动锁；先关闭任意一层都不能释放其他层的锁。
const owners = new Set<symbol>();
let original: { body: HTMLElement; overflow: string; paddingRight: string } | null = null;

export function lockPageScroll() {
  const owner = Symbol("scroll-lock");
  if (!owners.size) {
    const body = document.body;
    original = { body, overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    const width = window.innerWidth - document.documentElement.clientWidth;
    const padding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    if (width > 0) body.style.paddingRight = `${padding + width}px`;
    body.style.overflow = "hidden";
  }
  owners.add(owner);
  return () => {
    if (!owners.delete(owner) || owners.size || !original) return;
    original.body.style.overflow = original.overflow;
    original.body.style.paddingRight = original.paddingRight;
    original = null;
  };
}
