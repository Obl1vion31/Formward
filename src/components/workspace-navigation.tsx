"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { workspacePages } from "./workspace-pages";
import { workspaceCacheKey } from "@/features/dashboard/workspace-cache-state";

type Arrival = { path: string; query: string; href: string; key: string };
const ArrivalContext = createContext<Arrival | null>(null);
const PrepareContext = createContext<(href: string) => void>(() => {});
const isWorkspace = (path: string) => workspacePages.some(([href]) => href === path);

export const useWorkspaceArrival = () => useContext(ArrivalContext);
export const usePrepareWorkspace = () => useContext(PrepareContext);

/** 先安放目标工作区，Next 路由仍负责提交地址和实际页面。 */
export function WorkspaceNavigationProvider({ children }: { children: ReactNode }) {
  const path = usePathname(), query = useSearchParams().toString();
  const key = workspaceCacheKey(path, query);
  const [request, setRequest] = useState<Arrival | null>(null);
  const pending = request && request.key !== key && isWorkspace(path) ? request : null;
  const prepare = useCallback((href: string, history = false) => {
    const url = new URL(href, window.location.href);
    if (url.origin !== location.origin || !isWorkspace(url.pathname) || !isWorkspace(path) ||
        url.pathname === path && (!history || workspaceCacheKey(url.pathname, url.search) === key)) {
      setRequest(null);
      return;
    }
    setRequest({ path: url.pathname, query: url.searchParams.toString(), href: url.pathname + url.search, key: workspaceCacheKey(url.pathname, url.search) });
  }, [key, path]);
  useEffect(() => {
    if (request && !pending) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRequest(null);
    }
    const restore = () => prepare(location.href, true);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [pending, prepare, request]);
  return <PrepareContext value={prepare}><ArrivalContext value={pending}>{children}</ArrivalContext></PrepareContext>;
}
