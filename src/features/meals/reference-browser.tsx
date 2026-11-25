"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { FoodArt } from "./food-art";
import type { ItemDraft } from "./model";
import { ReferenceDetails } from "./reference-details";
import { referenceSections, type ReferenceCatalogResult, type ReferenceFamily, type ReferenceFood } from "./reference-food";
import styles from "./reference-library.module.css";

type Section = (typeof referenceSections)[number];
export type FoodLibraryScope = "reference" | "personal";

export function FoodLibraryTabs({ scope, change }: { scope: FoodLibraryScope; change: (scope: FoodLibraryScope) => void }) {
  return <div className={styles.tabs} role="group" aria-label="食材库范围">
    <button type="button" aria-pressed={scope === "reference"} onClick={() => change("reference")}>公共参考</button>
    <button type="button" aria-pressed={scope === "personal"} onClick={() => change("personal")}>我的食材</button>
  </div>;
}

function Chevron() {
  return <svg className={styles.rowEnd} width="12" height="14" viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="m4 3 4 4-4 4"/></svg>;
}

function useReferenceSearch(query: string, family: ReferenceFamily | null, enabled: boolean) {
  const key = query + "\n" + (family ?? "");
  const [cache, setCache] = useState<Map<string, ReferenceCatalogResult>>(() => new Map());
  const [notice, setNotice] = useState<{ key: string; kind: "loading" | "failed" } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    const waiting = setTimeout(() => setNotice({ key, kind: "loading" }), 350);
    const start = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (family) params.set("family", family);
        const response = await fetch("/api/meal-reference-foods?" + params, { signal: abort.signal });
        if (!response.ok) throw new Error("reference read failed");
        const result: ReferenceCatalogResult = await response.json();
        if (abort.signal.aborted) return;
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
  }, [key, query, family, enabled, retry]);
  return { data: cache.get(key), notice: notice?.key === key ? notice.kind : null, retry: () => { setNotice(null); setRetry(value => value + 1); } };
}

