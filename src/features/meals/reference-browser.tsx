"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createWorkspaceExchange, createWorkspaceMotion } from "@/components/workspace-motion";
import { FoodArt } from "./food-art";
import type { ItemDraft } from "./model";
import { ReferenceDetails } from "./reference-details";
import { referenceFoodName, referenceSections, referenceStateLabel, type ReferenceCatalogResult, type ReferenceFamily, type ReferenceFood } from "./reference-food";
import styles from "./reference-library.module.css";

type Section = (typeof referenceSections)[number];
type ScrollPoint = { element: HTMLElement | null; top: number };
type Selection = { food: ReferenceFood; key: string; visit: number; open: boolean; order: number };
export type FoodLibraryScope = "reference" | "personal";

export function FoodLibraryTabs({ scope, change }: { scope: FoodLibraryScope; change: (scope: FoodLibraryScope) => void }) {
  return <div className={styles.tabs} role="group" aria-label="食材库范围">
    <button type="button" aria-pressed={scope === "reference"} onClick={() => change("reference")}>公共参考</button>
    <button type="button" aria-pressed={scope === "personal"} onClick={() => change("personal")}>我的食材</button>
  </div>;
}

function Chevron({ disclosure = false }: { disclosure?: boolean }) {
  return <svg className={styles.rowEnd} data-reference-chevron={disclosure || undefined} width="12" height="14"
    viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
    <path d="m4 3 4 4-4 4"/>
  </svg>;
}

