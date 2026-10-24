"use client";
import { createContext, useContext, useEffect } from "react";

export type DraftState = { dirty: boolean; busy: boolean };
export const DraftCloseContext = createContext<(() => void) | null>(null);
export const DraftGuardContext = createContext<((state: DraftState) => () => void) | null>(null);

/** 仅登记当前弹窗内尚未提交的输入，不在浏览器存储健康数据。 */
export function useDraftGuard(dirty: boolean, busy = false) {
  const register = useContext(DraftGuardContext);
  useEffect(() => register?.({ dirty, busy }), [register, dirty, busy]);
}

/** 子表单的放弃按钮与弹窗关闭、Escape、遮罩使用同一保护。 */
export function useDraftClose(fallback: () => void) {
  return useContext(DraftCloseContext) ?? fallback;
}
