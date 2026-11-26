"use client";

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createWorkspaceExchange, createWorkspaceMotion } from "@/components/workspace-motion";
import { FoodArt } from "./food-art";
import { useReferenceRequest } from "./reference-request";
import { ReferenceDetails, type ReferencePick } from "./reference-details";
import { referenceFoodName, referenceSections, referenceStateLabel, type ReferenceCatalogFood, type ReferenceFamily, type ReferenceMealLink } from "./reference-food";
import styles from "./reference-library.module.css";

type Section = (typeof referenceSections)[number];
type ScrollPoint = { element: HTMLElement | null; top: number };
type Selection = { food: ReferenceCatalogFood; key: string; visit: number; open: boolean; order: number };
export type ReferenceBack = { label: string; shortLabel: string; action: (restoreFocus?: boolean) => void };
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
  rows: ReferenceCatalogFood[]; active: ReferenceCatalogFood | null; detailId: string;
  open: (food: ReferenceCatalogFood, trigger: HTMLButtonElement) => void;
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
          : food.basisUnit === "mL" ? "按毫升" : "按可食克数"}</span>
        <Chevron/>
      </button>
    </li>)}
  </ul>;
}

export function ReferenceBrowser({ query, search, searchRef, enabled, disabled, pickerVisit, onAdd, onManual, onDetailBack, externalBack, maxItems }: {
  query: string;
  search: (query: string) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  enabled: boolean;
  disabled?: boolean;
  pickerVisit?: number;
  onAdd?: (picks: readonly ReferencePick[]) => void;
  maxItems?: number;
  onManual?: (name: string) => void;
  onDetailBack?: (back: ReferenceBack | null) => void;
  externalBack?: boolean;
}) {
  const [section, setSection] = useState<Section["id"] | null>(null);
  const [family, setFamily] = useState<ReferenceFamily | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [split, setSplit] = useState(false);
  const [related, setRelated] = useState<(ScrollPoint & { meal: ReferenceMealLink; button: HTMLButtonElement }) | null>(null);
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
  const relatedResult = useReferenceRequest(enabled && active && related ? "id=" + encodeURIComponent(related.meal.id) : null);
  const relatedFood = relatedResult.data?.referenceFoods[0];
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
    setRelated(null);
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

  const back = useCallback((restoreFocus = true) => {
    if (!related || !restoreFocus) {
      close(restoreFocus);
      return;
    }
    splitMotion.stop();
    setRelated(null);
    cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      const pane = detailPane.current;
      restoreScroll(related);
      related.button.focus({ preventScroll: true });
      if (pane && relatedFood) splitMotion.play(pane, -1, { distance: 12, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches });
    });
  }, [close, related, relatedFood, splitMotion]);

  useLayoutEffect(() => {
    onDetailBack?.(enabled && active ? {
      label: related ? "上个食材" : "食材列表",
      shortLabel: related ? "食材" : "列表",
      action: back,
    } : null);
    return () => onDetailBack?.(null);
  }, [onDetailBack, back, related, enabled, active]);

  useLayoutEffect(() => {
    const pane = detailPane.current;
    if (!relatedFood || !active || !pane) return;
    const heading = detailHeading.current;
    const scroller = scrollPoint(pane).element;
    if (scroller?.hasAttribute("data-reference-scroll")) scroller.scrollTop = 0;
    else heading?.scrollIntoView({ block: "start", behavior: "instant" });
    heading?.focus({ preventScroll: true });
    splitMotion.play(pane, 1, { distance: 12, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches });
  }, [active, relatedFood, splitMotion]);

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

  function open(food: ReferenceCatalogFood, button: HTMLButtonElement) {
    if (active?.id === food.id) { close(); return; }
    cancelAnimationFrame(focusFrame.current);
    setRelated(null);
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
    setRelated(null);
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
  const showRows = (foods: ReferenceCatalogFood[]) => <FoodRows rows={foods} active={active} detailId={detailId} open={open}/>;

  return <div ref={root} className={styles.browser} data-reference-library data-reference-picker={picker || undefined}
    data-reference-detail={!!active || undefined} data-reference-single={!split || undefined}
    onKeyDown={event => {
      if (event.key !== "Escape" || !active) return;
      event.stopPropagation();
      event.preventDefault();
      back();
    }}>
    <div className={styles.search} hidden={!!active && !split}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5"/><path d="m12 12 4 4"/></svg>
      <input ref={input} data-entry-input data-guide-target="meal-library-search" aria-label="搜索食材" type="search" maxLength={200}
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
        <div hidden={!!relatedFood} inert={!!relatedFood}>
          <ReferenceDetails key={selection?.order} food={showDetail} id={relatedFood ? detailId + "-parent" : detailId}
            headingRef={relatedFood ? null : detailHeading}
            back={externalBack ? undefined : { label: "← 返回食材列表", action: () => close() }}
            disabled={disabled} onAdd={onAdd} maxItems={maxItems}
            openMeal={(meal, button) => setRelated({ ...scrollPoint(button), meal, button })}
            relatedStatus={<RequestStatus result={relatedResult}/>}/>
        </div>
        {relatedFood && <ReferenceDetails key={relatedFood.id} food={relatedFood} id={detailId} headingRef={detailHeading}
          back={externalBack ? undefined : { label: "← 返回上个食材", action: () => back() }}
          disabled={disabled} onAdd={onAdd} maxItems={maxItems}/>}
      </div>}
    </div>
  </div>;
}
