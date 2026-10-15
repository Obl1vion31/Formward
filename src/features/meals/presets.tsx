"use client";
import type { ReactNode } from "react";
import { searchFoodPresets } from "./food-presets";
import { foodSpecification, formatNutrition, sourceLabels, type FoodDraft, type FoodView, type Metric } from "./model";
import { ImageGallery } from "./photos";
import styles from "./meals.module.css";
const columns: Metric[] = ["proteinG", "carbsG", "fatG", "caloriesKcal"];
export function FoodTable<T extends FoodDraft>({ foods, actions, details }: { foods: T[]; actions: (food: T) => ReactNode; details: (food: T) => void }) {
  return <div className={styles.foodTableViewport}><table className={styles.foodTable}><thead><tr><th scope="col">食材／规格</th><th scope="col">营养基准</th><th scope="col">蛋白质（g）</th><th scope="col">碳水（g）</th><th scope="col">脂肪（g）</th><th scope="col">热量（kcal）</th><th scope="col">操作</th></tr></thead><tbody>
    {foods.map((f, index) => <tr key={index}><th scope="row" className={styles.rowName}><strong>{f.name}</strong><span>{[f.brand, foodSpecification(f.preparation)].filter(Boolean).join(" · ")}</span></th><td className={styles.rowAmount}>每 {Number(f.baseQuantity)}{f.unit}</td>{columns.map(m => <td key={m} className={m === "caloriesKcal" ? styles.rowEnergy : styles.rowMacro} data-label={{proteinG:"蛋白",carbsG:"碳水",fatG:"脂肪",caloriesKcal:"热量"}[m]}>{formatNutrition(f.nutrition[m], m)}<small className={styles.mobileUnit}>{m === "caloriesKcal" ? " kcal" : "g"}</small></td>)}<td className={styles.rowActions}><div className={styles.actions}><span className={styles.foodInlineActions}>{actions(f)}</span><button aria-label={`${f.name}详情`} onClick={()=>details(f)}>详情</button></div></td></tr>)}
  </tbody></table></div>;
}
export function FoodDetails({ food }: { food: FoodDraft }) {
  return <section className={styles.foodDetails}><h3>{food.name}</h3><p className={styles.notes}>{[food.brand,foodSpecification(food.preparation)].filter(Boolean).join(" · ")}</p><p>每 {Number(food.baseQuantity)}{food.unit} · {sourceLabels[food.sourceKind]}</p>{food.basis&&<div className={styles.foodAnalysis}><h4>{food.sourceKind==="estimated"?"估算分析":"数据来源"}</h4><p className={styles.notes}>{food.basis}</p></div>}{food.evidenceUrl&&<a href={food.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}<ImageGallery ids={food.imageIds}/></section>;
}
export function FoodPresets({ query, foods, adopt, details }: { query: string; foods: FoodView[]; adopt: (draft: FoodDraft) => void; details: (draft: FoodDraft) => void }) {
  const rows = searchFoodPresets(query).filter(p => !foods.some(f => !f.deletedAt && f.name === p.name && f.preparation === p.preparation));
  return rows.length ? <section className={styles.presetList}><h2>基础食材</h2><p className={styles.hint}>采用后加入自己的食材库。</p><FoodTable foods={rows} details={details} actions={f => <button onClick={() => adopt(f)}>采用</button>} /></section> : null;
}
