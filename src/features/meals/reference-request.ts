import { useEffect, useState } from "react";
import type { ReferenceCatalogResult } from "./reference-food";

export function useReferenceRequest(key: string | null, delay = 0) {
  const [cache, setCache] = useState<Map<string, ReferenceCatalogResult>>(() => new Map());
  const [notice, setNotice] = useState<{ request: string; kind: "loading" | "failed" } | null>(null);
  const [more, setMore] = useState<{ key: string; offset: number } | null>(null);
  const [retry, setRetry] = useState(0);
  const offset = key !== null && more?.key === key ? more.offset : 0;
  const request = (key ?? "") + ":" + offset + ":" + retry;
  const data = key === null ? undefined : cache.get(key);

  useEffect(() => {
    if (key === null) return;
    const abort = new AbortController();
    const waiting = setTimeout(() => setNotice({ request, kind: "loading" }), 350);
    const start = setTimeout(async () => {
      try {
        const params = new URLSearchParams(key);
        if (offset) params.set("offset", String(offset));
        const response = await fetch("/api/meal-reference-foods?" + params, { signal: abort.signal });
        if (!response.ok) throw new Error("reference read failed");
        const result = await response.json() as ReferenceCatalogResult;
        if (abort.signal.aborted) return;
        setCache(previous => {
          const next = new Map(previous);
          const first = next.get(key);
          let merged = result;
          if (offset && first) {
            const byId = new Map(first.referenceFoods.map(food => [food.id, food]));
            for (const food of result.referenceFoods) byId.set(food.id, food);
            merged = { ...result, referenceFoods: [...byId.values()] };
          } else if (first && first.matches === result.matches && first.referenceFoods.length > result.referenceFoods.length &&
            result.referenceFoods.every((food, index) => first.referenceFoods[index]?.id === food.id && first.referenceFoods[index]?.version === food.version)) {
            return previous;
          }
          next.delete(key);
          next.set(key, merged);
          if (next.size > 12) next.delete(next.keys().next().value!);
          return next;
        });
        setNotice(current => current?.request === request ? null : current);
      } catch {
        if (!abort.signal.aborted) setNotice({ request, kind: "failed" });
      } finally {
        clearTimeout(waiting);
      }
    }, delay);
    return () => {
      clearTimeout(start);
      clearTimeout(waiting);
      abort.abort();
    };
  }, [key, delay, offset, request]);

  return {
    data, cached: (lookup: string) => cache.get(lookup),
    notice: notice?.request === request && (offset || !data || notice.kind === "failed") ? notice.kind : null,
    load: () => {
      if (key !== null && data?.nextOffset !== undefined) setMore({ key, offset: data.nextOffset });
    },
    retry: () => setRetry(attempt => attempt + 1),
  };
}
