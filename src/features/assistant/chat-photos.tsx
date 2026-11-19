"use client";

/* eslint-disable @next/next/no-img-element -- 会话原图在请求时校验账号归属。 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from "react";
import { lockPageScroll } from "@/components/scroll-lock";
import { createWorkspaceExchange, orderedDirection } from "@/components/workspace-motion";
import { Glyph } from "./chat-icon";
import styles from "./chat.module.css";

export type ChatPhotoPreviews = {
  phase: "sending" | "accepted" | "error";
  photos: { id?: string; preview?: string }[];
};
type Photo = { id: string; local?: string };
const photoUrl = (id: string) => "/api/meal-images/" + encodeURIComponent(id);

function MessagePhoto({ photo, confirmed, decorative, onHandoff }: {
  photo: Photo;
  confirmed: boolean;
  decorative?: boolean;
  onHandoff?: (id: string) => void;
}) {
  const { id, local } = photo;
  const alt = decorative ? "" : "本条消息的私有照片";
  return <>
    {local && <img key="preview" src={local} alt={alt} draggable={false}/>}
    {(!local || confirmed) && <img key="remote" src={photoUrl(id)} alt={local ? "" : alt} draggable={false}
      loading={local ? undefined : "lazy"} className={local ? styles.photoHandoff : undefined} onLoad={event => {
        if (!local) return;
        const image = event.currentTarget;
        void image.decode().then(() => {
          if (image.isConnected) onHandoff?.(id);
        }).catch(() => {});
      }}/>}
  </>;
}

type PhotoSlide = { key: string; source: string; index: number };

function PreviewImage({ slide, requested, visible, frame, onRead }: {
  slide: PhotoSlide;
  requested: boolean;
  visible: boolean;
  frame: "current" | "previous" | "reading";
  onRead: (slide: PhotoSlide, loaded: boolean) => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const node = image.current;
    if (!requested || !node) return;
    let reading = true;
    // 等到像素已解码，覆盖浏览器从内存直接复用原图的情况。
    void node.decode().then(
      () => { if (reading) onRead(slide, true); },
      () => { if (reading) onRead(slide, false); },
    );
    return () => { reading = false; };
  }, [requested, slide, onRead]);
  return <img ref={image} src={slide.source} alt={"第 " + (slide.index + 1) + " 张照片"}
    data-ready={visible} data-photo-frame={frame} aria-hidden={frame !== "current" || undefined} draggable={false}/>;
}

function PhotoViewer({ photos, confirmed, trigger, close }: {
  photos: Photo[];
  confirmed: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const exchange = useMemo(() => createWorkspaceExchange(), []);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const [selection, setSelection] = useState({ index: 0, attempt: 0 });
  const [display, setDisplay] = useState<{ shown: PhotoSlide | null; previous: PhotoSlide | null }>({
    shown: null, previous: null,
  });
  const [notice, setNotice] = useState<{ key: string; error: boolean } | null>(null);
  const { index, attempt } = selection;
  const photo = photos[index];
  const base = !confirmed && photo.local ? photo.local : photoUrl(photo.id);
  const source = attempt && base.startsWith("/") ? base + "?retry=" + attempt : base;
  const selected = useMemo(() => ({ source, index, key: index + ":" + attempt + ":" + source }), [source, index, attempt]);
  const currentNotice = notice?.key === selected.key ? notice : null;
  const { shown, previous } = display;
  const ready = shown?.key === selected.key;
  const failed = currentNotice?.error === true;
  const countIndex = failed ? index : shown?.index ?? index;
  const slides = [selected];
  if (shown && !ready) slides.unshift(shown);
  if (previous && previous.key !== selected.key) slides.unshift(previous);
  const onRead = useCallback((slide: PhotoSlide, loaded: boolean) => {
    if (loaded) setDisplay(value => ({
      shown: slide,
      previous: value.shown?.index !== slide.index ? value.shown : null,
    }));
    else setNotice({ key: slide.key, error: true });
  }, []);
  useEffect(() => {
    if (ready || failed) return;
    const timer = window.setTimeout(() => setNotice(value => value?.key === selected.key && value.error
      ? value : { key: selected.key, error: false }), 350);
    return () => window.clearTimeout(timer);
  }, [ready, failed, selected.key]);
  useLayoutEffect(() => {
    if (!shown || !previous) {
      exchange.stop();
      return;
    }
    const incoming = stage.current?.querySelector<HTMLElement>('[data-photo-frame="current"]');
    const outgoing = stage.current?.querySelector<HTMLElement>('[data-photo-frame="previous"]');
    if (!incoming || !outgoing) return;
    exchange.play(incoming, outgoing, orderedDirection(previous.index, shown.index), () => {
      setDisplay(value => value.shown === shown && value.previous === previous ? { ...value, previous: null } : value);
    });
  }, [shown, previous, exchange]);
  useLayoutEffect(() => exchange.stop, [exchange]);
  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const origin = trigger.current;
    const unlock = lockPageScroll();
    node.showModal();
    return () => {
      node.close();
      unlock();
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, [trigger]);

  function changePhoto(delta: number) {
    const next = Math.max(0, Math.min(photos.length - 1, index + delta));
    if (next === index) return;
    setNotice(null);
    setSelection({ index: next, attempt: 0 });
  }
  function finishSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    swipe.current = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.25) changePhoto(dx < 0 ? 1 : -1);
  }

  return <dialog ref={dialog} className={styles.photoViewer} aria-label="照片预览"
    onCancel={event => {
      event.preventDefault();
      event.stopPropagation();
      close();
    }}
    onKeyDown={event => {
      if (event.key === "Escape") event.stopPropagation();
      const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (!delta) return;
      event.preventDefault();
      changePhoto(delta);
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }}>
    <header className={styles.photoViewerHeader}>
      <span aria-live="polite" aria-atomic="true" aria-label={"第 " + (countIndex + 1) + " 张，共 " + photos.length + " 张"}>
        {countIndex + 1} / {photos.length}
      </span>
      <button className={styles.icon} type="button" aria-label="关闭照片预览" onClick={close}><Glyph name="close"/></button>
    </header>
    <div ref={stage} className={styles.photoStage} onPointerDown={event => {
      if (event.isPrimary && event.pointerType === "touch") {
        swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }
    }} onPointerUp={finishSwipe} onPointerCancel={() => { swipe.current = null; }}>
      {slides.map(slide => {
        const frame = slide.key === shown?.key ? "current" : slide.key === previous?.key ? "previous" : "reading";
        return <PreviewImage key={slide.key} slide={slide} frame={frame}
          requested={!ready && !failed && slide.key === selected.key}
          visible={!failed && frame !== "reading"} onRead={onRead}/>;
      })}
      {!ready && currentNotice && (failed ? <div className={styles.photoReadError}>
        <p role="status">这张照片读取失败。</p>
        <button type="button" onClick={() => {
          setNotice(null);
          setSelection(value => ({ ...value, attempt: value.attempt + 1 }));
        }}>重新读取</button>
      </div> : <p role="status" className={shown ? styles.photoReadNotice : undefined}>正在读取照片…</p>)}
    </div>
    <footer className={styles.photoViewerControls}>
      <button className={styles.icon} type="button" aria-label="上一张" disabled={index === 0} onClick={() => changePhoto(-1)}><Glyph name="chevron"/></button>
      <button className={styles.icon} type="button" aria-label="下一张" disabled={index === photos.length - 1} onClick={() => changePhoto(1)}><Glyph name="chevron"/></button>
    </footer>
  </dialog>;
}

export function ChatPhotos({ ids, previews, onHandoff }: {
  ids: string[];
  previews?: ChatPhotoPreviews;
  onHandoff?: (id: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const photos = ids.map(id => ({ id, local: previews?.photos.find(photo => photo.id === id)?.preview }));
  const confirmed = !previews || previews.phase === "accepted";
  const first = photos[0];
  if (!first) return null;
  if (photos.length === 1) return <div className={styles.images}>
    <a href={!confirmed && first.local ? first.local : photoUrl(first.id)} target="_blank" rel="noreferrer">
      <MessagePhoto photo={first} confirmed={confirmed} onHandoff={onHandoff}/>
    </a>
  </div>;

  return <>
    <button type="button" ref={trigger} className={styles.photoStack} aria-haspopup="dialog"
      aria-label={"查看 " + photos.length + " 张照片"} data-photo-stack={photos.length}
      style={{ "--photo-count": photos.length } as CSSProperties} onClick={() => setOpen(true)}>
      {photos.map((photo, index) => <span key={photo.id} className={styles.photoLayer} aria-hidden="true"
        data-photo-layer={index + 1} style={{ "--photo-index": index } as CSSProperties}>
        <MessagePhoto photo={photo} confirmed={confirmed} decorative onHandoff={onHandoff}/>
      </span>)}
      <span className={styles.photoStackCount} aria-hidden="true">{photos.length} 张照片<Glyph name="chevron"/></span>
    </button>
    {open && <PhotoViewer photos={photos} confirmed={confirmed} trigger={trigger} close={() => setOpen(false)}/>}
  </>;
}
