"use client";

import { createContext, useContext, useEffect, useState } from "react";

type LoadingController = { set: (id: symbol, label: string | null) => void };
export const LoadingContext = createContext<LoadingController | null>(null);
export const LoadingVisibleContext = createContext(false);

// 每个操作拥有独立标识；结束、出错、卸载只清理自己的状态。
export function usePageLoading({ active, label }: { active: boolean; label: string }) {
  const controller = useContext(LoadingContext);
  const [id] = useState(() => Symbol("page-loading"));
  useEffect(() => { controller?.set(id, active ? label : null); }, [controller, id, active, label]);
  useEffect(() => () => { controller?.set(id, null); }, [controller, id]);
}
