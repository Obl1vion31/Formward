import { useEffect, type RefObject } from "react";

type ScrollGesture = {
  x: number;
  y: number;
  lastY: number;
  axis: "horizontal" | "vertical" | null;
  scroller: HTMLElement | null;
};

export function useComposerScrollBoundary(ref: RefObject<HTMLDivElement | null>, onVerticalDrag?: () => void) {
  useEffect(() => {
    const composer = ref.current;
    if (!composer || !onVerticalDrag) return;

    let gesture: ScrollGesture | null = null;
    function start(event: TouchEvent) {
      gesture = null;
      if (event.touches.length !== 1 || !(event.target instanceof Element)) return;
      const { clientX: x, clientY: y } = event.touches[0];
      const scroller = event.target.closest<HTMLElement>("textarea, [data-chat-composer-extras]");
      gesture = { x, y, lastY: y, axis: null, scroller };
    }

    function move(event: TouchEvent) {
      if (!gesture || event.touches.length !== 1) return;
      const { clientX, clientY } = event.touches[0];
      if (!gesture.axis) {
        const x = Math.abs(clientX - gesture.x), y = Math.abs(clientY - gesture.y);
        if (Math.max(x, y) < 8) return;
        gesture.axis = y > x ? "vertical" : "horizontal";
      }
      if (gesture.axis !== "vertical") return;

      onVerticalDrag?.();
      const delta = gesture.lastY - clientY;
      gesture.lastY = clientY;
      if (!event.cancelable || !delta) return;

      // 让浏览器在起手处原生滚动。该区域已到边界时，才取消继续拖动的默认行为。
      const node = gesture.scroller;
      const canScroll = node && (delta < 0
        ? node.scrollTop > 1
        : node.scrollHeight - node.clientHeight - node.scrollTop > 1);
      if (!canScroll) event.preventDefault();
    }

    function finish() { gesture = null; }

    composer.addEventListener("touchstart", start, { passive: true });
    composer.addEventListener("touchmove", move, { passive: false });
    composer.addEventListener("touchend", finish, { passive: true });
    composer.addEventListener("touchcancel", finish, { passive: true });
    return () => {
      composer.removeEventListener("touchstart", start);
      composer.removeEventListener("touchmove", move);
      composer.removeEventListener("touchend", finish);
      composer.removeEventListener("touchcancel", finish);
    };
  }, [ref, onVerticalDrag]);
}
