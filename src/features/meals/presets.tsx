"use client";
import type { ReactNode } from "react";
import { searchFoodPresets } from "./food-presets";
import { foodSpecification, formatNutrition, sourceLabels, type FoodDraft, type FoodView, type Metric } from "./model";
import { ImageGallery } from "./photos";
import styles from "./meals.module.css";
const columns: Metric[] = ["proteinG", "carbsG", "fatG", "caloriesKcal"];
export function FoodTable<T extends FoodDraft>({ foods, actions }: { foods: T[]; actions: (food: T) => ReactNode }) {
  return <div className={styles.foodTableViewport}><table className={styles.foodTable}><thead><tr><th scope="col">食材／规格</th><th scope="col">营养基准</th><th scope="col">蛋白质<small>g</small></th><th scope="col">碳水化合物<small>g</small></th><th scope="col">脂肪<small>g</small></th><th scope="col">能量<small>kcal</small></th><th scope="col">操作</th></tr></thead><tbody>
    {foods.map((f, index) => <tr key={index}><th scope="row"><strong>{f.name}</strong><span>{[f.brand, foodSpecification(f.preparation)].filter(Boolean).join(" · ")}</span><details><summary>{sourceLabels[f.sourceKind]} · 详情</summary><p className={styles.notes}>{f.basis || "未记录详细依据。"}</p>{f.preparation && <p>{foodSpecification(f.preparation)}</p>}{f.evidenceUrl && <a href={f.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}<ImageGallery ids={f.imageIds}/></details></th><td>每 {Number(f.baseQuantity)}{f.unit}</td>{columns.map(m => <td key={m}>{formatNutrition(f.nutrition[m], m)}</td>)}<td><div className={styles.actions}>{actions(f)}</div></td></tr>)}
  </tbody></table></div>;
}
export function FoodPresets({ query, foods, adopt }: { query: string; foods: FoodView[]; adopt: (draft: FoodDraft) => void }) {
  const rows = searchFoodPresets(query).filter(p => !foods.some(f => !f.deletedAt && f.name === p.name && f.preparation === p.preparation));
  return rows.length ? <section className={styles.presetList}><h2>基础食材</h2><p className={styles.hint}>采用后加入自己的食材库。</p><FoodTable foods={rows} actions={f => <button onClick={() => adopt(f)}>采用</button>} /></section> : null;
}
