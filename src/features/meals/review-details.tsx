"use client";
import { Fragment, useId, useState } from "react";
import { formatNutrition, metricLabels, sourceLabels, type ItemDraft, type ItemView } from "./model";
import styles from "./meals.module.css";
const foodMetrics = ["proteinG", "carbsG", "fatG"] as const;
const evidenceSources = { user: "用户提供", label: "标签转录", food_library: "食材库", composition_table: "成分表", estimate: "估算", unknown: "未知" };
export function NutritionTable({ items, actions, saved = false }: { items: ItemView[]; actions?: ItemDraft[]; saved?: boolean }) {
  const [expanded, setExpanded] = useState<number | null>(null), id = useId();
  const library=items.filter((item,index)=>item.foodId||actions?.[index]?.foodDraft).length;
  return <div className={styles.composition}>
    <p className={styles.compositionSummary}>{items.length} 项记录 · 食材库 {library} 项 · 自由填写 {items.length-library} 项</p>
    <div className={styles.nutritionTableViewport}><table className={styles.nutritionTable}><thead><tr><th scope="col">食物</th><th scope="col">份量</th><th scope="col">热量（kcal）</th>{foodMetrics.map(metric => <th scope="col" key={metric}>{metricLabels[metric]}（g）</th>)}<th scope="col">详情</th></tr></thead><tbody>
      {items.map((item, index) => {
        const input = actions?.[index] ?? item;
        const provenance = input.foodDraft ? saved ? "本次新增入库" : "确认后加入食材库" : input.foodId ? "引用食材库" : "自由填写";
        return <Fragment key={index}><tr>
          <th scope="row" className={styles.rowName}><strong>{item.name}</strong></th>
          <td className={styles.rowAmount}>{item.quantity ? (item.amountDecision === "estimate_accepted" ? "约 " : "") + Number(item.quantity) + (item.unit ?? "") : "份量未知"}</td>
          <td className={styles.rowEnergy}>{formatNutrition(item.nutrition.caloriesKcal, "caloriesKcal")}<small className={styles.mobileUnit}> kcal</small></td>
          {foodMetrics.map(metric => <td key={metric} className={styles.rowMacro} data-label={{proteinG:"蛋白",carbsG:"碳水",fatG:"脂肪"}[metric]}>{formatNutrition(item.nutrition[metric], metric)}<small className={styles.mobileUnit}>g</small></td>)}
          <td className={styles.rowActions}><button aria-label={`${item.name}详情`} aria-expanded={expanded === index} aria-controls={`${id}-${index}`} onClick={() => setExpanded(expanded === index ? null : index)}>详情</button></td>
        </tr>{expanded === index && <tr className={styles.itemEvidenceRow} id={`${id}-${index}`}><td colSpan={7}><p>{provenance} · {sourceLabels[item.sourceKind]}</p><ItemEvidence item={item} /></td></tr>}</Fragment>;
      })}
    </tbody></table></div>
  </div>;
}
function ItemEvidence({ item }: { item: ItemView }) {
  return <div className={styles.itemEvidence}>
    {item.reviewExplanation && (["identity", "amount", "cooking", "nutrition"] as const).map(key => { const note = item.reviewExplanation?.[key]; return note ? <p key={key}><strong>{{ identity: "食物识别", amount: "食用量", cooking: "油酱与做法", nutrition: "营养" }[key]} · {evidenceSources[note.source]}</strong><br />{note.basis}{note.uncertainty && <><br /><span className={styles.hint}>不确定性：{note.uncertainty}</span></>}</p> : null; })}
    {item.foodSnapshot && <p>营养采用食材库保存的规格：每 {Number(item.foodSnapshot.baseQuantity)}{item.foodSnapshot.unit}；按本次食用量换算。{item.foodSnapshot.basis}</p>}
    {item.amountDecision === "estimate_accepted" && <p>食用量为用户接受的估算，营养来源独立核对。</p>}
    {item.basis && item.basis !== item.foodSnapshot?.basis && <p className={styles.notes}>{item.basis}</p>}
    {!item.reviewExplanation && !item.basis && !item.foodSnapshot && <p>未单独记录详细依据；未知信息保持为空。</p>}
    {item.evidenceUrl && <a href={item.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}
    {(item.sourceKind === "estimated" || item.amountDecision === "estimate_accepted") && <p className={styles.hint}>这是估算值，不代表本次食物的精确实测。</p>}
  </div>;
}
export function MealEvidence({ notes }: { notes?: string | null }) {
  return notes ? <details className={styles.evidence}><summary>餐次备注</summary><p className={styles.notes}>{notes}</p></details> : null;
}
