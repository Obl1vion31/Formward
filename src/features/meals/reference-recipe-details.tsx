"use client";

import { useId, useRef, useState, type Ref } from "react";
import { DecimalInput } from "@/components/decimal-input";
import { RecipeArt, SavedRecipeParts } from "./food-art";
import { MealEntryReadings, MealNutrientValue } from "./meal-entry-readings";
import { decimal, emptyNutrition, metricLabels, type ItemDraft } from "./model";
import { recipeAmountBasis, recipePart, recipePartInputs, recipeTotals, validRecipePeople, wholeRecipeParts } from "./reference-recipe";
import { useReferenceRequest } from "./reference-request";
import type { RecipePart, ReferenceFood } from "./reference-food";
import type { ReferencePick } from "./reference-details";
import library from "./reference-library.module.css";
import styles from "./reference-recipe.module.css";

type Recipe = ReferenceFood & { recipe: NonNullable<ReferenceFood["recipe"]> };
export type RecipeEdit = { food: ReferenceFood; item: ItemDraft; parts: readonly RecipePart[] };
type Choice = "half" | "one" | "people" | "grams" | "legacy";
type ComponentEdit = { grams?: string; enabled?: boolean };
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

function initialChoice(edit: RecipeEdit | undefined): Choice {
  if (!edit || edit.item.referenceFood?.parts) return "one";
  if (!edit.item.referenceFood?.portionId) return "grams";
  if (edit.item.unit === "人份") return "people";
  if (Number(edit.item.quantity) === 0.5) return "half";
  return Number(edit.item.quantity) === 1 ? "one" : "legacy";
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
  const [split, setSplit] = useState(!!edit?.item.referenceFood?.parts);
  const [choice, choose] = useState<Choice>(() => initialChoice(edit));
  const [measured, setMeasured] = useState(() => edit?.item.quantity ?? "");
  const [people, setPeople] = useState(() => edit?.item.unit === "人份" ? edit.item.quantity ?? "" : "");
  const peopleField = useRef<HTMLInputElement>(null);
  const [edits, setEdits] = useState<Record<string, ComponentEdit>>(() => {
    if (!edit?.item.referenceFood?.parts) return {};
    return Object.fromEntries((food.components ?? []).map(part => {
      const saved = edit.parts.find(entry => entry.food.id === part.food.id);
      return [part.food.id, { enabled: Boolean(saved) }];
    }).concat(edit.parts.map(part => [part.food.id, { enabled: true, grams: part.grams }])));
  });
  const [extraFoods, setExtraFoods] = useState<readonly ReferenceFood[]>(() =>
    edit?.item.referenceFood?.parts ? edit.parts.filter(part => !food.components?.some(row => row.food.id === part.food.id)).map(part => part.food) : []);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const pickerId = useId();
  const extraTrigger = useRef<HTMLButtonElement>(null);
  const extraSearch = useRef<HTMLInputElement>(null);
  const inputs = useRef(new Map<string, HTMLDivElement>());
  const unitChoice = choice !== "grams";
  const serving = food.portions[0];
  const peoplePortion = food.portions.find(part => part.unit === "人份");
  const portion = choice === "people" ? peoplePortion ?? serving : serving;
  const quantity = choice === "half" ? "0.5" : choice === "one" ? "1" : normalized(choice === "people" ? people : measured);
  const portionId = unitChoice ? portion.id : undefined;
  const validAmount = choice === "people" ? validRecipePeople(quantity) : validGrams(quantity);
  const whole = validAmount ? wholeRecipeParts(food, quantity, portionId) : [];
  const defaults = split && !whole.length ? wholeRecipeParts(food, "1", serving.id) : whole;
  const defaultRows = food.components ?? [];
  const rows = [...defaultRows, ...(split ? extraFoods : []).map(extra => ({
    food: extra, role: "配菜" as const, grams: "", label: undefined, amountBasis: undefined,
  }))].map((entry, index) => {
    const reset = defaults.find(part => part.food.id === entry.food.id);
    const change = edits[entry.food.id];
    const saved = edit?.item.referenceFood?.parts && edit.parts.find(part => part.food.id === entry.food.id);
    const value = split ? normalized(change?.grams ?? reset?.grams ?? (index < defaultRows.length && defaults.length ? "0" : "")) :
      reset?.grams ?? (whole.length ? "0" : "");
    const enabled = !split || change?.enabled !== false;
    const part = recipePart(food, saved ? saved.food : entry.food, {
      grams: split && saved && change?.grams === saved.grams ? saved.grams : value,
      estimated: !split || (saved && change?.grams === saved.grams ? saved.estimated : change?.grams === undefined),
    });
    return { part, enabled, seasoning: entry.role === "酱料" || ["oil", "sauce", "sugar", "seasoning"].includes(entry.food.family) };
  });
  const selected = rows.filter(row => row.enabled);
  const parts = split ? selected.map(row => row.part) : whole;
  const ready = split ? parts.length > 0 && parts.every(part => validGrams(part.grams)) : whole.length > 0;
  const total = ready ? recipeTotals(parts) : null;
  const tooLarge = total && (Number(total.grams) > 1000000 ||
    Object.values(total.nutrition).some(value => value !== null && Number(value) > 1000000));
  const approximate = split ? parts.some(part => part.estimated) : unitChoice;
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
    setEdits(previous => ({ ...previous, [ingredientId]: { ...previous[ingredientId], ...change } }));
  }

  function pickExtra(extra: ReferenceFood) {
    const existing = rows.find(row => row.part.food.id === extra.id);
    if (!existing) setExtraFoods(previous => [...previous, extra]);
    update(extra.id, { enabled: true });
    setShowPicker(false);
    setSearch("");
    requestAnimationFrame(() => {
      const input = inputs.current.get(extra.id)?.querySelector("input");
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
    const item: ItemDraft = {
      kind: "food", name: food.name, referenceFood: {
        id: food.id, version: food.version,
        ...(split ? { parts: recipePartInputs(parts) } : { portionId }),
      },
      quantity: split ? total.grams : quantity, unit: split || !portionId ? "g" : portion.unit,
      amountDecision: "provided", sourceKind: "estimated",
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
        <p>{isDish && "单点菜 · "}{onAdd ? "配方估算 · 示例用量" : "配方估算 · 标准一份"}</p>
      </div>
      <RecipeArt food={food}/>
    </div>
    {onAdd && <>
      <div className={styles.mode} data-split={split || undefined} role="group" aria-label="记录方式">
        <button type="button" aria-pressed={!split} onClick={() => { setSplit(false); setShowPicker(false); }}>按整份记</button>
        <button type="button" aria-pressed={split} onClick={() => setSplit(true)}>拆开记</button>
      </div>
      {!split && <div className={styles.whole}>
        <div className={styles.portions} role="group" aria-label="整餐份量">
          <button type="button" aria-pressed={choice === "half"} onClick={() => choose("half")}>半份</button>
          <button type="button" aria-pressed={choice === "one"} onClick={() => choose("one")}>一份</button>
          <button type="button" aria-pressed={choice === "people"} onClick={() => {
            choose("people");
            requestAnimationFrame(() => peopleField.current?.focus({ preventScroll: true }));
          }}>多人份</button>
        </div>
        {choice === "people" && <div className={styles.quantity + " " + styles.peopleQuantity}>
          <input ref={peopleField} type="number" inputMode="numeric" step={1} min={2} max={1000000}
            data-input-appearance="compact" aria-label="食用人数" placeholder="人数" value={people}
            aria-invalid={!!people && !validAmount} onChange={event => setPeople(event.target.value)}/>
          <span>人</span>
        </div>}
        {(choice === "grams" || choice === "legacy") && <div className={styles.quantity}>
          <DecimalInput data-input-appearance="compact" aria-label={choice === "grams" ? "整份可食克数" : "原食用份数"} value={measured}
            min={0} max={1000000} onValue={setMeasured} precision={2} trimTrailingZeros placeholder={choice === "grams" ? "可食克数" : "份数"}/>
          <span>{choice === "grams" ? "克" : "份"}</span>
        </div>}
        <button type="button" className={styles.quiet + " " + styles.weigh} aria-pressed={choice === "grams"} onClick={() => {
          if (choice !== "grams") setMeasured(total ? String(Number(total.grams)) : "");
          choose("grams");
        }}>按克</button>
      </div>}
    </>}
    <details className={styles.overview} data-recipe-overview>
      <summary>
        <strong>本次总览</strong>
        <span className={styles.overviewValues} aria-live="polite">
          {total && !tooLarge ? <>
            <span>可食部{approximate ? "约 " : " "}{Number(total.grams)} g</span>
            <strong>{total.nutrition.caloriesKcal === null ? "热量未知" : <>约 <MealNutrientValue value={total.nutrition.caloriesKcal} metric="caloriesKcal"/></>}</strong>
          </> : <span>{tooLarge ? "食用量超出范围" : !split && choice === "people" ?
            people ? "请输入至少 2 人" : "待填写人数" : selected.length ? "待填写克数" : "请选择食材"}</span>}
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
      {[false, true].map(seasoning => <div className={styles.group} key={String(seasoning)}>
        <h5>{seasoning ? "调料" : "原料"}</h5>
        <ul>
          {rows.filter(row => row.seasoning === seasoning).map(({ part, enabled }) => <li key={part.food.id} data-recipe-part={part.food.id}>
            {split ? <label className={styles.checkLabel}>
              <input type="checkbox" aria-label={"计入" + labelOf(part)} checked={enabled}
                onChange={event => update(part.food.id, { enabled: event.target.checked })}/>
              <span><strong>{labelOf(part)}</strong><small>{recipeAmountBasis(part)}{enabled && part.estimated ? " · 约" : ""}</small></span>
            </label> : <span><strong>{labelOf(part)}</strong><small>{recipeAmountBasis(part)}</small></span>}
            {split ? <div className={styles.quantity} ref={element => {
              if (element) inputs.current.set(part.food.id, element);
              else inputs.current.delete(part.food.id);
            }}>
              <DecimalInput data-input-appearance="compact" aria-label={labelOf(part) + "可食克数"} disabled={!enabled} value={part.grams}
                min={0} max={1000000} precision={2} trimTrailingZeros onValue={grams => update(part.food.id, { grams })}/>
              <span>g</span>
            </div> : <span className={styles.grams}>{part.grams ? "约 " + Number(part.grams) + " g" : "—"}</span>}
          </li>)}
          {!seasoning && split && quickAdd && quickAddPart && !extraFoods.some(entry => entry.id === quickAdd.id) &&
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
