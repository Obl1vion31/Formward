import { useLayoutEffect, useRef, type PointerEvent } from "react";
import { Glyph } from "./chat-icon";
import styles from "./surface.module.css";

export type HistoryRowAction = "swipe" | "menu";

type HistoryRowProps = {
  id: string;
  title: string;
  stamp: string;
  action?: HistoryRowAction;
  busy: boolean;
  onAction: (action: HistoryRowAction | null) => void;
  onInspect: () => void;
  onRemove: () => void;
};

const actionWidth = 84;

export function ChatHistoryRow({ id, title, stamp, action, busy, onAction, onInspect, onRemove }: HistoryRowProps) {
  const gesture = useRef<{ pointer: number; x: number; y: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);
  const more = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const swiped = action === "swipe";

  useLayoutEffect(() => {
    if (action === "menu") menu.current?.focus({ preventScroll: true });
  }, [action]);

  function start(event: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.pointerType !== "touch" || !event.isPrimary || event.clientX < 24 ||
        event.clientX > box.right - 10 || (event.target as Element).closest("[data-history-more]")) return;
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    const dx = event.clientX - active.x, dy = Math.abs(event.clientY - active.y);
    if (!active.dragging) {
      if (dy >= 9 && dy > Math.abs(dx)) {
        gesture.current = null;
        return;
      }
      if (Math.abs(dx) < 10 || Math.abs(dx) < dy * 1.25 || (!swiped && dx > 0)) return;
      active.dragging = true;
    }
    const face = event.currentTarget;
    face.dataset.dragging = "true";
    face.style.setProperty("--history-pan", Math.max(-actionWidth, Math.min(0, (swiped ? -actionWidth : 0) + dx)) + "px");
  }

  function finish(event: PointerEvent<HTMLDivElement>, canceled = false) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    gesture.current = null;
    if (!active.dragging) return;
    suppressClick.current = !canceled;
    if (!canceled) {
      const dx = event.clientX - active.x;
      onAction((swiped ? dx < 30 : dx <= -38) ? "swipe" : null);
    }
    delete event.currentTarget.dataset.dragging;
    event.currentTarget.style.removeProperty("--history-pan");
  }

  return <li data-history-row={id} data-action={action} onKeyDown={event => {
    if (event.key !== "Escape" || !action) return;
    event.preventDefault();
    event.stopPropagation();
    onAction(null);
    more.current?.focus({ preventScroll: true });
  }}>
    <div className={styles.historyRowClip}>
      <button type="button" className={styles.historyDeleteRail} disabled={!swiped || busy} aria-hidden={!swiped}
        onClick={onRemove}><Glyph name="trash"/>删除</button>
      <div className={styles.historyRowFace} onPointerDown={start} onPointerMove={move}
        onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
        onLostPointerCapture={event => finish(event, true)} onClickCapture={event => {
          if (!suppressClick.current || !event.detail) return;
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}>
        <button type="button" className={styles.historyRowOpen} data-history-id={id} onClick={onInspect}>
          <strong>{title}</strong><span>{stamp}</span>
        </button>
        <button type="button" className={styles.historyRowMore} data-history-more ref={more}
          aria-label={"更多操作 · " + title} aria-expanded={action === "menu"}
          onClick={() => onAction(action === "menu" ? null : "menu")}><Glyph name="more"/></button>
      </div>
    </div>
    {action === "menu" && <div className={styles.historyRowMenu}>
      <button type="button" ref={menu} disabled={busy} onClick={onRemove}><Glyph name="trash"/>删除</button>
    </div>}
  </li>;
}
