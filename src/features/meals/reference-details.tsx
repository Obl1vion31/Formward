"use client";

import { useState, type Ref } from "react";
import { DecimalInput } from "@/components/decimal-input";
import { FoodArt } from "./food-art";
import { MealEntryReadings } from "./meal-entry-readings";
import { decimal, formatNutrition, type ItemDraft } from "./model";
import { referenceNutrition, type ReferenceFood } from "./reference-food";
import styles from "./reference-library.module.css";

function Preparation({ food }: { food: ReferenceFood }) {
  const state = food.state === "cooked" ? "熟食" : food.method === "干" ? "干重" : "生重";
  return <p>{state} · {food.preparation}</p>;
}

export function ReferenceDetails({ food, back, onAdd, disabled, headingRef, id }: {
  food: ReferenceFood;
  back: () => void;
  onAdd?: (item: ItemDraft, food: ReferenceFood) => void;
  disabled?: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  id: string;
}) {
  const portion = food.portions[0];
  const [choice, choose] = useState<"half" | "one" | "g" | null>(portion ? null : "g");
  const [grams, setGrams] = useState("");
  const quantity = choice === "half" ? "0.5" : choice === "one" ? "1" : choice === "g" ? grams : "";
  const byPortion = choice === "half" || choice === "one" ? portion : undefined;
  const validAmount = decimal.safeParse(quantity).success && Number(quantity) > 0;
  const total = referenceNutrition(food, validAmount ? quantity : null, byPortion?.id);
  const withinLimit = Object.values(total.nutrition).every(value => value === null || Number(value) <= 1000000);

  function add() {
    if (!validAmount || !withinLimit || disabled) return;
    onAdd?.({
      name: food.name,
      kind: "food",
      referenceFood: { id: food.id, version: food.version, portionId: byPortion?.id },
      unit: byPortion?.unit ?? "g",
      quantity,
      amountDecision: "provided",
      sourceKind: "composition_table",
    }, food);
  }

  return <section className={styles.detail} id={id} aria-label="参考食材详情">
    <button type="button" className={styles.back} onClick={back}>← 返回食材列表</button>
    <div className={styles.figureHeader}>
      <FoodArt illustration={food.illustration} detail/>
      <div>
        <h3 tabIndex={-1} ref={headingRef}>{food.name}</h3>
        <Preparation food={food}/>
      </div>
    </div>
    <p className={styles.basis}>每 100 g 可食部</p>
    <div className={styles.detailsReadings}><MealEntryReadings nutrition={food.nutrition}/></div>
    {onAdd && <section className={styles.amount} aria-label="本次食用量">
      <h4>实际吃了多少</h4>
      {portion && <div className={styles.amountChoices} role="group" aria-label="选择份量">
        <button type="button" aria-pressed={choice === "half"} onClick={() => choose("half")}>半{portion.unit}</button>
        <button type="button" aria-pressed={choice === "one"} onClick={() => choose("one")}>一{portion.unit}</button>
        <button type="button" aria-pressed={choice === "g"} onClick={() => choose("g")}>克</button>
      </div>}
      {choice === "g" && <label className={styles.amountInput}>可食克数
        <DecimalInput aria-label="可食克数" value={grams} onValue={setGrams} min={0} max={1000000} precision={2} placeholder="g"/>
      </label>}
      {validAmount && withinLimit && <p className={styles.amountValues} aria-live="polite">
        <span>可食部{byPortion ? "约 " + Math.round(Number(total.edibleGrams)) : " " + Number(total.edibleGrams)} g</span>
        {total.nutrition.caloriesKcal === null ? <span>热量未知</span> : <strong>约 {formatNutrition(total.nutrition.caloriesKcal, "caloriesKcal")} 千卡</strong>}
      </p>}
      {validAmount && !withinLimit && <p role="alert">换算结果过大，请检查食量。</p>}
    </section>}
    <div className={styles.referenceNotes}>
      {portion && <p>参考份量 · {portion.label} · 1{portion.unit}约 {Number(portion.edibleGrams)} g</p>}
      <p>{food.source.dataset} · {food.source.recordId}</p>
      <a href={food.source.url} target="_blank" rel="noreferrer">查看来源</a>
    </div>
    {onAdd && <button type="button" className={styles.add} onClick={add} disabled={disabled || !validAmount || !withinLimit}>加入本餐</button>}
  </section>;
}
