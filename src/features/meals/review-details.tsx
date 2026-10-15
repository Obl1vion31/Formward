"use client";
import { formatNutrition, metricLabels, sourceLabels, type ItemDraft, type ItemView, type Metric } from "./model";
import styles from "./meals.module.css";
const foodMetrics: Metric[] = ["proteinG", "carbsG", "fatG", "caloriesKcal"];
const evidenceSources = { user: "用户提供", label: "标签转录", food_library: "食材库", composition_table: "成分表", estimate: "估算", unknown: "未知" };
export function NutritionTable({ items, actions, saved = false }: { items: ItemView[]; actions?: ItemDraft[]; saved?: boolean }) {
  const whole = items.some(item => item.kind === "whole"), foods = items.filter(item => item.kind === "food").length, misc = items.some(item => item.kind === "misc");
  return <div className={styles.composition}>
    <p className={styles.compositionSummary}>{whole ? "整餐合并估算 · 具体组成见备注" : foods + " 项食物分别记录" + (misc ? " · 剩余食物合并为 1 项" : "")}</p>
    <div className={styles.nutritionTableViewport}><table className={styles.nutritionTable}><thead><tr><th scope="col">食物／数量</th>{foodMetrics.map(m => <th scope="col" key={m}>{m === "carbsG" ? "碳水化合物" : metricLabels[m]}<small>{m === "caloriesKcal" ? "kcal" : "g"}</small></th>)}</tr></thead><tbody>
      {items.map((item, index) => { const input = actions?.[index] ?? item;
        const provenance = input.foodDraft ? saved ? "本次新增入库" : "确认后加入食材库" : input.foodId ? "引用食材库" : item.kind === "whole" ? "整餐估算" : item.kind === "misc" ? "剩余合并" : "直接记录";
        return <tr key={index}><th scope="row"><strong>{item.name}</strong><span>{item.quantity ? Number(item.quantity) + (item.unit ?? "") : "食用量未知"}{item.amountDecision === "estimate_accepted" && " · 份量估算"}</span><small>{provenance} · {sourceLabels[item.sourceKind]}</small></th>{foodMetrics.map(m => <td key={m}>{formatNutrition(item.nutrition[m], m)}</td>)}</tr>;
      })}
    </tbody></table></div>
  </div>;
}
export function MealEvidence({ items, notes }: { items: ItemView[]; notes?: string | null }) {
  return <details className={styles.evidence}><summary>查看估算依据与来源</summary>
    {items.map((item, index) => <section key={index}><h3>{item.name}</h3>
      {item.reviewExplanation && (["identity", "amount", "cooking", "nutrition"] as const).map(key => { const note = item.reviewExplanation?.[key]; return note ? <p key={key}><strong>{{ identity: "食物识别", amount: "食用量", cooking: "油酱与做法", nutrition: "营养" }[key]} · {evidenceSources[note.source]}</strong><br />{note.basis}{note.uncertainty && <><br /><span className={styles.hint}>不确定性：{note.uncertainty}</span></>}</p> : null; })}
      {item.foodSnapshot && <p>营养采用食材库保存的规格：每 {Number(item.foodSnapshot.baseQuantity)}{item.foodSnapshot.unit}；按本次食用量换算。{item.foodSnapshot.basis}</p>}
      {item.amountDecision === "estimate_accepted" && <p>食用量为用户接受的估算，营养来源独立核对。</p>}
      {item.basis && <p className={styles.notes}>{item.basis}</p>}
      {!item.reviewExplanation && !item.basis && !item.foodSnapshot && <p>此项未单独记录详细依据；{sourceLabels[item.sourceKind]}。未知信息保持为空。</p>}
      {item.evidenceUrl && <a href={item.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}
      {(item.sourceKind === "estimated" || item.amountDecision === "estimate_accepted") && <p className={styles.hint}>这是估算值，不代表本次食物的精确实测。</p>}
    </section>)}
    {notes && <section><h3>餐次备注</h3><p className={styles.notes}>{notes}</p></section>}
  </details>;
}
