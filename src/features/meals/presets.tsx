"use client";
import recordUI from "@/components/record-ui.module.css";
import type { ReactNode } from "react";
import { foodSpecification, formatNutrition, sourceLabels, type FoodDraft, type Metric } from "./model";
import { ImageGallery } from "./photos";
import styles from "./meals.module.css";
const columns: Metric[] = ["proteinG", "carbsG", "fatG", "caloriesKcal"];
export function FoodTable<T extends FoodDraft>({ foods, actions, details }: { foods: T[]; actions: (food: T) => ReactNode; details: (food: T) => void }) {
  return <div className={styles.foodTableViewport}><table className={styles.foodTable}><thead><tr><th scope="col">食材／规格</th><th scope="col">营养基准</th><th scope="col">蛋白质（g）</th><th scope="col">碳水（g）</th><th scope="col">脂肪（g）</th><th scope="col">热量（kcal）</th><th scope="col">操作</th></tr></thead><tbody>
    {foods.map((f, index) => <tr key={index}><th scope="row" className={styles.rowName}><strong>{f.name}</strong><span>{[f.brand, foodSpecification(f.preparation)].filter(Boolean).join(" · ")}</span></th><td className={styles.rowAmount}>每 {Number(f.baseQuantity)}{f.unit}</td>{columns.map(m => <td key={m} className={m === "caloriesKcal" ? styles.rowEnergy : styles.rowMacro} data-label={{proteinG:"蛋白",carbsG:"碳水",fatG:"脂肪",caloriesKcal:"热量"}[m]}>{formatNutrition(f.nutrition[m], m)}<small className={styles.mobileUnit}>{m === "caloriesKcal" ? " kcal" : "g"}</small></td>)}<td className={styles.rowActions}><div className={styles.actions}><span className={styles.foodInlineActions}>{actions(f)}</span><button className={recordUI.secondary} aria-label={`${f.name}详情`} onClick={()=>details(f)}>详情</button></div></td></tr>)}
  </tbody></table></div>;
}
export function FoodDetails({ food }: { food: FoodDraft }) {
  return <section className={styles.foodDetails}><h3>{food.name}</h3><p className={styles.notes}>{[food.brand,foodSpecification(food.preparation)].filter(Boolean).join(" · ")}</p><p>每 {Number(food.baseQuantity)}{food.unit} · {sourceLabels[food.sourceKind]}{food.servingQuantity&&food.servingUnit&&<> · 1{food.servingUnit} = {Number(food.servingQuantity)}{food.unit}</>}</p><dl className={styles.foodNutrients}>{(["caloriesKcal","proteinG","carbsG","fatG"] as const).map(metric=><div key={metric}><dt>{{caloriesKcal:"热量",proteinG:"蛋白质",carbsG:"碳水",fatG:"脂肪"}[metric]}</dt><dd>{formatNutrition(food.nutrition[metric],metric)}<small>{metric==="caloriesKcal"?"kcal":"g"}</small></dd></div>)}</dl>{food.basis&&<div className={styles.foodAnalysis}><h4>{food.sourceKind==="estimated"?"估算分析":"数据来源"}</h4><p className={styles.notes}>{food.basis}</p></div>}{food.evidenceUrl&&<a href={food.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}<ImageGallery ids={food.imageIds}/></section>;
}
