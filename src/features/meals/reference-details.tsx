"use client";

import { useState, type ReactNode, type Ref } from "react";
import { DecimalInput } from "@/components/decimal-input";
import { FoodArt } from "./food-art";
import { MealEntryReadings } from "./meal-entry-readings";
import { decimal, formatNutrition, type ItemDraft } from "./model";
import { referenceFoodName, referenceNutrition, type ReferenceCatalogFood, type RecipePart, type ReferenceFood, type ReferenceMealLink, type ReferencePortion } from "./reference-food";
import { ReferenceRecipeDetails, type RecipeEdit } from "./reference-recipe-details";
import styles from "./reference-library.module.css";

export type ReferencePick = { item: ItemDraft; food: ReferenceFood; parts?: readonly RecipePart[] };

function Preparation({ food }: { food: ReferenceFood }) {
  const state = food.state === "cooked" ? "熟食" : food.state === "ready" ? "食用态" : food.method === "干" ? "干重" : "生重";
  return <p>{state} · {referenceFoodName(food) === food.name ? food.preparation : "按可食部计量"}</p>;
}

function makePick(food: ReferenceFood, quantity: string, portion?: ReferencePortion): ReferencePick {
  return { food, item: {
    name: food.name,
    kind: "food",
    referenceFood: { id: food.id, version: food.version, portionId: portion?.id },
    unit: portion?.unit ?? food.basisUnit ?? "g",
    quantity,
    amountDecision: "provided",
    sourceKind: food.sourceKind ?? "composition_table",
  } };
}

const valid = (value: string) => decimal.safeParse(value).success && Number(value) > 0;

type DetailProps = {
  food: ReferenceCatalogFood;
  back?: { label: string; action: () => void };
  onAdd?: (picks: readonly ReferencePick[]) => void;
  openMeal?: (meal: ReferenceMealLink, trigger: HTMLButtonElement) => void;
  relatedStatus?: ReactNode;
  maxItems?: number;
  disabled?: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  id: string;
  edit?: RecipeEdit;
};

export function ReferenceDetails(props: DetailProps) {
  const { food } = props;
  return food.recipe
    ? <ReferenceRecipeDetails {...props} food={{ ...food, recipe: food.recipe }}/>
    : <SingleReferenceDetails {...props}/>;
}

function SingleReferenceDetails({ food, back, onAdd, openMeal, relatedStatus, maxItems = 50, disabled, headingRef, id }: DetailProps) {
  const portion = food.portions[0];
  const volume = food.basisUnit === "mL";
  const [choice, choose] = useState<"half" | "one" | "custom" | null>(portion ? null : "custom");
  const [measured, setMeasured] = useState("");
  const quantity = choice === "half" ? "0.5" : choice === "one" ? "1" : choice === "custom" ? measured : "";
  const byPortion = choice === "half" || choice === "one" ? portion : undefined;
  const validAmount = valid(quantity);
  const total = referenceNutrition(food, validAmount ? quantity : null, byPortion?.id);
  const withinLimit = Object.values(total.nutrition).every(value => value === null || Number(value) <= 1000000);
  const validPick = validAmount && withinLimit && maxItems > 0;

  function add() {
    if (!validPick || disabled) return;
    onAdd?.([makePick(food, quantity, byPortion)]);
  }

  const action = onAdd && <button type="button" className={styles.add} data-guide-target="meal-library-add" onClick={add} disabled={disabled || !validPick}>加入本餐</button>;
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
        {portion && <div className={styles.amountChoices} role="group" aria-label="选择份量" data-guide-target={choice!=="custom"?"meal-library-portion":undefined}>
          <button type="button" aria-pressed={choice === "half"} onClick={() => choose("half")}>半{portion.unit}</button>
          <button type="button" aria-pressed={choice === "one"} onClick={() => choose("one")}>一{portion.unit}</button>
          <button type="button" aria-pressed={choice === "custom"} onClick={() => choose("custom")}>克</button>
        </div>}
        {choice === "custom" && <label className={styles.amountInput}>{volume ? "饮用毫升数" : "可食克数"}
          <DecimalInput data-guide-target="meal-library-portion" aria-label={volume ? "饮用毫升数" : "可食克数"} value={measured} onValue={setMeasured}
            min={0} max={1000000} precision={2} trimTrailingZeros placeholder={volume ? "mL" : "g"}/>
        </label>}
        {validAmount && withinLimit && <p className={styles.amountValues} aria-live="polite">
          <span>{volume ? Number(total.volumeMl) + " mL" : "可食部" + (byPortion ? "约 " +
            Math.round(Number(total.edibleGrams)) : " " + Number(total.edibleGrams)) + " g"}</span>
          <strong>{calorieText(total.nutrition.caloriesKcal, food.sourceKind !== "label")}</strong>
        </p>}
      {validAmount && !withinLimit && <p role="alert">换算结果过大，请检查食量。</p>}
    </section>}
    <div className={styles.referenceNotes}>
      {portion && <p>参考份量 · {portion.label} · 1{portion.unit}约 {Number(portion.edibleGrams)} g</p>}
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
    {action}
    {!!food.relatedMeals?.length && openMeal && <section className={styles.related} aria-label="相关整餐">
      <h4>相关整餐</h4>
      <ul>{food.relatedMeals.map(meal => <li key={meal.id}>
        <button type="button" onClick={event => openMeal(meal, event.currentTarget)}>{meal.name}<span aria-hidden="true">›</span></button>
      </li>)}</ul>
      {relatedStatus}
    </section>}
  </section>;
}
