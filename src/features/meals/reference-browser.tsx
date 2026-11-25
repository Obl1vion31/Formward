"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { FoodArt } from "./food-art";
import type { ItemDraft } from "./model";
import { ReferenceDetails } from "./reference-details";
import { referenceFoodName, referenceSections, type ReferenceCatalogResult, type ReferenceFamily, type ReferenceFood } from "./reference-food";
import styles from "./reference-library.module.css";

type Section = (typeof referenceSections)[number];
type ScrollPoint = { dialog: HTMLDialogElement | null; top: number };
export type FoodLibraryScope = "reference" | "personal";

export function FoodLibraryTabs({ scope, change }: { scope: FoodLibraryScope; change: (scope: FoodLibraryScope) => void }) {
  return <div className={styles.tabs} role="group" aria-label="食材库范围">
    <button type="button" aria-pressed={scope === "reference"} onClick={() => change("reference")}>公共参考</button>
    <button type="button" aria-pressed={scope === "personal"} onClick={() => change("personal")}>我的食材</button>
  </div>;
}

function Chevron({ down = false }: { down?: boolean }) {
  return <svg className={styles.rowEnd} width="12" height="14" viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
    <path d={down ? "m2 5 4 4 4-4" : "m4 3 4 4-4 4"}/>
  </svg>;
}

function scrollPoint(element: HTMLElement): ScrollPoint {
  const dialog = element.closest("dialog");
  return { dialog, top: dialog?.scrollTop ?? window.scrollY };
}

function restoreScroll(from: ScrollPoint) {
  if (from.dialog) from.dialog.scrollTop = from.top;
  else window.scrollTo({ top: from.top, behavior: "instant" });
}

function useReferenceSearch(query: string, section: Section | null, enabled: boolean) {
  const key = query ? "q:" + query : "section:" + (section?.id ?? "");
  const [cache, setCache] = useState<Map<string, ReferenceCatalogResult>>(() => new Map());
  const [total, setTotal] = useState<number>();
  const [notice, setNotice] = useState<{ key: string; kind: "loading" | "failed" } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    const waiting = setTimeout(() => setNotice({ key, kind: "loading" }), 350);
    const start = setTimeout(async () => {
      try {
        const families = section?.families.map(family => family.id) ?? [null];
        const results = await Promise.all(families.map(async family => {
          const params = new URLSearchParams();
          if (query) params.set("q", query);
          if (family) params.set("family", family);
          const response = await fetch("/api/meal-reference-foods?" + params, { signal: abort.signal });
          if (!response.ok) throw new Error("reference read failed");
          return await response.json() as ReferenceCatalogResult;
        }));
        if (abort.signal.aborted) return;
        const result = {
          total: results[0].total,
          matches: results.reduce((count, item) => count + item.matches, 0),
          referenceFoods: results.flatMap(item => item.referenceFoods),
        };
        setTotal(result.total);
        setCache(previous => {
          const next = new Map(previous);
          next.delete(key);
          next.set(key, result);
          if (next.size > 5) next.delete(next.keys().next().value!);
          return next;
        });
        setNotice(null);
      } catch {
        if (!abort.signal.aborted) setNotice({ key, kind: "failed" });
      } finally {
        clearTimeout(waiting);
      }
    }, query ? 120 : 0);
    return () => { clearTimeout(start); clearTimeout(waiting); abort.abort(); };
  }, [key, query, section, enabled, retry]);

  return { data: cache.get(key), total, notice: notice?.key === key ? notice.kind : null, retry: () => { setNotice(null); setRetry(value => value + 1); } };
}