function Fold({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  return <div id={id} className={styles.fold} data-reference-fold={open ? "open" : "closed"} inert={!open}>
    <div className={styles.foldBody}>{children}</div>
  </div>;
}

function scrollPoint(node: HTMLElement): ScrollPoint {
  const element = node.closest<HTMLElement>("[data-reference-scroll], dialog");
  return { element, top: element?.scrollTop ?? window.scrollY };
}

function restoreScroll(point: ScrollPoint) {
  if (point.element) point.element.scrollTop = point.top;
  else window.scrollTo({ top: point.top, behavior: "instant" });
}

function useReferenceRequest(key: string | null, delay = 0) {
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

function RequestStatus({ result }: { result: ReturnType<typeof useReferenceRequest> }) {
  if (!result.notice) return null;
  return <div className={styles.message}>
    {result.notice === "loading" ? <p role="status">正在查找食材…</p> :
      <><p role="alert">食材未加载</p><button type="button" onClick={result.retry}>重试</button></>}
  </div>;
}

function MoreResults({ result }: { result: ReturnType<typeof useReferenceRequest> }) {
  return result.data?.nextOffset !== undefined && result.notice !== "failed"
    ? <button type="button" className={styles.more} onClick={result.load} disabled={result.notice === "loading"}>加载更多食材</button>
    : null;
}

function FoodRows({ rows, active, detailId, open }: {
  rows: ReferenceFood[]; active: ReferenceFood | null; detailId: string;
  open: (food: ReferenceFood, trigger: HTMLButtonElement) => void;
}) {
  if (!rows.length) return null;
  return <ul className={styles.foodRows}>
    {rows.map(food => <li key={food.id} data-reference-result>
      <button type="button" aria-label={referenceFoodName(food) + "详情"} aria-expanded={active?.id === food.id}
        aria-controls={active?.id === food.id ? detailId : undefined} onClick={event => open(food, event.currentTarget)}>
        <FoodArt illustration={food.illustration}/>
        <span className={styles.rowName}>{referenceFoodName(food)}</span>
        <span className={styles.rowReading}>{food.portions[0]
          ? "1" + food.portions[0].unit + "约 " + Number(food.portions[0].edibleGrams) + " g"
          : "按可食克数"}</span>
        <Chevron/>
      </button>
    </li>)}
  </ul>;
}

export function ReferenceBrowser({ query, search, searchRef, enabled, disabled, pickerVisit, onAdd, onManual, onDetailBack, externalBack }: {
  query: string;
  search: (query: string) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  enabled: boolean;
  disabled?: boolean;
  pickerVisit?: number;
  onAdd?: (item: ItemDraft, food: ReferenceFood) => void;
  onManual?: (name: string) => void;
  onDetailBack?: (back: ((restoreFocus?: boolean) => void) | null) => void;
  externalBack?: boolean;
}) {
  const [section, setSection] = useState<Section["id"] | null>(null);
  const [family, setFamily] = useState<ReferenceFamily | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [split, setSplit] = useState(false);
  const [move, setMove] = useState<{ direction: 1 | -1; top: number } | null>(null);
  const id = useId();
  const localSearch = useRef<HTMLInputElement>(null);
  const input = searchRef ?? localSearch;
  const root = useRef<HTMLDivElement>(null);
  const listPane = useRef<HTMLDivElement>(null);
  const detailPane = useRef<HTMLDivElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const origin = useRef<(ScrollPoint & { button: HTMLButtonElement }) | null>(null);
  const browseOrigin = useRef<ScrollPoint | null>(null);
  const order = useRef(0);
  const focusFrame = useRef(0);
  const detailExchange = useMemo(() => createWorkspaceExchange(), []);
  const splitMotion = useMemo(() => createWorkspaceMotion(), []);
  const picker = pickerVisit !== undefined;
  const visit = pickerVisit ?? 0;
  const term = query.trim();
  const browsedFamily = referenceSections.find(group => group.id === section)?.families.some(item => item.id === family) ? family : null;
  const key = term ? "q=" + encodeURIComponent(term) : browsedFamily ? "family=" + browsedFamily : "";
  const active = selection?.open && selection.key === key && selection.visit === visit ? selection.food : null;
  const summary = useReferenceRequest(enabled ? "view=summary" : null);
  const result = useReferenceRequest(enabled && key ? key : null, term ? 120 : 0);
  const detailId = id + "-reference-detail";
  const showDetail = active || move && selection?.food;

  useLayoutEffect(() => {
    const browser = root.current;
    if (!browser || picker) return;
    const desktop = matchMedia("(min-width: 701px) and (pointer: fine)");
    const measure = () => setSplit(desktop.matches && browser.clientWidth >= 760);
    const observer = new ResizeObserver(measure);
    observer.observe(browser);
    desktop.addEventListener("change", measure);
    measure();
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", measure);
    };
  }, [picker]);

  const close = useCallback((restoreFocus = true) => {
    cancelAnimationFrame(focusFrame.current);
    splitMotion.stop();
    setSelection(current => current?.open ? { ...current, open: false } : current);
    const from = origin.current;
    const detail = detailPane.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMove(!split && detail && !reduced ? { direction: -1, top: detail.getBoundingClientRect().top } : null);
    focusFrame.current = requestAnimationFrame(() => {
      // Only the original visible list can own focus after returning from detail.
      if (from?.button.isConnected && !from.button.closest("[inert]")) {
        restoreScroll(from);
        if (restoreFocus) from.button.focus({ preventScroll: true });
      }
      if (split && listPane.current && restoreFocus) splitMotion.play(listPane.current, -1, { distance: 12, reduced });
    });
  }, [split, splitMotion]);

  useLayoutEffect(() => {
    onDetailBack?.(enabled && active ? close : null);
    return () => onDetailBack?.(null);
  }, [onDetailBack, close, enabled, active]);

  useLayoutEffect(() => {
    if (!move || split || !listPane.current || !detailPane.current) {
      detailExchange.stop();
      return;
    }
    const forward = move.direction === 1;
    const enter = forward ? detailPane.current : listPane.current;
    const leave = forward ? listPane.current : detailPane.current;
    if (forward) {
      const scroller = scrollPoint(enter).element;
      const top = root.current?.getBoundingClientRect().top;
      if (scroller?.hasAttribute("data-reference-scroll")) scroller.scrollTop = 0;
      else if (scroller && top !== undefined && top < scroller.getBoundingClientRect().top) {
        enter.scrollIntoView({ block: "start", behavior: "instant" });
      }
    } else if (origin.current) {
      restoreScroll(origin.current);
    }
    const stageTop = enter.parentElement?.getBoundingClientRect().top ?? 0;
    leave.style.setProperty("--reference-exit-offset", (move.top - stageTop) + "px");
    detailExchange.play(enter, leave, move.direction, () => setMove(current => current === move ? null : current));
  }, [detailExchange, move, split]);
  useLayoutEffect(() => () => {
    cancelAnimationFrame(focusFrame.current);
    detailExchange.stop();
    splitMotion.stop();
  }, [detailExchange, splitMotion]);

  function open(food: ReferenceFood, button: HTMLButtonElement) {
    if (active?.id === food.id) { close(); return; }
    cancelAnimationFrame(focusFrame.current);
    origin.current = { ...scrollPoint(button), button };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = listPane.current?.getBoundingClientRect().top ?? 0;
    setMove(split || reduced ? null : { direction: 1, top });
    setSelection({ food, key, visit, open: true, order: ++order.current });
    focusFrame.current = requestAnimationFrame(() => {
      const heading = detailHeading.current;
      if (reduced && !split && heading) {
        const scroller = scrollPoint(heading).element;
        if (scroller?.hasAttribute("data-reference-scroll")) scroller.scrollTop = 0;
        else heading.scrollIntoView({ block: "nearest", behavior: "instant" });
      }
      heading?.focus({ preventScroll: true });
      if (split && detailPane.current) splitMotion.play(detailPane.current, 1, { reduced });
    });
  }

  function resetSelection() {
    cancelAnimationFrame(focusFrame.current);
    splitMotion.stop();
    setMove(null);
    setSelection(null);
  }

  function changeSearch(next: string) {
    if (!term && next.trim() && input.current) browseOrigin.current = scrollPoint(input.current);
    const restore = term && !next.trim() ? browseOrigin.current : null;
    resetSelection();
    search(next);
    if (restore) focusFrame.current = requestAnimationFrame(() => restoreScroll(restore));
  }

  function toggleSection(next: Section["id"]) {
    resetSelection();
    setSection(current => current === next ? null : next);
  }

  function toggleFamily(next: ReferenceFamily) {
    resetSelection();
    setFamily(current => current === next ? null : next);
    setRawOpen(false);
  }

  const families = summary.data?.families ?? summary.cached("view=summary")?.families;
  const rows = result.data?.referenceFoods ?? result.cached(key)?.referenceFoods ?? [];
  const showRows = (foods: ReferenceFood[]) => <FoodRows rows={foods} active={active} detailId={detailId} open={open}/>;

  return <div ref={root} className={styles.browser} data-reference-library data-reference-picker={picker || undefined}
    data-reference-detail={!!active || undefined} data-reference-single={!split || undefined}
    onKeyDown={event => {
      if (event.key !== "Escape" || !active) return;
      event.stopPropagation();
      event.preventDefault();
      close();
    }}>
    <div className={styles.search} hidden={!!active && !split}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5"/><path d="m12 12 4 4"/></svg>
      <input ref={input} data-entry-input aria-label="搜索食材" type="search" maxLength={200}
        placeholder="搜食物、做法或别名" value={query}
        onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
        onChange={event => changeSearch(event.target.value)}/>
      {query && <button type="button" aria-label="清除搜索" onClick={() => {
        changeSearch("");
        input.current?.focus({ preventScroll: true });
      }}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg></button>}
    </div>
    <div className={styles.layout} data-reference-split={split || undefined} data-detail-open={!!active || undefined}
      data-reference-transition={move && !split ? move.direction === 1 ? "forward" : "back" : undefined}>
      <div ref={listPane} className={styles.listing} inert={!!active && !split} data-reference-pane="list">
        {!term ? <>
          <h3 className={styles.heading}>按分类浏览{summary.data ? " · " + summary.data.total + " 个参考规格" : ""}</h3>
          <ul className={styles.sectionRows}>
            {referenceSections.map(group => {
              const openSection = section === group.id;
              const panelId = id + "-" + group.id;
              const count = families && group.families.reduce((sum, current) => sum + (families[current.id]?.count ?? 0), 0);
              return <li key={group.id}>
                <button type="button" aria-label={group.label} aria-describedby={count ? panelId + "-count" : undefined}
                  aria-expanded={openSection} aria-controls={panelId} onClick={() => toggleSection(group.id)}>
                  <span className={styles.rowName}>{group.label}</span>
                  {!!count && <span id={panelId + "-count"} className={styles.rowReading}>{count} 项</span>}
                  <Chevron disclosure/>
                </button>
                <Fold open={openSection} id={panelId}>
                  <div className={styles.categoryFold}>
                    {group.families.map((item, index) => {
                      const familySummary = families?.[item.id];
                      const openFamily = item.id === family;
                      const familyId = id + "-" + item.id;
                      if (!familySummary) return null;
                      const foodRows = result.cached("family=" + item.id)?.referenceFoods ?? [];
                      const raw = foodRows.filter(food => food.state === "raw");
                      const edible = foodRows.filter(food => food.state !== "raw");
                      return <section className={styles.family} key={item.id}>
                        {item.branch && item.branch !== group.families[index - 1]?.branch && <h4 className={styles.familyHeading}>{item.branch}</h4>}
                        <button type="button" className={styles.familyButton} aria-label={item.label}
                          aria-describedby={familyId + "-count"} aria-expanded={openFamily}
                          aria-controls={familyId} onClick={() => toggleFamily(item.id)}>
                          <FoodArt illustration={familySummary.illustration}/>
                          <span className={styles.rowName}>{item.label}</span>
                          <span id={familyId + "-count"} className={styles.rowReading}>{familySummary.count} 个规格</span>
                          <Chevron disclosure/>
                        </button>
                        <Fold open={openFamily} id={familyId}>
                          <div className={styles.familyContent}>
                            {showRows(edible)}
                            {!!raw.length && <>
                              <button type="button" className={styles.rawToggle} aria-expanded={openFamily && rawOpen}
                                aria-controls={familyId + "-raw"} onClick={() => { resetSelection(); setRawOpen(value => !value); }}>
                                <span>生重原料</span><Chevron disclosure/>
                              </button>
                              <Fold open={openFamily && rawOpen} id={familyId + "-raw"}>{showRows(raw)}</Fold>
                            </>}
                            {openFamily && openSection && <><RequestStatus result={result}/><MoreResults result={result}/></>}
                          </div>
                        </Fold>
                      </section>;
                    })}
                    {openSection && <RequestStatus result={summary}/>}
                  </div>
                </Fold>
              </li>;
            })}
          </ul>
          {!section && <RequestStatus result={summary}/>}
        </> : <>
          <h3 className={styles.heading}>{result.data ? result.data.matches + " 个参考规格" : "参考规格"}</h3>
          {(["cooked", "ready", "raw"] as const).map(state => {
            const matching = rows.filter(food => food.state === state);
            return matching.length ? <section key={state}>
              <h4 className={styles.resultLabel}>{referenceStateLabel[state]}</h4>{showRows(matching)}
            </section> : null;
          })}
          {result.data?.matches === 0 && <div className={styles.message}>
            <p role="status">没有匹配的参考食材</p>
            {onManual && <button type="button" onClick={() => onManual(term)}>手动填写「{term}」</button>}
          </div>}
          <RequestStatus result={result}/><MoreResults result={result}/>
        </>}
      </div>
      {showDetail && <div ref={detailPane} className={styles.detailPane} data-reference-pane="detail" inert={!active}>
        <ReferenceDetails key={selection?.order} food={showDetail} id={detailId} headingRef={detailHeading}
          back={externalBack ? undefined : () => close()} disabled={disabled} onAdd={onAdd}/>
      </div>}
    </div>
  </div>;
}
