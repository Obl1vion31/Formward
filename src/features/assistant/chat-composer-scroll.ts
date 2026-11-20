import { useEffect, type RefObject } from "react";

type ScrollGesture = {
  x: number;
  y: number;
  vertical: HTMLElement | null;
  photos: HTMLElement | null;
};

export function useComposerScrollBoundary(ref: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const composer = ref.current;
    if (!composer || !enabled) return;

    let gesture: ScrollGesture | null = null;
    function start(event: TouchEvent) {
      gesture = null;
      if (event.touches.length !== 1 || !(event.target instanceof Element)) return;
      const { clientX: x, clientY: y } = event.touches[0];
      gesture = {
        x, y,
        vertical: event.target.closest<HTMLElement>("textarea, [data-chat-composer-extras]"),
        photos: event.target.closest<HTMLElement>("[data-chat-composer-photos]"),
      };
    }

    function move(event: TouchEvent) {
      if (!gesture || event.touches.length !== 1) return;
      const { clientX, clientY } = event.touches[0];
      const dx = gesture.x - clientX, dy = gesture.y - clientY;
      gesture.x = clientX;
      gesture.y = clientY;
      if (!event.cancelable || (!dx && !dy)) return;

      // 起手区域保持不变，后续手势换方向时重新检查该区域在当前方向的滚动空间。
      const horizontal = gesture.photos && Math.abs(dx) > Math.abs(dy);
      const scroller = horizontal ? gesture.photos : gesture.vertical;
      const delta = horizontal ? dx : dy;
      if (scroller && delta) {
        const position = horizontal ? scroller.scrollLeft : scroller.scrollTop;
        const maximum = horizontal
          ? scroller.scrollWidth - scroller.clientWidth
          : scroller.scrollHeight - scroller.clientHeight;
        if (delta < 0 ? position > 1 : maximum - position > 1) return;
      }
      event.preventDefault();
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
  }, [ref, enabled]);
}
