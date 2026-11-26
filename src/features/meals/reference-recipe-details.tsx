"use client";

import { useId, useRef, useState, type CSSProperties, type Ref } from "react";
import { flushSync } from "react-dom";
import { DecimalInput } from "@/components/decimal-input";
import { RecipeArt, SavedRecipeParts } from "./food-art";
import { MealEntryReadings, MealNutrientValue } from "./meal-entry-readings";
import { decimal, emptyNutrition, metricLabels, scaled, type ItemDraft } from "./model";
import { recipeAmountBasis, recipeCountPortions, recipeGrams, recipePart, recipePartAmount, recipePartInputs, recipeTotals, resolveRecipePart, wholeRecipeParts } from "./reference-recipe";
import { useReferenceRequest } from "./reference-request";
import type { RecipePart, RecipePartAmount, ReferenceFood, ReferencePortion } from "./reference-food";
import type { ReferencePick } from "./reference-details";
import library from "./reference-library.module.css";
import styles from "./reference-recipe.module.css";

type Recipe = ReferenceFood & { recipe: NonNullable<ReferenceFood["recipe"]> };
export type RecipeEdit = { food: ReferenceFood; item: ItemDraft; parts: readonly RecipePart[] };
type WholeMethod = "ratio" | "weight";
type WholeEntry = { method: WholeMethod; percent: number; weight: { value: string; estimateBasis?: string } | null };
type ComponentEdit = { amount?: RecipePartAmount; enabled?: boolean; showCount?: boolean };
const validGrams = (value: string) => decimal.safeParse(value).success && Number(value) > 0;
const normalized = (value: string) => value.replace(/^\./, "0.").replace(/\.$/, "");
const labelOf = (part: RecipePart) => part.label ?? part.food.name;
const macros = ["proteinG", "carbsG", "fatG"] as const;

function Chevron() {
  return <svg className={styles.chevron} width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" fill="none">
    <path d="m5 8 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

function RecipeSources({ food, parts }: { food: Recipe; parts: readonly RecipePart[] }) {
  const { recipe } = food;
  const origin = Object.entries(recipe.sourceAmounts);
  const sourceParts = [...(food.components ?? []), ...recipe.suggestedFoods.map(entry => ({ food: entry, label: entry.id === "potato-boiled" ? "土豆" : entry.name }))];
  return <details className={styles.evidence}>
    <summary>配方与来源<Chevron/></summary>
    <div className={styles.evidenceBody}>
      <p>每 100 g 成品可食部 · 标准配方估算</p>
      <MealEntryReadings nutrition={food.nutrition}/>
      <p>{recipe.note}</p>
      <h4>原菜谱投料</h4>
      <ul className={styles.sourceAmounts}>{origin.map(([id, amount]) => {
        const part = sourceParts.find(entry => entry.food.id === id);
        return part && <li key={id}><span>{part.label ?? part.food.name}</span><span>{amount}</span></li>;
      })}</ul>
      <div className={styles.sourceLinks}>{recipe.links.map(link =>
        <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.name} ↗</a>)}</div>
      {parts.length > 0 && <details className={styles.partSources}>
        <summary>分项与营养来源<Chevron/></summary>
        <SavedRecipeParts parts={parts}/>
      </details>}
    </div>
  </details>;
}

function initialWholeEntry(edit: RecipeEdit | undefined, serving: ReferencePortion): WholeEntry {
  const item = edit?.item;
  const link = item?.referenceFood;
  if (!item || link?.parts) return { method: "ratio", percent: 100, weight: null };
  const quantity = Number(item.quantity);
  const percent = Math.round(quantity * 100);
  if (link?.portionId === serving.id && percent > 0 && percent <= 100 && percent % 5 === 0 && quantity === percent / 100) {
    return { method: "ratio", percent, weight: null };
  }
  const value = link?.portionId && edit.parts.length ? String(Number(recipeGrams(edit.parts))) : item.quantity ?? "";
  const estimateBasis = link?.portionId ? "沿用原餐次参考可食重量。" :
    item.amountDecision === "estimate_accepted" ? item.basis ?? "沿用原食用量估算。" : undefined;
  return { method: "weight", percent: 100, weight: { value, estimateBasis } };
}

