"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Disclosure } from "@/components/disclosure";
import { formatNutrition, metricLabels, sourceLabels, type ItemView, type MealView, type Totals } from "./model";
import { ItemEvidence } from "./review-details";
import { ImageGallery } from "./photos";
import styles from "./saved-meal-list.module.css";

const macros = ["proteinG", "carbsG", "fatG"] as const;
const mealLabel = (name: string) => ({ breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐", supper: "夜宵" } as Record<string, string>)[name.toLowerCase()] ?? name;

function Chevron() {
  return <svg className={styles.chevron} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>;
}

function MacroValues({ totals, item }: { totals?: Totals; item?: ItemView }) {
  return <div className={styles.macros} data-saved-macros>{macros.map(metric => <span key={metric}>
    <span>{metricLabels[metric]}</span> <strong>{formatNutrition(totals ? totals.values[metric] : item?.nutrition[metric] ?? null, metric)}<small className={styles.unit}> g</small></strong>
    {totals?.incomplete[metric] && totals.values[metric] != null && <small className={styles.partial}>已知部分</small>}
  </span>)}</div>;
}

function SavedFood({ item }: { item: ItemView }) {
  const provenance = item.foodSnapshot && !item.foodId ? "历史食材规格" : item.foodId ? "引用食材库" : "自由填写";
  return <Disclosure className={styles.food} summary={<>
    <span className={styles.foodIdentity}><strong>{item.name}</strong><small>{item.quantity ? (item.amountDecision === "estimate_accepted" ? "约 " : "") + Number(item.quantity) + (item.unit ?? "") : "份量未知"}</small></span>
    <span className={styles.foodEnergy}>{formatNutrition(item.nutrition.caloriesKcal, "caloriesKcal")}<small className={styles.unit}> kcal</small></span><Chevron />
  </>}>
    <div className={styles.foodDetails} data-saved-food-details><MacroValues item={item} /><p className={styles.provenance}>{provenance} · {sourceLabels[item.sourceKind]}</p><ItemEvidence item={item} /></div>
  </Disclosure>;
}

/** Escape先收起当前食物、附件或餐次，下一次才交回日期详情。 */
function closeDetail(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Escape" || !(event.target instanceof Element)) return;
  const detail = event.target.closest<HTMLDetailsElement>("details[open]");
  if (!detail || !event.currentTarget.contains(detail)) return;
  event.preventDefault(); event.stopPropagation(); detail.open = false;
  detail.querySelector<HTMLElement>(":scope > summary")?.focus({ preventScroll: true });
}

/** 已保存记录的阅读组件；计算、编辑、确认与删除仍由调用方负责。 */
export function SavedMealList({ meals, renderActions, initialLimit }: { meals: MealView[]; renderActions?: (meal: MealView) => ReactNode; initialLimit?: number }) {
  const row = (meal: MealView) => <Disclosure key={meal.id} className={styles.meal} summary={<>
    <span className={styles.mealTitle}><strong>{mealLabel(meal.mealType)}</strong><small data-meal-preview>{meal.items.map(item => item.name).join("、")}</small></span>
    <span className={styles.mealEnergy}>{formatNutrition(meal.totals.values.caloriesKcal, "caloriesKcal")}<small className={styles.unit}> kcal</small>{meal.totals.incomplete.caloriesKcal && meal.totals.values.caloriesKcal != null && <small className={styles.partial}>已知部分</small>}</span><Chevron />
  </>}>
    <MacroValues totals={meal.totals} />
    <div className={styles.foods} data-saved-food-list>{meal.items.map(item => <SavedFood key={item.id} item={item} />)}</div>
    {(meal.notes?.trim() || meal.imageIds?.length) ? <Disclosure className={styles.attachments} summary={<><span>备注与照片{meal.imageIds?.length ? <small> · {meal.imageIds.length}张</small> : null}</span><Chevron /></>}>
      <div data-saved-attachments>{meal.notes?.trim() && <p className={styles.notes}>{meal.notes}</p>}<ImageGallery ids={meal.imageIds} /></div>
    </Disclosure> : null}
    {renderActions && <div className={styles.actions}>{renderActions(meal)}</div>}
  </Disclosure>;
  const limit = initialLimit ?? meals.length;
  return <div className={styles.list} data-meal-day-list onKeyDown={closeDetail}>
    {meals.slice(0, limit).map(row)}
    {meals.length > limit && <Disclosure className={styles.moreMeals} summary={<><span>还有 {meals.length - limit} 餐</span><Chevron /></>}>{meals.slice(limit).map(row)}</Disclosure>}
    {!meals.length && <p className={styles.empty}>这一天还没有饮食记录。</p>}
  </div>;
}