export function ReferenceBrowser({ query, search, searchRef, enabled, disabled, onSelect, onAdd, onManual }: {
  query: string;
  search: (query: string) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  enabled: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  onAdd?: (item: ItemDraft, food: ReferenceFood) => void;
  onManual?: (name: string) => void;
}) {
  const [section, setSection] = useState<Section | null>(null);
  const [branch, setBranch] = useState(false);
  const [family, setFamily] = useState<ReferenceFamily | null>(null);
  const [selection, setSelection] = useState<{ food: ReferenceFood; term: string; family: ReferenceFamily | null } | null>(null);
  const id = useId();
  const localSearch = useRef<HTMLInputElement>(null);
  const input = searchRef ?? localSearch;
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const origin = useRef<{ button: HTMLButtonElement; dialog: HTMLDialogElement | null; top: number } | null>(null);
  const term = query.trim();
  const browsing = !term && !family;
  const selectedFamily = term ? null : family;
  const active = selection?.term === term && selection.family === selectedFamily ? selection.food : null;
  const { data, notice, retry } = useReferenceSearch(term, selectedFamily, enabled);
  const detailId = id + "-reference-detail";
  const familyLabel = section?.families.find(item => item.id === family)?.label;

  function open(food: ReferenceFood, button: HTMLButtonElement) {
    if (active?.id === food.id) { close(); return; }
    const dialog = button.closest("dialog");
    origin.current = { button, dialog, top: dialog?.scrollTop ?? window.scrollY };
    onSelect?.();
    setSelection({ food, term, family: selectedFamily });
    requestAnimationFrame(() => {
      detailHeading.current?.focus({ preventScroll: true });
      if (!matchMedia("(min-width: 701px) and (pointer: fine)").matches) {
        detailHeading.current?.closest("section")?.scrollIntoView({ block: "nearest", behavior: "instant" });
      }
    });
  }

  function close() {
    setSelection(null);
    const from = origin.current;
    if (!from) return;
    requestAnimationFrame(() => {
      if (from.dialog) from.dialog.scrollTop = from.top;
      else window.scrollTo({ top: from.top, behavior: "instant" });
      from.button.focus({ preventScroll: true });
    });
  }

  function navigate(next: Section | null, showFamilies = false, nextFamily: ReferenceFamily | null = null) {
    setSection(next); setBranch(showFamilies); setFamily(nextFamily); setSelection(null);
  }

  const renderRows = (cooked: boolean) => {
    const rows = data?.referenceFoods.filter(food => (food.state === "cooked") === cooked);
    if (!rows?.length) return null;
    return <>
      <h3 className={styles.resultLabel}>{cooked ? "熟食" : "生重原料"}</h3>
      <ul className={styles.foodRows}>
        {rows.map(food => <li key={food.id} data-reference-result>
          <button type="button" aria-label={food.name + "详情"} aria-expanded={active?.id === food.id}
            aria-controls={active ? detailId : undefined} onClick={event => open(food, event.currentTarget)}>
            <FoodArt illustration={food.illustration}/>
            <span className={styles.rowName}>{food.name}</span>
            <span className={styles.rowReading}>{food.portions[0] ? "1" + food.portions[0].unit + "约 " + Number(food.portions[0].edibleGrams) + " g" : "按可食克数"}</span>
            <Chevron/>
          </button>
        </li>)}
      </ul>
    </>;
  };

  return <div className={styles.browser} data-reference-library data-reference-detail={!!active || undefined} onKeyDown={event => {
    if (event.key !== "Escape" || !active) return;
    event.stopPropagation(); event.preventDefault(); close();
  }}>
    <div className={styles.search}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5"/><path d="m12 12 4 4"/></svg>
      <input ref={input} data-entry-input aria-label="搜索食材" type="search" maxLength={200}
        placeholder="搜食物、做法或别名" value={query}
        onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
        onChange={event => { setSelection(null); search(event.target.value); }}/>
      {query && <button type="button" aria-label="清除搜索" onClick={() => {
        setSelection(null); search(""); input.current?.focus();
      }}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg></button>}
    </div>
    {!term && section && <nav aria-label="食材分类路径" className={styles.breadcrumbs}>
      <button type="button" onClick={() => navigate(null)}>按分类浏览</button>
      <Chevron/>
      <button type="button" onClick={() => navigate(section)}>{section.label}</button>
      {branch && section.branch && <><Chevron/><button type="button" onClick={() => navigate(section, true)}>{section.branch}</button></>}
      {familyLabel && <><Chevron/><span aria-current="page">{familyLabel}</span></>}
    </nav>}
    <div className={styles.layout} data-detail-open={!!active || undefined}>
      <div className={styles.listing}>
        {browsing ? <>
          {!section && <h3 className={styles.heading}>按分类浏览{data ? " · " + data.total + " 个参考规格" : ""}</h3>}
          <ul className={styles.sectionRows}>
            {!section ? referenceSections.map(group => <li key={group.id}>
              <button type="button" onClick={() => navigate(group)}><span>{group.label}</span><Chevron/></button>
            </li>) : section.branch && !branch ? <li>
              <button type="button" onClick={() => navigate(section, true)}><span>{section.branch}</span><Chevron/></button>
            </li> : section.families.map(item => <li key={item.id}>
              <button type="button" onClick={() => navigate(section, branch, item.id)}><span>{item.label}</span><Chevron/></button>
            </li>)}
          </ul>
        </> : <>
          <h3 className={styles.heading}>{data ? data.matches + " 个参考规格" : "参考规格"}</h3>
          {renderRows(true)}
          {renderRows(false)}
          {data && data.matches === 0 && <div className={styles.message}>
            <p role="status">没有匹配的参考食材</p>
            {onManual && <button type="button" onClick={() => onManual(term)}>手动填写{term ? "「" + term + "」" : ""}</button>}
          </div>}
        </>}
        {notice && <div className={styles.message}>
          {notice === "loading" && !data && <p role="status">正在查找食材…</p>}
          {notice === "failed" && <><p role="alert">食材未加载</p><button type="button" onClick={retry}>重试</button></>}
        </div>}
      </div>
      {active && <ReferenceDetails key={active.id} food={active} id={detailId} headingRef={detailHeading} back={close}
        disabled={disabled} onAdd={onAdd ? (item, food) => { onAdd(item, food); setSelection(null); } : undefined}/>}
    </div>
  </div>;
}