function splitEdits(components: NonNullable<ReferenceFood["components"]>, parts: readonly RecipePart[], preserveSelection: boolean) {
  return Object.fromEntries([
    ...components.map(({ food }) => [food.id, { enabled: !preserveSelection }] as const),
    ...parts.map(part => [part.food.id, { enabled: true, amount: recipePartAmount(part) }] as const),
  ]);
}

export function ReferenceRecipeDetails({ food, back, onAdd, maxItems, disabled, headingRef, id, edit }: {
  food: Recipe;
  back?: { label: string; action: () => void };
  onAdd?: (picks: readonly ReferencePick[]) => void;
  maxItems?: number;
  disabled?: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  id: string;
  edit?: RecipeEdit;
}) {
  const serving = food.portions.find(part => part.id === "meal-serving") ?? food.portions[0];
  const defaultRows = food.components ?? [];
  const [split, setSplit] = useState(!!edit?.item.referenceFood?.parts);
  const [initial] = useState(() => initialWholeEntry(edit, serving));
  const [entry, setEntry] = useState(initial);
  const weightField = useRef<HTMLDivElement>(null);
  const [edits, setEdits] = useState<Record<string, ComponentEdit> | null>(() =>
    edit?.item.referenceFood?.parts ? splitEdits(defaultRows, edit.parts, true) : null);
  const [extraFoods, setExtraFoods] = useState<readonly ReferenceFood[]>(() =>
    edit?.item.referenceFood?.parts ? edit.parts.filter(part => !defaultRows.some(row => row.food.id === part.food.id)).map(part => part.food) : []);
  const [overviewOpen, setOverviewOpen] = useState(!!onAdd);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const pickerId = useId();
  const extraTrigger = useRef<HTMLButtonElement>(null);
  const extraSearch = useRef<HTMLInputElement>(null);
  const byRatio = entry.method === "ratio";
  const quantity = byRatio ? String(entry.percent / 100) : normalized(entry.weight?.value ?? "");
  const portionId = byRatio ? serving.id : undefined;
  const keepOriginal = edit && !edit.item.referenceFood?.parts && entry.method === initial.method &&
    (byRatio ? entry.percent === initial.percent : entry.weight === initial.weight);
  const weightEstimate = !byRatio ? entry.weight?.estimateBasis : undefined;
  const whole = validGrams(quantity) ? keepOriginal && edit.parts.length ? edit.parts : wholeRecipeParts(food, quantity, portionId) : [];
  const rows = [...defaultRows, ...(split ? extraFoods : []).map(extra => ({
    food: extra, role: "配菜" as const, grams: "", label: undefined, amountBasis: undefined,
  }))].map(component => {
    const change = edits?.[component.food.id];
    const saved = edit?.item.referenceFood?.parts && edit.parts.find(part => part.food.id === component.food.id);
    const ingredient = saved ? saved.food : component.food;
    const amount = change?.amount;
    const countInput = amount && "portionId" in amount ? amount : undefined;
    const countOptions = split ? recipeCountPortions(ingredient) : [];
    const countPortion = countOptions.find(option => option.id === countInput?.portionId) ??
      (countOptions.length === 1 ? countOptions[0] : undefined);
    const showCount = !!countPortion && (change?.showCount ?? !!countInput);
    const baseAmount = whole.find(part => part.food.id === ingredient.id);
    const part = split && amount ? resolveRecipePart(food, ingredient, amount) ?? recipePart(food, ingredient, { grams: "" }) :
      recipePart(food, ingredient, { grams: split ? "" : baseAmount?.grams ?? "", estimated: !split });
    const countValue = countInput?.quantity ?? (countPortion && validGrams(part.grams) ? scaled(part.grams, "1", countPortion.edibleGrams) : "");
    const enabled = !split || change?.enabled !== false;
    const seasoning = component.role === "酱料" || ["oil", "sauce", "sugar", "seasoning"].includes(ingredient.family);
    return { part, enabled, seasoning, countPortion, showCount, countValue };
  });
  const selected = rows.filter(row => row.enabled);
  const ingredients = rows.filter(row => !row.seasoning);
  const seasonings = rows.filter(row => row.seasoning);
  const seasoningGrams = Number(recipeGrams(seasonings.map(row => row.part)));
  const parts = split ? selected.map(row => row.part) : whole;
  const ready = split ? parts.length > 0 && parts.every(part => validGrams(part.grams)) : whole.length > 0;
  const total = ready ? recipeTotals(parts) : null;
  const tooLarge = total && (Number(total.grams) > 1000000 ||
    Object.values(total.nutrition).some(value => value !== null && Number(value) > 1000000));
  const approximate = split ? parts.some(part => part.estimated) : byRatio || !!weightEstimate;
  const eligible = (entry: ReferenceFood) => !entry.basisUnit && !entry.components;
  const options = [...food.recipe.suggestedFoods, ...defaultRows.filter(entry => entry.role === "酱料").map(entry => entry.food)];
  const extraQuery = search.trim();
  const request = useReferenceRequest(split && showPicker && extraQuery ? "q=" + encodeURIComponent(extraQuery) : null, 120);
  const candidates = extraQuery ? (request.data?.referenceFoods ?? []).filter(eligible) : options;
  const quickAdd = food.recipe.suggestedFoods.find(entry => entry.id === food.recipe.quickAddId ||
    !food.recipe.quickAddId && food.id === "tomato-brisket-rice" && entry.id === "potato-boiled");
  const quickAddPart = quickAdd && recipePart(food, quickAdd, { grams: "" });
  const isDish = food.recipe.kind === "dish";

  function update(ingredientId: string, change: ComponentEdit) {
    setEdits(previous => ({ ...previous, [ingredientId]: { ...previous?.[ingredientId], ...change } }));
  }

  function chooseMethod(method: WholeMethod) {
    if (entry.method === method) return;
    const weight = entry.weight ?? (total && !tooLarge ? {
      value: String(Number(total.grams)),
      estimateBasis: "按整份参考重量的 " + entry.percent + "% 换算。",
    } : null);
    const next = { ...entry, method, weight };
    if (method === "ratio") {
      setEntry(next);
      return;
    }
    flushSync(() => setEntry(next));
    const input = weightField.current?.querySelector("input");
    input?.focus({ preventScroll: true });
    input?.select();
  }

  function startSplit() {
    if (!edits) setEdits(splitEdits(defaultRows, whole, whole.length > 0));
    setSplit(true);
  }

  function pickExtra(extra: ReferenceFood) {
    const existing = rows.find(row => row.part.food.id === extra.id);
    if (!existing) setExtraFoods(previous => [...previous, extra]);
    update(extra.id, { enabled: true });
    setShowPicker(false);
    setSearch("");
    requestAnimationFrame(() => {
      const input = document.getElementById(id + "-amount-" + extra.id) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  function closePicker() {
    setShowPicker(false);
    setSearch("");
    extraTrigger.current?.focus({ preventScroll: true });
  }

  function add() {
    if (!total || tooLarge || disabled || maxItems === 0) return;
    const item: ItemDraft = !split && keepOriginal ? edit.item : {
      kind: "food", name: food.name, referenceFood: {
        id: food.id, version: food.version,
        ...(split ? { parts: recipePartInputs(parts) } : { portionId }),
      },
      quantity: split ? total.grams : quantity, unit: split || !portionId ? "g" : serving.unit,
      amountDecision: !split && weightEstimate ? "estimate_accepted" : "provided",
      ...(!split && weightEstimate ? { basis: weightEstimate } : {}),
      sourceKind: "estimated",
    };
    onAdd?.([{ item, food, parts }]);
  }

  return <section className={library.detail + " " + styles.detail} id={id} aria-label="参考食材详情" data-recipe-detail
    onKeyDown={event => {
      if (event.key === "Enter" && event.target instanceof HTMLInputElement && ["number", "search"].includes(event.target.type)) {
        event.preventDefault();
        if (event.target.type === "number") event.target.blur();
      }
    }}>
    {back && <button type="button" className={library.back} onClick={back.action}>{back.label}</button>}
    <div className={styles.heading}>
      <div>
        <h3 tabIndex={-1} ref={headingRef}>{food.name}</h3>
        <p>{isDish && "单点菜 · "}{onAdd ? "配方估算" : "配方估算 · 标准一份"}</p>
      </div>
      <RecipeArt food={food}/>
    </div>
    {onAdd && <>
      <div className={styles.mode} data-split={split || undefined} role="group" aria-label="记录方式">
        <button type="button" aria-pressed={!split} onClick={() => { setSplit(false); setShowPicker(false); }}>按整份记</button>
        <button type="button" aria-pressed={split} onClick={startSplit}>拆开记</button>
      </div>
      {!split && <div className={styles.whole}>
        <div className={styles.methods} role="group" aria-label="食用量填写方式">
          <button type="button" aria-pressed={byRatio} onClick={() => chooseMethod("ratio")}>按比例</button>
          <button type="button" aria-pressed={!byRatio} onClick={() => chooseMethod("weight")}>填重量</button>
        </div>
        <div className={styles.amount} data-recipe-amount>
          <div className={styles.amountHead}>
            <span id={id + "-serving"}>整份参考约 {Number(serving.edibleGrams)} 克</span>
            {byRatio && <output htmlFor={id + "-ratio"} aria-hidden="true">{entry.percent}%</output>}
          </div>
          <div className={styles.amountBody}>
            {byRatio ? <div className={styles.rangeField}>
              <input id={id + "-ratio"} type="range" data-input-appearance="compact" data-recipe-ratio min={0} max={100} step={5}
                aria-label="吃完比例" aria-describedby={id + "-serving"} aria-valuetext={entry.percent + "%"} value={entry.percent}
                style={{ "--recipe-percent": entry.percent + "%" } as CSSProperties}
                onChange={event => setEntry({ ...entry, percent: Number(event.target.value) })}/>
              <div className={styles.ticks} aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
            </div> : <div className={styles.quantity + " " + styles.weight} ref={weightField}>
              <DecimalInput data-input-appearance="compact" aria-label="本次吃下的可食克数"
                value={entry.weight?.value ?? ""} min={0} max={1000000} precision={2} trimTrailingZeros placeholder="可食克数"
                aria-invalid={!!quantity && !validGrams(quantity)}
                onValue={value => setEntry({ ...entry, weight: { value } })}/>
              <span>克</span>
            </div>}
          </div>
        </div>
      </div>}
    </>}
    <details className={styles.overview} data-recipe-overview open={overviewOpen}
      onToggle={event => setOverviewOpen(event.currentTarget.open)}>
      <summary>
        <strong>本次总览</strong>
        <span className={styles.overviewValues} aria-live="polite">
          {total && !tooLarge ? <>
            <span>可食部{approximate ? "约 " : " "}{Number(total.grams)} 克</span>
            <strong>{total.nutrition.caloriesKcal === null ? "热量未知" : <>约 <MealNutrientValue value={total.nutrition.caloriesKcal} metric="caloriesKcal"/></>}</strong>
          </> : !split && byRatio && entry.percent === 0 ? <><span>可食部 0 克</span><strong>0 千卡</strong></>
            : <span>{tooLarge ? "食用量超出范围" : selected.length ? "请填写有效的食用量" : "请选择食材"}</span>}
        </span>
        <Chevron/>
      </summary>
      <dl className={styles.macros}>
        {macros.map(metric => <div key={metric}><dt>{metricLabels[metric]}</dt>
          <dd><MealNutrientValue value={(total && !tooLarge ? total.nutrition : emptyNutrition())[metric]} metric={metric}/></dd></div>)}
      </dl>
    </details>
    <section aria-labelledby={id + "-composition"} className={styles.composition}>
      <div className={styles.compositionHead}>
        <h4 id={id + "-composition"}>{isDish ? "菜品组成" : "整餐组成"}</h4>
        {split && <button type="button" className={styles.quiet} ref={extraTrigger}
          aria-expanded={showPicker} aria-controls={pickerId} onClick={() => {
            if (showPicker) closePicker();
            else {
              setShowPicker(true);
              requestAnimationFrame(() => extraSearch.current?.focus({ preventScroll: true }));
            }
          }}>＋ 加食材或调料</button>}
      </div>
      {split && showPicker && <div className={styles.extraPicker} id={pickerId} onKeyDown={event => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        event.preventDefault();
        closePicker();
      }}>
        <div className={styles.extraSearch}>
          <input type="search" data-input-appearance="compact" aria-label="查找食材或调料" ref={extraSearch} value={search} maxLength={60}
            placeholder="搜土豆、配菜、油或调料" onChange={event => setSearch(event.target.value)}/>
          <button type="button" className={styles.quiet} onClick={closePicker}>收起</button>
        </div>
        {candidates.length > 0 && <ul className={styles.extraResults} aria-label="可加食材或调料">
          {candidates.map(extra => <li key={extra.id}><button type="button" onClick={() => pickExtra(extra)}
            disabled={rows.length >= 30 && !rows.some(row => row.part.food.id === extra.id)}>
            <span>{labelOf(recipePart(food, extra, { grams: "" }))}</span>
            <small>{rows.some(row => row.part.food.id === extra.id) ? "改量" : "加入 ＋"}</small>
          </button></li>)}
        </ul>}
        {request.notice === "loading" && <p role="status">正在查找食材…</p>}
        {request.notice === "failed" && <p role="alert">食材未加载 <button type="button" className={styles.quiet} onClick={request.retry}>重试</button></p>}
        {request.data && !candidates.length && !request.notice && <p>没有匹配的按克食材</p>}
        {request.data?.nextOffset !== undefined && !request.notice && <button type="button" className={styles.quiet} onClick={request.load}>加载更多食材</button>}
      </div>}
      {!split ? <ul className={styles.wholeParts}>
        {ingredients.map(({ part }) => <li key={part.food.id} data-recipe-part={part.food.id}>
          <span>{labelOf(part)}</span><span className={styles.grams}>{part.grams ? "约 " + Number(part.grams) + " 克" : "—"}</span>
        </li>)}
        {seasonings.length > 0 && <li><span>调料</span><span className={styles.grams}>{seasoningGrams ? "约 " + seasoningGrams + " 克" : "—"}</span></li>}
      </ul> : [ingredients, seasonings].map((group, index) => <div className={styles.group} key={index}>
        <h5>{index ? "调料" : "原料"}</h5>
        <ul>
          {group.map(({ part, enabled, countPortion, showCount, countValue }) => <li key={part.food.id} data-recipe-part={part.food.id}>
            <label className={styles.checkLabel}>
              <input type="checkbox" aria-label={"计入" + labelOf(part)} checked={enabled}
                onChange={event => update(part.food.id, { enabled: event.target.checked })}/>
              <span>
                <strong>{labelOf(part)}</strong>
                <small>{recipeAmountBasis(part)}{enabled && part.estimated && !countPortion ? " · 约" : ""}</small>
                {countPortion && <small>1 {countPortion.unit}约 {Number(countPortion.edibleGrams)} 克</small>}
              </span>
            </label>
            <div className={styles.partInputs}>
              <div className={styles.quantity}>
                <DecimalInput key={showCount ? "count" : "grams"} id={id + "-amount-" + part.food.id} data-input-appearance="compact"
                  aria-label={labelOf(part) + (showCount ? "个数" : "可食克数")} disabled={!enabled}
                  value={showCount ? countValue : part.grams} min={0} max={1000000} precision={2} trimTrailingZeros
                  onValue={value => update(part.food.id, { amount: showCount && countPortion
                    ? { portionId: countPortion.id, quantity: normalized(value) } : { grams: normalized(value) } })}/>
                {!countPortion && <span>克</span>}
              </div>
              {countPortion && <div className={styles.units} role="group" aria-label={labelOf(part) + "计量单位"}>
                <button type="button" disabled={!enabled} aria-label={labelOf(part) + "按克"}
                  aria-pressed={!showCount} onClick={() => update(part.food.id, { showCount: false })}>克</button>
                <button type="button" disabled={!enabled} aria-label={labelOf(part) + "按" + countPortion.unit}
                  aria-pressed={showCount} onClick={() => update(part.food.id, { showCount: true })}>{countPortion.unit}</button>
              </div>}
            </div>
          </li>)}
          {!index && quickAdd && quickAddPart && !extraFoods.some(entry => entry.id === quickAdd.id) &&
            <li className={styles.optional}><span><strong>{labelOf(quickAddPart)}</strong><small>可选 · 熟重</small></span>
              <button type="button" className={styles.quiet} onClick={() => pickExtra(quickAdd)} disabled={rows.length >= 30}>
                ＋ 加{labelOf(quickAddPart)}
              </button>
            </li>}
        </ul>
      </div>)}
    </section>
    <RecipeSources food={food} parts={total ? parts : []}/>
    {onAdd && <div className={styles.footer}>
      <button type="button" className={library.add} onClick={add} disabled={disabled || !total || Boolean(tooLarge) || maxItems === 0}>
        {edit ? "更新本餐" : "加入本餐"}
      </button>
    </div>}
  </section>;
}
