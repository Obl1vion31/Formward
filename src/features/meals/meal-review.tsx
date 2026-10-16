"use client";
import { useRef, useState, useTransition } from "react";
import { LoadingLink } from "@/components/loading-link";
import { usePageLoading } from "@/components/page-loading-state";
import { EditorDialog, FoodEditor, MealEditor } from "./meals-view";
import { metrics, metricLabels, formatNutrition, mealOperationStatus, missingMealImages, type FoodView, type MealAction, type MealOperationView, type Result } from "./model";
import { ImageGallery } from "./photos";
import { MealEvidence, NutritionTable } from "./review-details";
import { useOperationClock } from "./use-operation-clock";
import styles from "./meals.module.css";
type OpResult = Promise<Result<MealOperationView>>;
export function MealReview({ operation, foods, decide, refresh, edit, load }: { operation: MealOperationView; foods: FoodView[]; decide: (id: string, revision: number, decision: "confirm" | "cancel", allowMissingImages?: boolean) => OpResult; refresh: (id: string, revision: number) => OpResult; edit: (id: string, revision: number, index: number, action: MealAction) => OpResult; load: (id: string) => OpResult }) {
  const [op, setOp] = useState(operation);
  if (operation.id !== op.id || operation.revision > op.revision || (operation.revision === op.revision && operation.status !== op.status && op.status === "pending")) setOp(operation);
  const now = useOperationClock(), status = mealOperationStatus(op, now), active = status === "pending" || status === "expired";
  const [editing, setEditing] = useState<number | null>(null), [error, setError] = useState(""), [working, setWorking] = useState(false), [pending, startTransition] = useTransition(), busy = pending || working;
  const guard = useRef(false); usePageLoading({ active: busy, label: "正在更新饮食审核…" });
  async function perform(work: () => OpResult) {
    if (guard.current) return; guard.current = true; setWorking(true); setError("");
    try { const result = await work(); if (result.ok) { setOp(current => result.data.id !== current.id || result.data.revision >= current.revision ? result.data : current); setEditing(null); } else setError(result.error); }
    catch { setError("审核未完成，请加载最新状态后重试，输入已保留。"); }
    finally { guard.current = false; setWorking(false); }
  }
  const action = editing === null ? null : op.rows[editing]?.action, missing = missingMealImages(op.rows);
  const meals = op.rows.filter(row => row.action.kind === "save_meal").length, foodChanges = op.rows.filter(row => row.food).length;
  const blocked = op.rows.some(row => row.error || row.needsUserInput?.length), canSave = status === "pending" && (op.canConfirm || op.canConfirmWithoutImages) && !blocked;
  return <section className={styles.workspace}>
    <LoadingLink className={styles.reviewLink} href="/dashboard/meals">← 饮食记录</LoadingLink>
    <div className={styles.heading}><h1>{op.origin === "initialization" ? "确认历史初始化" : "确认饮食记录"}</h1><span>{status === "confirmed" ? "已保存" : status === "cancelled" ? "已取消" : status === "expired" ? "已过期" : blocked ? "需要核对" : "待确认"}</span></div>
    <p className={styles.hint}>{meals ? meals + " 餐" : ""}{foodChanges ? " · " + foodChanges + " 项食材变更" : ""}{!meals && !foodChanges ? op.rows.length + " 项操作" : ""} · {status === "confirmed" ? "本次提交已完成，不会重复保存。" : op.origin === "initialization" ? "整餐估算，具体食物组成保留在备注。" : "先看食物和食用量，再确认保存。"}{active && op.expiresAt && " · 有效至 " + new Date(op.expiresAt).toLocaleString("zh-CN", {timeZone:"Asia/Shanghai"})}</p>
    <p className={styles.hint}>提交时间：{new Date(op.createdAt).toLocaleString("zh-CN", {timeZone:"Asia/Shanghai"})} · 审核版本 {op.revision}</p>
    {op.rows.map((row, index) => { const ids = row.meal?.imageIds ?? row.food?.imageIds ?? [], expected = (row.action.kind === "save_meal" || row.action.kind === "save_food") ? row.action.expectedImageCount ?? ids.length : ids.length;
      return <article className={styles.reviewRow} key={index}>
        <div className={styles.heading}><h2>{row.meal ? row.meal.date + " · " + row.meal.mealType : row.food ? row.food.name : "第" + (index + 1) + "项"}</h2>{active && ["save_meal", "save_food"].includes(row.action.kind) && <button disabled={busy} onClick={() => { setError(""); setEditing(index); }}>修改{expected > ids.length ? "／补传照片" : ""}</button>}</div>
        <p className={styles.hint}>{status === "confirmed" ? "已保存" : status === "cancelled" ? "已取消" : row.action.kind.startsWith("delete") ? "将删除，可恢复" : row.action.kind.startsWith("restore") ? "将恢复记录" : row.meal?.source === "initialization" ? "来源：初始化 · 整餐估算" : status === "expired" ? "预览过期，刷新后再核对" : "核对后保存"}</p>
        {(row.meal || row.food) && <div className={styles.compactMetrics}>{metrics.map(m => <div key={m}><span>{metricLabels[m]}</span><strong>{formatNutrition(row.meal?.totals.values[m] ?? row.food?.nutrition[m] ?? null, m)}<small>{m === "caloriesKcal" ? "kcal" : "g"}</small></strong>{row.meal?.totals.incomplete[m] && <small>已知合计 · 不完整</small>}</div>)}</div>}
        {row.meal && <><NutritionTable items={row.meal.items} actions={row.action.kind === "save_meal" ? row.action.items : undefined} saved={status === "confirmed"} /><MealEvidence notes={row.meal.notes} /></>}
        {row.food && <details className={styles.evidence}><summary>查看食材规格与来源</summary><p>{row.food.preparation} · 每{Number(row.food.baseQuantity)}{row.food.unit}</p><p>{row.food.basis}</p>{row.food.evidenceUrl && <a href={row.food.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}</details>}
        <p className={expected > ids.length ? styles.error : styles.hint}>{expected > ids.length ? status === "confirmed" ? "已先保存文字记录：" + ids.length + "/" + expected + " 张原图，可在饮食记录中编辑补传。" : "照片尚未全部保存：" + ids.length + "/" + expected + " 张，请补传或选择先保存文字记录。" : ids.length ? "已保存 " + ids.length + " 张原图" : "本次提交没有原图附件"}</p><ImageGallery ids={ids} />
        {active && <>{row.needsUserInput?.map(q => <p className={styles.error} key={q}>{q}</p>)}{row.error && <p className={styles.error} role="alert">{row.error}</p>}</>}
        {row.warnings.map(w => <p className={styles.hint} key={w}>{w}</p>)}
      </article>;
    })}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {op.result && <p role="status">{op.result.message}</p>}
    {active && <>{status === "expired" && <p className={styles.error}>预览已过期，点击“刷新预览”后重新核对。</p>}{blocked && <p className={styles.error}>上方有信息需要核对，点击对应餐次“修改”处理后更新预览。</p>}
      <div className={styles.reviewActions}><button disabled={busy || !canSave || missing > 0} onClick={() => startTransition(async () => { await perform(() => decide(op.id, op.revision, "confirm")); })}>{busy ? "正在处理…" : "确认并保存"}</button>
        {missing > 0 && <button disabled={busy || !canSave} onClick={() => startTransition(async () => { await perform(() => decide(op.id, op.revision, "confirm", true)); })}>先保存文字记录</button>}
        <button disabled={busy} onClick={() => startTransition(async () => { await perform(() => refresh(op.id, op.revision)); })}>刷新预览</button><button disabled={busy} onClick={() => startTransition(async () => { await perform(() => decide(op.id, op.revision, "cancel")); })}>取消这次提交</button>
      </div></>}
    <button disabled={busy} className={styles.loadLatest} onClick={() => startTransition(async () => { await perform(() => load(op.id)); })}>加载最新审核状态</button>
    {action && editing !== null && <EditorDialog wide={action.kind === "save_meal"} title="修改饮食预览" close={() => { if (!busy) { setEditing(null); setError(""); } }} busy={busy}>
      {action.kind === "save_meal" ? <MealEditor historicalItems={op.rows[editing].meal?.items??[]} submitLabel="更新预览" historicalFoods={op.rows[editing].meal?.items.flatMap(i => i.foodSnapshot ? [i.foodSnapshot] : []) ?? []} initial={(action.imageIds?.length || action.expectedImageCount) && !action.photoReview ? { ...action, photoReview: { dateConfirmed: false, mealTypeConfirmed: false, identityConfirmed: false, amountConfirmed: false, cookingConfirmed: false, questions: [] } } : action} foods={foods} error={error || op.rows[editing].error || ""} busy={busy} save={async draft => { await perform(() => edit(op.id, op.revision, editing, { kind: "save_meal", ...draft })); }} /> : action.kind === "save_food" ? <FoodEditor submitLabel="更新预览" initial={action} error={error} busy={busy} save={async draft => { await perform(() => edit(op.id, op.revision, editing, { ...draft, kind: "save_food" })); }} /> : null}
    </EditorDialog>}
  </section>;
}
