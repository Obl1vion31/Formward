"use client";

import { useState, type ReactNode, type Ref } from "react";
import { DecimalInput } from "@/components/decimal-input";
import { FoodArt } from "./food-art";
import { MealEntryReadings } from "./meal-entry-readings";
import { decimal, formatNutrition, sumNutrition, type ItemDraft } from "./model";
import { referenceFoodName, referenceNutrition, type ReferenceCatalogFood, type ReferenceFood, type ReferenceMealLink, type ReferencePortion } from "./reference-food";
import styles from "./reference-library.module.css";

export type ReferencePick = { item: ItemDraft; food: ReferenceFood };

function Preparation({ food }: { food: ReferenceFood }) {
  const state = food.state === "cooked" ? "熟食" : food.state === "ready" ? "食用态" : food.method === "干" ? "干重" : "生重";
  if (food.components) return <p>整餐 · {food.sourceKind === "estimated" ? "配方估算" : "成品实测样本"}</p>;
  return <p>{state} · {referenceFoodName(food) === food.name ? food.preparation : "按可食部计量"}</p>;
}

function makePick(food: ReferenceFood, quantity: string, portion?: ReferencePortion, estimate?: string): ReferencePick {
  return { food, item: {
    name: food.name,
    kind: "food",
    referenceFood: { id: food.id, version: food.version, portionId: portion?.id },
    unit: portion?.unit ?? food.basisUnit ?? "g",
    quantity,
    amountDecision: estimate ? "estimate_accepted" : "provided",
    sourceKind: food.sourceKind ?? "composition_table",
    ...(estimate ? { basis: estimate } : {}),
  } };
}

const valid = (value: string) => decimal.safeParse(value).success && Number(value) > 0;

