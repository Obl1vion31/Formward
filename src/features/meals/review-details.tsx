"use client";
import { type ItemView } from "./model";
import styles from "./meals.module.css";
const evidenceSources = { user: "用户提供", label: "标签转录", food_library: "食材库", composition_table: "成分表", estimate: "估算", unknown: "未知" };
export function ItemEvidence({ item }: { item: ItemView }) {
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