export function ReferenceBrowser({ query, search, searchRef, enabled, disabled, onSelect, onAdd, onManual, onDetailBack, externalBack }: {
  query: string;
  search: (query: string) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  enabled: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  onAdd?: (item: ItemDraft, food: ReferenceFood) => void;
  onManual?: (name: string) => void;
  onDetailBack?: (back: (() => void) | null) => void;
  externalBack?: boolean;
}) {
  const [section, setSection] = useState<Section | null>(null);
  const [rawOpen, setRawOpen] = useState<ReferenceFamily | null>(null);
  const [selection, setSelection] = useState<{ food: ReferenceFood; term: string; section: Section | null } | null>(null);
  const id = useId();
  const localSearch = useRef<HTMLInputElement>(null);
  const input = searchRef ?? localSearch;
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const origin = useRef<(ScrollPoint & { button: HTMLButtonElement }) | null>(null);
  const browseOrigin = useRef<ScrollPoint | null>(null);
  const term = query.trim();
  const currentSection = term ? null : section;
  const active = selection?.term === term && selection.section === currentSection ? selection.food : null;
  const { data, total, notice, retry } = useReferenceSearch(term, currentSection, enabled);
  const detailId = id + "-reference-detail";
  const detailOpen = enabled && active !== null;

  const close = useCallback(() => {
    setSelection(null);
    const from = origin.current;
    if (!from) return;
    requestAnimationFrame(() => {
      restoreScroll(from);
      from.button.focus({ preventScroll: true });
    });
  }, []);

  useLayoutEffect(() => {
    onDetailBack?.(detailOpen ? close : null);
    return () => onDetailBack?.(null);
  }, [onDetailBack, close, detailOpen]);

  function open(food: ReferenceFood, button: HTMLButtonElement) {
    if (active?.id === food.id) { close(); return; }
    origin.current = { ...scrollPoint(button), button };
    onSelect?.();
    setSelection({ food, term, section: currentSection });
    requestAnimationFrame(() => {
      const heading = detailHeading.current;
      heading?.focus({ preventScroll: true });
      if (!matchMedia("(min-width: 701px) and (pointer: fine)").matches) {
        heading?.scrollIntoView({ block: "nearest", behavior: "instant" });
      }
    });
  }

  function changeSearch(next: string) {
    if (!term && next.trim() && input.current) browseOrigin.current = scrollPoint(input.current);
    const restore = term && !next.trim() ? browseOrigin.current : null;
    setSelection(null);
    search(next);
    if (restore) requestAnimationFrame(() => restoreScroll(restore));
  }

  function toggleSection(group: Section) {
    setSection(section?.id === group.id ? null : group);
    setRawOpen(null);
    setSelection(null);
  }

  function renderRows(rows: ReferenceFood[]) {
    if (!rows.length) return null;
    return <ul className={styles.foodRows}>
      {rows.map(food => <li key={food.id} data-reference-result>
        <button type="button" aria-label={referenceFoodName(food) + "详情"} aria-expanded={active?.id === food.id}
          aria-controls={active?.id === food.id ? detailId : undefined} onClick={event => open(food, event.currentTarget)}>
          <FoodArt illustration={food.illustration}/>
          <span className={styles.rowName}>{referenceFoodName(food)}</span>
          <span className={styles.rowReading}>{food.portions[0] ? "1" + food.portions[0].unit + "约 " + Number(food.portions[0].edibleGrams) + " g" : "按可食克数"}</span>
          <Chevron/>
        </button>
      </li>)}
    </ul>;
  }

  const status = notice && <div className={styles.message}>
    {notice === "loading" && !data && <p role="status">正在查找食材…</p>}
    {notice === "failed" && <><p role="alert">食材未加载</p><button type="button" onClick={retry}>重试</button></>}
  </div>;

  return <div className={styles.browser} data-reference-library data-reference-detail={!!active || undefined} onKeyDown={event => {
    if (event.key !== "Escape" || !active) return;
    event.stopPropagation(); event.preventDefault(); close();
  }}>
    <div className={styles.search}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5"/><path d="m12 12 4 4"/></svg>
      <input ref={input} data-entry-input aria-label="搜索食材" type="search" maxLength={200}
        placeholder="搜食物、做法或别名" value={query}
        onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
        onChange={event => changeSearch(event.target.value)}/>
      {query && <button type="button" aria-label="清除搜索" onClick={() => {
        changeSearch("");
        input.current?.focus({ preventScroll: true });
      }}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg></button>}
    </div>
    <div className={styles.layout} data-detail-open={!!active || undefined}>
      <div className={styles.listing}>
        {!term ? <>
          <h3 className={styles.heading}>按分类浏览{total !== undefined ? " · " + total + " 个参考规格" : ""}</h3>
          <ul className={styles.sectionRows}>
            {referenceSections.map(group => {
              const open = currentSection?.id === group.id;
              const panelId = id + "-" + group.id;
              return <li key={group.id}>
                <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => toggleSection(group)}>
                  <span>{group.label}</span><Chevron down={open}/>
                </button>
                <div id={panelId} className={styles.categoryFold} hidden={!open}>
                  {open && <>{data && group.families.map(family => {
                    const foods = data.referenceFoods.filter(food => food.family === family.id);
                    const raw = foods.filter(food => food.state === "raw");
                    const rawId = id + "-" + family.id + "-raw";
                    return <section key={family.id} className={styles.family}>
                      <h4 className={styles.familyHeading}>{group.branch ? group.branch + " · " : ""}{family.label}</h4>
                      {renderRows(foods.filter(food => food.state === "cooked"))}
                      {raw.length > 0 && <>
                        <button type="button" className={styles.rawToggle} aria-expanded={rawOpen === family.id}
                          aria-controls={rawId} onClick={() => {
                            if (active?.state === "raw") setSelection(null);
                            setRawOpen(rawOpen === family.id ? null : family.id);
                          }}><span>生重原料</span><Chevron down={rawOpen === family.id}/></button>
                        <div id={rawId} hidden={rawOpen !== family.id}>{renderRows(raw)}</div>
                      </>}
                    </section>;
                  })}{status}</>}
                </div>
              </li>;
            })}
          </ul>
          {!section && status}
        </> : <>
          <h3 className={styles.heading}>{data ? data.matches + " 个参考规格" : "参考规格"}</h3>
          {(["cooked", "raw"] as const).map(state => {
            const rows = data?.referenceFoods.filter(food => food.state === state);
            return rows?.length ? <section key={state}>
              <h4 className={styles.resultLabel}>{state === "cooked" ? "熟食" : "生重原料"}</h4>{renderRows(rows)}
            </section> : null;
          })}
          {data && data.matches === 0 && <div className={styles.message}>
            <p role="status">没有匹配的参考食材</p>
            {onManual && <button type="button" onClick={() => onManual(term)}>手动填写{term ? "「" + term + "」" : ""}</button>}
          </div>}
          {status}
        </>}
      </div>
      {active && <ReferenceDetails key={active.id} food={active} id={detailId} headingRef={detailHeading} back={externalBack ? undefined : close}
        disabled={disabled} onAdd={onAdd ? (item, food) => { onAdd(item, food); setSelection(null); } : undefined}/>}
    </div>
  </div>;
}
