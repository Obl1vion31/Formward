// 多个模态层共用一次滚动锁；先关闭任意一层都不能释放其他层的锁。
const owners = new Set<symbol>();
let original: { body: HTMLElement; root: HTMLElement; overflow: string; rootOverflow: string; paddingRight: string } | null = null;

let fixedOrigin: { x: number; y: number; styles: string[]; overscroll: string } | null = null;
const fixedProperties = ["position", "top", "left", "right", "width"] as const;

export function lockPageScroll(mode: "overflow" | "fixed" = "overflow") {
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
  if (mode === "fixed" && !fixedOrigin) {
    const { body, documentElement: root } = document;
    const x = window.scrollX, y = window.scrollY;
    fixedOrigin = { x, y, styles: fixedProperties.map(property => body.style[property]), overscroll: root.style.overscrollBehavior };
    Object.assign(body.style, { position: "fixed", top: -y + "px", left: -x + "px", right: "auto", width: "100%" });
    root.style.overscrollBehavior = "none";
  }
  owners.add(owner);
  return () => {
    if (!owners.delete(owner) || owners.size || !original) return;
    original.body.style.overflow = original.overflow;
    original.root.style.overflow = original.rootOverflow;
    original.body.style.paddingRight = original.paddingRight;
    if (fixedOrigin) {
      const { x, y, styles, overscroll } = fixedOrigin;
      fixedProperties.forEach((property, index) => { original!.body.style[property] = styles[index]; });
      original.root.style.overscrollBehavior = overscroll;
      fixedOrigin = null;
      window.scrollTo({ left: x, top: y, behavior: "instant" });
    }
    original = null;
  };
}
