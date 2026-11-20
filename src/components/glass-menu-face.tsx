"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import styles from "./glass-menu-face.module.css";

type Pose = Keyframe & { left: string; top: string; width: string; height: string; borderRadius: string };
const active = new WeakMap<HTMLElement, Animation[]>();

function pose(rect: DOMRect, relativeTo: DOMRect, radius: string, inset = 0): Pose {
  return {
    left: rect.left - relativeTo.left + inset + "px",
    top: rect.top - relativeTo.top + inset + "px",
    width: Math.max(0, rect.width - 2 * inset) + "px",
    height: Math.max(0, rect.height - 2 * inset) + "px",
    borderRadius: radius,
  };
}

function clip(box: Pose, panel: DOMRect) {
  return "inset(" + box.top + " "
    + (panel.width - parseFloat(box.left) - parseFloat(box.width)) + "px "
    + (panel.height - parseFloat(box.top) - parseFloat(box.height)) + "px "
    + box.left + " round " + box.borderRadius + ")";
}

export function stopGlassMenuFace(panel: HTMLElement, trigger: HTMLElement) {
  const animations = active.get(panel);
  active.delete(panel);
  animations?.forEach(animation => animation.cancel());
  delete trigger.dataset.glassHandoff;
}

export async function animateGlassMenuFace(panel: HTMLElement, trigger: HTMLElement, direction: "open" | "close") {
  const face = panel.querySelector<HTMLElement>(":scope > [data-glass-face]");
  const content = panel.querySelector<HTMLElement>(":scope > [data-glass-content]");
  if (!face || !content) return true;
  const panelBox = panel.getBoundingClientRect();
  const triggerBox = trigger.getBoundingClientRect();
  const radius = getComputedStyle(panel).borderTopLeftRadius;
  const menuPose = pose(panelBox, panelBox, radius);
  const triggerPose = pose(triggerBox, panelBox, Math.max(0, triggerBox.height / 2 - 4) + "px", 4);
  const previous = active.has(panel);
  const startFace = previous ? pose(face.getBoundingClientRect(), panelBox, getComputedStyle(face).borderTopLeftRadius)
    : direction === "open" ? triggerPose : menuPose;
  const startContent = previous ? getComputedStyle(content).opacity : direction === "open" ? "0" : "1";
  stopGlassMenuFace(panel, trigger);
  trigger.dataset.glassHandoff = "";
  panel.dataset.glassPhase = direction === "open" ? "opening" : "closing";

  function finish() {
    panel.dataset.glassPhase = direction === "open" ? "open" : "closed";
    if (direction === "close") delete trigger.dataset.glassHandoff;
  }

  if (matchMedia("(prefers-reduced-motion: reduce)").matches || typeof face.animate !== "function") {
    finish();
    return true;
  }
  const opening = direction === "open";
  const duration = opening ? 190 : 150;
  const endFace = opening ? menuPose : triggerPose;
  const motion: KeyframeAnimationOptions = {
    duration, easing: opening ? "cubic-bezier(.2,.8,.25,1)" : "cubic-bezier(.52,0,.8,.42)", fill: "both",
  };
  const contours = face.animate([startFace, endFace], motion);
  const clipping = content.animate([{ clipPath: clip(startFace, panelBox) }, { clipPath: clip(endFace, panelBox) }], motion);
  const openingContent = [{ opacity: startContent, offset: 0 }, { opacity: startContent, offset: .22 }, { opacity: 1 }];
  const closingContent = [{ opacity: startContent, offset: 0 }, { opacity: 0, offset: .44 }, { opacity: 0 }];
  const revealing = content.animate(opening ? openingContent : closingContent, { duration, fill: "both" });
  const running = [contours, clipping, revealing];
  active.set(panel, running);
  try {
    await contours.finished;
  } catch {
    return false;
  }
  if (active.get(panel) !== running) return false;
  active.delete(panel);
  finish();
  running.forEach(animation => animation.cancel());
  return true;
}

// RGB 表示距圆角矩形边缘的位移方向，中央保持中性。
function edgeMap() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(size, size);
  const half = size / 2;
  const radius = 12;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = x + .5 - half;
      const b = y + .5 - half;
      const qx = Math.abs(a) - half + radius;
      const qy = Math.abs(b) - half + radius;
      const cx = Math.max(qx, 0);
      const cy = Math.max(qy, 0);
      const length = Math.hypot(cx, cy);
      const distance = radius - length - Math.min(Math.max(qx, qy), 0);
      const envelope = Math.max(0, 1 - Math.abs(distance - 4) / 9);
      const nx = Math.sign(a) * (length ? cx / length : Number(qx >= qy));
      const ny = Math.sign(b) * (length ? cy / length : Number(qy > qx));
      const offset = (y * size + x) * 4;
      image.data[offset] = 128 - nx * envelope * 112;
      image.data[offset + 1] = 128 - ny * envelope * 112;
      image.data[offset + 2] = 128;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

let displacementMap: string | undefined;

export function GlassMenuFace() {
  const id = "glass-edge-" + useId().replace(/[^a-z0-9_-]/gi, "");
  const [map, setMap] = useState("");
  useEffect(() => {
    // WebKit 会接受相同的 CSS 语法，但实际合成仍可能失败。
    const userAgent = navigator.userAgent;
    if (/\b(?:HeadlessChrome|Chrome|Chromium)\/\d/.test(userAgent) && !/\b(?:iPhone|iPad|iPod)\b/.test(userAgent)) {
      const frame = requestAnimationFrame(() => {
        displacementMap ??= edgeMap();
        setMap(displacementMap);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, []);
  return <>
    {map && <svg className={styles.filter} width="0" height="0" aria-hidden="true">
      <defs>
        <filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage href={map} preserveAspectRatio="none" result="edge"/>
          <feDisplacementMap in="SourceGraphic" in2="edge" scale="6" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>
    </svg>}
    <div className={styles.face} aria-hidden="true" data-glass-face data-glass-refraction={map ? "displacement" : "fallback"}
      style={map ? { "--glass-refraction": 'url("#' + id + '")' } as CSSProperties : undefined}/>
  </>;
}
