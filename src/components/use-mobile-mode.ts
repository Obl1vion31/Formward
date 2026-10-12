"use client";
import { useSyncExternalStore } from "react";

export const MOBILE_MEDIA = "(max-width: 700px), (hover: none) and (pointer: coarse)";
function subscribe(changed: () => void) {
  const media = window.matchMedia(MOBILE_MEDIA);
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
}
const read = () => window.matchMedia(MOBILE_MEDIA).matches;
const server = () => null;

// null 表示服务器尚不知道设备，避免 hydration 使用不一致的 HTML。
export function useMobileMode(): boolean | null {
  return useSyncExternalStore(subscribe, read, server);
}