export function ReferenceDetails({ food, back, onAdd, openMeal, relatedStatus, maxItems = 50, disabled, headingRef, id }: {
  food: ReferenceCatalogFood;
  back?: { label: string; action: () => void };
  onAdd?: (picks: readonly ReferencePick[]) => void;
  openMeal?: (meal: ReferenceMealLink, trigger: HTMLButtonElement) => void;
  relatedStatus?: ReactNode;
  maxItems?: number;
  disabled?: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  id: string;
}) {
  const portion = food.portions[0];
  const components = food.components ?? [];
  const isMeal = components.length > 0;
  const volume = food.basisUnit === "mL";
  const [split, setSplit] = useState(false);
  const [choice, choose] = useState<"half" | "one" | "custom" | null>(isMeal ? "one" : portion ? null : "custom");
  const [measured, setMeasured] = useState("");
  const [partEdits, setPartEdits] = useState<Record<number, { grams?: string; enabled?: boolean }>>({});
  const quantity = choice === "half" ? "0.5" : choice === "one" ? "1" : choice === "custom" ? measured : "";
  const byPortion = choice === "half" || choice === "one" ? portion : undefined;
  const validAmount = valid(quantity);
  const total = referenceNutrition(food, validAmount ? quantity : null, byPortion?.id);
  const withinLimit = Object.values(total.nutrition).every(value => value === null || Number(value) <= 1000000);
  const parts = components.map(({ grams }, index) => {
    const edit = partEdits[index];
    const suggested = choice === "half" ? String(Number(grams) / 2) : choice === "custom" && validAmount ? "" : grams;
    return { enabled: edit?.enabled ?? true, grams: edit?.grams ?? suggested, measured: edit?.grams !== undefined };
  });
  const selectedParts = parts.flatMap((part, index) => part.enabled ? [{ ...part, component: components[index] }] : []);
  const validSplit = selectedParts.length > 0 && selectedParts.every(part => valid(part.grams));
  const splitTotals = validSplit ? sumNutrition(selectedParts.map(part => referenceNutrition(part.component.food, part.grams).nutrition)) : null;
  const splitTooLarge = splitTotals && Object.values(splitTotals.values).some(value => value !== null && Number(value) > 1000000);
  const count = split ? selectedParts.length : 1;
  const validPick = (split ? validSplit && !splitTooLarge : validAmount && withinLimit) && count <= maxItems;

  function add() {
    if (!validPick || disabled) return;
    onAdd?.(split ? selectedParts.map(({ component, grams, measured }) =>
      makePick(component.food, grams, undefined, measured ? undefined : food.name + " · 标准搭配约 " + grams + " g")) :
      [makePick(food, quantity, byPortion)]);
  }

  const action = onAdd && <button type="button" className={styles.add} onClick={add} disabled={disabled || !validPick}>加入本餐</button>;
  const calorieText = (value: string | null, approximate = true) => value === null ? "热量未知" :
    (approximate ? "约 " : "") + formatNutrition(value, "caloriesKcal") + " 千卡";

  return <section className={styles.detail} id={id} aria-label="参考食材详情">
    {back && <button type="button" className={styles.back} onClick={back.action}>{back.label}</button>}
    <div className={styles.figureHeader}>
      <FoodArt illustration={food.illustration} detail/>
      <div>
        <h3 tabIndex={-1} ref={headingRef}>{referenceFoodName(food)}</h3>
        <Preparation food={food}/>
      </div>
    </div>
    <p className={styles.basis}>{volume ? "每 100 mL" : "每 100 g 可食部"}</p>
    <div className={styles.detailsReadings}><MealEntryReadings nutrition={food.nutrition}/></div>
    {onAdd && <section className={styles.amount} aria-label="本次食用量">
      <h4>实际吃了多少</h4>
      {isMeal && <div className={styles.amountChoices} role="group" aria-label="整餐记录方式">
        <button type="button" aria-pressed={!split} onClick={() => setSplit(false)}>按整份记</button>
        <button type="button" aria-pressed={split} onClick={() => setSplit(true)}>拆开记</button>
      </div>}
      {!split && <>
        {portion && <div className={styles.amountChoices} data-meal-portion={isMeal || undefined} role="group" aria-label="选择份量">
          <button type="button" aria-pressed={choice === "half"} onClick={() => choose("half")}>半{portion.unit}</button>
          <button type="button" aria-pressed={choice === "one"} onClick={() => choose("one")}>一{portion.unit}</button>
          <button type="button" aria-pressed={choice === "custom"} onClick={() => choose("custom")}>克</button>
        </div>}
        {choice === "custom" && <label className={styles.amountInput}>{volume ? "饮用毫升数" : "可食克数"}
          <DecimalInput aria-label={volume ? "饮用毫升数" : "可食克数"} value={measured} onValue={setMeasured}
            min={0} max={1000000} precision={2} trimTrailingZeros placeholder={volume ? "mL" : "g"}/>
        </label>}
        {validAmount && withinLimit && <p className={styles.amountValues} aria-live="polite">
          <span>{volume ? Number(total.volumeMl) + " mL" : "可食部" + (byPortion ? "约 " +
            Math.round(Number(total.edibleGrams)) : " " + Number(total.edibleGrams)) + " g"}</span>
          <strong>{calorieText(total.nutrition.caloriesKcal, food.sourceKind !== "label")}</strong>
        </p>}
      </>}
      {(!split && validAmount && !withinLimit || split && splitTooLarge) && <p role="alert">换算结果过大，请检查食量。</p>}
      {count > maxItems && <p role="alert">本餐还可加入 {maxItems} 项，请减少所选分项。</p>}
    </section>}
    {isMeal && <section className={styles.components} aria-label="整餐组成">
      <h4>{split ? "分项食用量" : "整餐组成"}</h4>
      {food.sourceKind === "composition_table" &&
        <p>整份采用实测样本，分项按下面的搭配估算。</p>}
      <ul>
        {components.map(({ food: component, grams, role }, index) => <li key={component.id}>
          {split ? <>
            <label className={styles.componentChoice}>
              <input type="checkbox" checked={parts[index].enabled}
                onChange={event => {
                  const enabled = event.currentTarget.checked;
                  setPartEdits(previous => ({ ...previous, [index]: { ...previous[index], enabled } }));
                }}/>
              <span>{component.name}<small>{role}{!parts[index].measured ? " · 约" : ""}</small></span>
            </label>
            <div className={styles.componentAmount}>
              <DecimalInput aria-label={component.name + "可食克数"} value={parts[index].grams}
                disabled={!parts[index].enabled} min={0} max={1000000} precision={2} trimTrailingZeros
                onValue={value => setPartEdits(previous => ({ ...previous, [index]: { ...previous[index], grams: value } }))}/>
              <span>g</span>
            </div>
          </> : <>
            <span>{component.name}<small>{role}</small></span>
            <span className={styles.componentReading}>约 {Number(grams)} g</span>
          </>}
        </li>)}
      </ul>
      {split && splitTotals && !splitTooLarge && <p className={styles.amountValues} aria-live="polite">
        <span>分项合计 · {selectedParts.reduce((sum, part) => sum + Math.round(Number(part.grams) * 100), 0) / 100} g</span>
        <strong>{calorieText(splitTotals.values.caloriesKcal)}{splitTotals.incomplete.caloriesKcal && splitTotals.values.caloriesKcal !== null ? " · 已知部分" : ""}</strong>
      </p>}
    </section>}
    {isMeal && action}
    <div className={styles.referenceNotes} data-after-meal-add={isMeal && !!onAdd || undefined}>
      {isMeal && <p>{food.preparation}</p>}
      {portion && !split && <p>参考份量 · {portion.label} · 1{portion.unit}约 {Number(portion.edibleGrams)} g</p>}
      <p>{food.sourceKind === "estimated" ? "配方估算 · " : ""}{food.source.dataset} · {food.source.recordId}</p>
      <a href={food.source.url} title={food.source.title} target="_blank" rel="noreferrer">查看来源</a>
      {!!food.recipeIngredients?.length && <details className={styles.recipe}>
        <summary>查看配方依据</summary>
        <ul>{food.recipeIngredients.map(ingredient => <li key={ingredient.name}>
          {ingredient.name} {Number(ingredient.edibleGrams)} g
          {ingredient.nutritionGrams && "（按 " + Number(ingredient.nutritionGrams) + " g 原料计营养）"} ·{" "}
          <a href={ingredient.source.url} target="_blank" rel="noreferrer" title={ingredient.source.title}>{ingredient.source.recordId}</a>
        </li>)}</ul>
      </details>}
    </div>
    {!isMeal && action}
    {!!food.relatedMeals?.length && openMeal && <section className={styles.related} aria-label="相关整餐">
      <h4>相关整餐</h4>
      <ul>{food.relatedMeals.map(meal => <li key={meal.id}>
        <button type="button" onClick={event => openMeal(meal, event.currentTarget)}>{meal.name}<span aria-hidden="true">›</span></button>
      </li>)}</ul>
      {relatedStatus}
    </section>}
  </section>;
}
