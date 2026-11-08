'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { TrainingTemplate } from './model';
import styles from './training.module.css';

type Drag = { pointerId: number; handle: HTMLButtonElement; row: HTMLElement | null; template: TrainingTemplate; startX: number; startY: number; x: number; y: number; moved: boolean; ghost: HTMLDivElement | null; target: HTMLElement | null; frame: number; previousTime: number };
/** 只由手柄接管触点；正文滚动与按钮保持原生行为。 */
export function useTemplateDrag(disabled: boolean, onDrop: (templateId: string, date: string) => Promise<unknown>) {
  const drag = useRef<Drag | null>(null), latest = useRef({ disabled, onDrop });
  const cancel = useCallback(() => {
    const current = drag.current; drag.current = null; if (!current) return;
    cancelAnimationFrame(current.frame); current.ghost?.remove(); current.target?.removeAttribute('data-training-drop'); current.row?.classList.remove(styles.dragging);
    if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
  }, []);
  useLayoutEffect(() => { latest.current = { disabled, onDrop }; if (disabled) cancel(); }, [disabled, onDrop, cancel]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && drag.current) { event.preventDefault(); cancel(); } };
    const hidden = () => { if (document.visibilityState !== 'visible') cancel(); };
    window.addEventListener('keydown', key); window.addEventListener('blur', cancel); window.addEventListener('resize', cancel); document.addEventListener('visibilitychange', hidden);
    return () => { cancel(); window.removeEventListener('keydown', key); window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel); document.removeEventListener('visibilitychange', hidden); };
  }, [cancel]);
  function targetAt(x: number, y: number) { const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-training-date]'); return cell && !cell.matches(':disabled') ? cell : null; }
  function draw(current: Drag) {
    if (!current.ghost) return;
    const width = current.ghost.offsetWidth, height = current.ghost.offsetHeight;
    current.ghost.style.transform = 'translate3d(' + Math.max(8, Math.min(innerWidth - width - 8, current.x + 16)) + 'px,' + Math.max(8, current.y - height - 18) + 'px,0)';
    const target = targetAt(current.x, current.y);
    if (target !== current.target) { current.target?.removeAttribute('data-training-drop'); current.target = target; target?.setAttribute('data-training-drop', 'true'); }
  }
  function tick(time: number) {
    const current = drag.current; if (!current?.moved) return;
    const seconds = current.previousTime ? Math.min((time - current.previousTime) / 1000, .05) : 0; current.previousTime = time;
    const headerBottom = Math.max(0, document.querySelector('.dashboard-header')?.getBoundingClientRect().bottom ?? 0);
    const viewportHeight = window.visualViewport?.height ?? innerHeight, top = headerBottom + 64, bottom = viewportHeight - 100;
    const speed = current.y < top ? -Math.min(1, (top - current.y) / 64) : current.y > bottom ? Math.min(1, (current.y - bottom) / 64) : 0;
    if (speed) window.scrollBy({ top: speed * 480 * seconds, behavior: 'instant' });
    draw(current); current.frame = requestAnimationFrame(tick);
  }
  function down(event: ReactPointerEvent<HTMLButtonElement>, template: TrainingTemplate) {
    if (latest.current.disabled || drag.current || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    drag.current = { pointerId: event.pointerId, handle: event.currentTarget, row: event.currentTarget.closest('[data-training-template]'), template, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false, ghost: null, target: null, frame: 0, previousTime: 0 };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { cancel(); }
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current; if (!current || event.pointerId !== current.pointerId) return;
    current.x = event.clientX; current.y = event.clientY;
    if (!current.moved && Math.hypot(current.x - current.startX, current.y - current.startY) >= 7) {
      current.moved = true; current.row?.classList.add(styles.dragging);
      const ghost = document.createElement('div'); ghost.className = styles.dragPreview; ghost.textContent = current.template.name; ghost.setAttribute('aria-hidden', 'true'); document.body.append(ghost); current.ghost = ghost; current.frame = requestAnimationFrame(tick);
    }
    if (current.moved) { event.preventDefault(); draw(current); }
  }
  function up(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current; if (!current || event.pointerId !== current.pointerId) return;
    const date = current.moved ? targetAt(event.clientX, event.clientY)?.dataset.trainingDate : undefined, id = current.template.id;
    cancel(); if (date && !latest.current.disabled) void latest.current.onDrop(id, date);
  }
  return (template: TrainingTemplate) => ({ onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => down(event, template), onPointerMove: move, onPointerUp: up, onPointerCancel: cancel, onLostPointerCapture: cancel });
}
