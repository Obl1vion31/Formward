import { useEffect, type RefObject } from "react";

type ScrollGesture = {
  x: number;
  y: number;
  draft: {
    field: HTMLTextAreaElement;
    selectionStart: number;
    selectionEnd: number;
    dragging: boolean;
  } | null;
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
      const field = event.target.closest("textarea");
      gesture = {
        x, y,
        draft: field ? {
          field,
          selectionStart: field.selectionStart,
          selectionEnd: field.selectionEnd,
          dragging: false,
        } : null,
        vertical: event.target.closest<HTMLElement>("[data-chat-composer-extras], [data-chat-composer-notices]"),
        photos: event.target.closest<HTMLElement>("[data-chat-composer-photos]"),
      };
    }

    function move(event: TouchEvent) {
      if (!gesture || event.touches.length !== 1) return;
      const { clientX, clientY } = event.touches[0];
      const dx = gesture.x - clientX, dy = gesture.y - clientY;
      const draft = gesture.draft;
      if (draft) {
        const { field } = draft;
        if (!draft.dragging) {
          const selecting = field.selectionStart !== field.selectionEnd &&
            (field.selectionStart !== draft.selectionStart || field.selectionEnd !== draft.selectionEnd);
          if (selecting || Math.abs(dy) < 4) return;
          draft.dragging = true;
        }
        gesture.y = clientY;
        if (event.cancelable) event.preventDefault();
        // 起手和反向拖动都只更新编辑框。到边界后也不把本次手势交给页面。
        const end = Math.max(0, field.scrollHeight - field.clientHeight);
        field.scrollTop = Math.max(0, Math.min(end, field.scrollTop + dy));
        return;
      }

      gesture.x = clientX;
      gesture.y = clientY;
      if (!event.cancelable || (!dx && !dy)) return;

      // 附件横移及补充内容纵移保持浏览器滚动，起手区域的滚动到边界即止。
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
