"use client";
import {LocalLoading} from "@/components/local-loading";
import {TaskGuide,useGuideWorkflow} from "@/components/task-guide";
import { TrainingPlanReview, TrainingPlanReviewEditor } from '../training/plan-review';
import {acknowledgeRecordChanges,fetchRecordStamps} from "@/components/record-change-client";
import {formatRecordNumber,formatUnitNumber} from "@/components/number-format";
import {mealTypeLabel,duplicateMealNotice} from "../meals/model";
import {MealDuplicateNotice} from "../meals/meal-duplicate-notice";
import {unusualNumbers} from "@/components/number-change";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { LoadingLink } from "@/components/loading-link";
import { WorkspaceReturnLink } from "@/components/workspace-return";

import { EditorDialog, FoodEditor, MealEditor } from "../meals/meals-view";
import { Disclosure } from "@/components/disclosure";
import { ImageGallery } from "../meals/photos";
import { MealEvidence } from "../meals/review-details";
import {NutritionComposition} from "../meals/nutrition-composition";
import { formatNutrition, metrics, metricLabels, type FoodView, type MealView, type Result } from "../meals/model";
import { useOperationClock } from "../meals/use-operation-clock";
import { MeasurementReviewEditor } from "../measurements/ai-confirmation";
import { timezoneLabel } from "../measurements/timezone";
import type { SourceRemovalResult } from "../measurements/entry-state";
import { EnergyEditor } from "../activities/energy-editor";
import { EnergyReview } from "./energy-review";
import { pendingChangesLabel } from "./energy-review-model";
import { category, isBody, isEnergy, isTraining, type RecordRow, type RecordReviewAction, type RecordReviewView } from "./model";
import { recordReceipt, reviewReturnPath } from "./review-summary";
import styles from "./record-review.module.css";

export type ReviewResult = Promise<Result<RecordReviewView> & { code?: string; status?: number }>;
type Recovery = "update" | "read";

function updatedNutrition(before: RecordReviewView, after: RecordReviewView) {
  return after.rows.flatMap(row => {
    const previous = before.rows.find(item => item.key === row.key)?.meal?.meal, current = row.meal?.meal;
    if (!previous || !current || row.excluded || row.persisted) return [];
    return metrics.flatMap(metric => {
      const from = previous.totals.values[metric], to = current.totals.values[metric];
      const prior = formatNutrition(from, metric), next = formatNutrition(to, metric);
      return prior !== next ? [`${title(row)} · ${metricLabels[metric]} ${prior} → ${next}${to == null ? "" : metric === "caloriesKcal" ? " 千卡" : " g"}`] : [];
    });
  });
}
const sections = [["body", "身体状况"], ["meals", "摄入记录"], ["foods", "食材库记录"], ["energy", "消耗与活动"], ["training", "训练模板与排期"]] as const;
const value = (key: string, entry: unknown) => entry == null ? "未填写" : key === "fasting" ? entry ? "空腹" : "非空腹" : key === "timezone" ? timezoneLabel(String(entry)) : ["weightKg","bodyFatPercent"].includes(key) ? formatRecordNumber(String(entry)) : String(entry);
function NumberNotice({before,after}:{before?:unknown;after?:unknown}){const prior=(before??{}) as Record<string,unknown>,next=(after??{}) as Record<string,unknown>;const names:Record<string,string>={weightKg:"体重",bodyFatPercent:"体脂",restingKcal:"静息",activeKcal:"活动",totalKcal:"总消耗",caloriesKcal:"热量"};const rows=unusualNumbers(Object.keys(names).map(key=>({label:names[key],unit:key==="weightKg"?"kg":key==="bodyFatPercent"?"%":"kcal",value:next[key] as string,previous:prior[key] as string})));return rows.length?<p role="status">请留意：{rows.map(row=>`${row.label}从 ${formatUnitNumber(row.previous,row.unit)} 变为 ${formatUnitNumber(row.value,row.unit)} ${row.unit}`).join("；")}，保存前请核对。</p>:null;}
function BodyContent({ row }: { row: RecordRow }) {
  const preview = row.body?.preview.rows[0], before = preview?.before, after = preview?.after;
  const fields = [["weightKg", "体重", "kg"], ["bodyFatPercent", "体脂率", "%"], ["deviceLabel", "来源", ""], ["fasting", "条件", ""], ["timezone", "时区", ""]];
  const editing = !!before && preview?.state !== "new" && !before.candidates;
  const visible = fields.filter(([key]) => editing ? value(key, before?.[key]) !== value(key, after?.[key]) : after?.[key] != null);
  return <>{preview?.warnings?.length?preview.warnings.map(text=><p role="status" key={text}>{text}</p>):<NumberNotice before={before} after={after}/>}<dl className={styles.bodyValues}>{visible.map(([key, label, unit]) => <div key={key}><dt>{label}</dt><dd>{editing && before?.[key] != null && <><del>{value(key, before?.[key])}{before?.[key] != null ? unit : ""}</del><span aria-label="修改为"> → </span></>}<strong>{value(key, after?.[key])}{after?.[key] != null ? unit : ""}</strong></dd></div>)}</dl></>;
}
function InlineRecordContent({ row, settled = false, compact = false }: { row: RecordRow; settled?: boolean; compact?: boolean }) {
  if (isBody(row.action)) {
    const after = row.body?.preview.rows[0]?.after, before = row.body?.preview.rows[0]?.before;
    const weight = after?.weightKg, fat = after?.bodyFatPercent, primary = weight != null ? weight : fat, unit = weight != null ? "kg" : "%";
    return <><div className={styles.inlineReading}><span>{weight != null ? "体重" : "体脂率"}</span><strong>{primary == null ? "未填写" : formatRecordNumber(String(primary))}<small>{primary == null ? "" : unit}</small></strong></div>
      {weight != null && fat != null && <p className={styles.inlineSecondary}>体脂率 {formatRecordNumber(String(fat))}%</p>}
      {!settled&&before?.weightKg != null && weight != null && String(before.weightKg) !== String(weight) && <p className={styles.inlineSecondary}>原体重 {formatRecordNumber(String(before.weightKg))} kg</p>}
      <p className={styles.inlineMeta}><span>来源：{String(after?.deviceLabel ?? "本次未填写")}</span>{after?.timezone != null && <span>{timezoneLabel(String(after.timezone))}</span>}</p>
      {!settled&&<NumberNotice before={before} after={after}/>}</>;
  }
  if (isTraining(row.action)) {
    const after = row.training?.after, content = after ? "exercises" in after ? after : after.content : row.action.kind === "save_training_template" ? row.action.template : undefined;
    return <><p className={styles.inlineName}>{content?.name ?? "训练排期"}</p><p className={styles.inlineSecondary}>{row.action.kind === "schedule_training" ? row.action.date + " · " : ""}{content ? `${content.exercises.length}个动作` : "查看计划详情"}</p>{row.training?.error && <p className={styles.error} role="alert">{row.training.error}</p>}</>;
  }
  if (isEnergy(row.action)) {
    const record = row.energy?.after;
    if (!record) return <p className={styles.inlineSecondary}>请核对消耗内容</p>;
    const values = record as unknown as Record<string, unknown>;
    const key = ["totalKcal", "caloriesKcal", "activeKcal", "restingKcal"].find(key => values[key] != null);
    const label = key === "totalKcal" ? "总消耗" : key === "caloriesKcal" ? "运动消耗" : key === "activeKcal" ? "活动合计" : "静息消耗";
    return <><div className={styles.inlineReading}><span>{label}</span><strong>{key ? formatUnitNumber(String(values[key]), "kcal") : "未填写"}<small>{key ? "千卡" : ""}</small></strong></div>
      <p className={styles.inlineMeta}>{values.restingKcal != null && key !== "restingKcal" && <span>静息 {formatUnitNumber(String(values.restingKcal), "kcal")} 千卡</span>}{values.activeKcal != null && key !== "activeKcal" && <span>活动 {formatUnitNumber(String(values.activeKcal), "kcal")} 千卡</span>}{values.sourceSystem != null && <span>来源：{String(values.sourceSystem)}</span>}</p>{row.energy?.error && <p className={styles.error} role="alert">{row.energy.error}</p>}</>;
  }
  const record = row.meal?.meal ?? row.meal?.food;
  if (!record) return null;
  const nutrients = "items" in record ? record.totals.values : record.nutrition;
  return <><div className={styles.inlineMealReading}><div><div className={styles.inlineReading}><span>{"items" in record ? "本餐热量" : `每 ${record.baseQuantity}${record.unit}`}</span><strong>{formatNutrition(nutrients.caloriesKcal, "caloriesKcal")}<small>千卡</small></strong></div>
    <p className={styles.inlineMacros}>{(["proteinG", "carbsG", "fatG"] as const).map(key => <span key={key}>{metricLabels[key]} {formatNutrition(nutrients[key], key)}{nutrients[key] != null ? " g" : ""}</span>)}</p>
</div>{"items" in record&&!settled&&!compact&&<NutritionComposition totals={record.totals} compact/>}</div>
    {"items" in record&&!settled&&<ul className={styles.inlineFoods}>{record.items.map((item,index)=><li key={item.id??index}><span>{item.name}</span><span>{item.quantity==null?"份量未知":Number(item.quantity)+(item.unit??"")}</span><span>{formatNutrition(item.nutrition.caloriesKcal,"caloriesKcal")} 千卡</span></li>)}</ul>}</>;
}
function RecordContent({ record,showItems=true }: { record?: FoodView | MealView;showItems?:boolean }) {
  if (!record) return null;
  return <div className={styles.recordContent}>{"items" in record ? <>
    <div className={styles.mealTotal} role="group" aria-label="本餐合计"><div><strong>{record.totals.values.caloriesKcal === null ? "未知" : formatNutrition(record.totals.values.caloriesKcal, "caloriesKcal")}<small>千卡</small></strong><span>本餐合计{record.totals.values.caloriesKcal !== null && record.totals.incomplete.caloriesKcal ? " · 已知部分" : ""}</span></div>
      <p>{(["proteinG", "carbsG", "fatG"] as const).map((metric, i) => <span key={metric}>{["P", "C", "F"][i]} {record.totals.values[metric] === null ? "未知" : formatNutrition(record.totals.values[metric], metric) + "g"}{record.totals.values[metric] !== null && record.totals.incomplete[metric] ? "（部分）" : ""}</span>)}</p>
    </div>
    {showItems&&record.items.map((item, index) => <div className={styles.foodLine} key={item.id ?? index}><strong>{item.name}</strong><span>{item.quantity == null ? "份量未知" : Number(item.quantity) + (item.unit ?? "")}</span><span>{formatNutrition(item.nutrition.caloriesKcal, "caloriesKcal")} 千卡</span><small>P {formatNutrition(item.nutrition.proteinG, "proteinG")} · C {formatNutrition(item.nutrition.carbsG, "carbsG")} · F {formatNutrition(item.nutrition.fatG, "fatG")} g</small></div>)}
  </> : <><p>每 {Number(record.baseQuantity)}{record.unit}{record.preparation ? " · " + record.preparation : ""}</p><p className={styles.nutrients}>{metrics.map(metric => <span key={metric}>{metricLabels[metric]} <strong>{formatNutrition(record.nutrition[metric], metric)}</strong> {metric === "caloriesKcal" ? "kcal" : "g"}</span>)}</p></>}</div>;
}

function MealContent({ row,compact=false }: { row: RecordRow;compact?:boolean }) {
  const preview = row.meal, after = preview?.meal ?? preview?.food, before = preview?.before;
  const afterImages = after?.imageIds ?? [], beforeImages = before?.imageIds ?? [];
  const changedImages = !!before && JSON.stringify(afterImages) !== JSON.stringify(beforeImages);
  return <>{preview?.warnings?.filter(text=>text!==duplicateMealNotice).map(text=><p role="status" key={text}>{text}</p>)}{before&&after?<><div className={styles.changeSummary} aria-label="本次修改">{preview?.changes?<>{preview.changes.removed.map((item,index)=><p key={"r"+index} className={styles.removed}>移除 · {item.name} · {formatNutrition(item.nutrition.caloriesKcal,"caloriesKcal")} 千卡</p>)}{preview.changes.added.map((item,index)=><p key={"a"+index}>新增 · {item.name} · {formatNutrition(item.nutrition.caloriesKcal,"caloriesKcal")} 千卡</p>)}{preview.changes.changed.map((item,index)=><p key={"c"+index}>修改 · {item.after.name} {item.before.quantity!=null?Number(item.before.quantity)+(item.before.unit??""):"未知数量"} → {item.after.quantity!=null?Number(item.after.quantity)+(item.after.unit??""):"未知数量"} · {formatNutrition(item.before.nutrition.caloriesKcal,"caloriesKcal")} → {formatNutrition(item.after.nutrition.caloriesKcal,"caloriesKcal")} 千卡</p>)}{preview.changes.metadata.map(text=><p key={text}>{text}</p>)}</>:<p>修改已有食材</p>}</div>{!compact&&<RecordContent record={after} showItems={false}/>} {!compact&&"items" in after&&<Disclosure className={styles.evidence} summary={"修改后 "+after.items.length+" 项食物"}><RecordContent record={after}/></Disclosure>}<Disclosure className={styles.evidence} summary="查看原记录"><RecordContent record={before}/></Disclosure></>:!compact&&<RecordContent record={after}/>}
    {changedImages ? <Disclosure className={styles.evidence} summary="照片变更"><div className={styles.comparison}><div><span className={styles.label}>修改前图片{!beforeImages.length && " · 无"}</span><ImageGallery ids={beforeImages} /></div><div><span className={styles.label}>修改后图片{!afterImages.length && " · 无"}</span><ImageGallery ids={afterImages} /></div></div></Disclosure> : afterImages.length > 0 && <Disclosure className={styles.evidence} summary={before?"对应照片":"照片"}><ImageGallery ids={afterImages}/></Disclosure>}
    {after && <details className={styles.evidence}><summary>依据与备注</summary>{"items" in after ? <><MealEvidence notes={after.notes} />{after.items.map((item, index) => <div key={index}><p>{item.name} · {item.basis ?? item.foodSnapshot?.basis ?? "未单独记录依据"}</p>{item.reviewExplanation && Object.entries(item.reviewExplanation).map(([key, note]) => <p key={key}>{note.basis}{note.uncertainty && `；不确定性：${note.uncertainty}`}</p>)}</div>)}</> : <><p>{after.basis ?? "未单独记录依据"}</p>{after.evidenceUrl && <a href={after.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}</>}</details>}
  </>;
}

function title(row: RecordRow) {
  const action = row.action;
  if (isEnergy(action)) { const record = row.energy?.after ?? row.energy?.before; return action.kind === "save_energy_defaults" ? `${action.restingFrom} · 日常默认值` : action.kind === "save_energy_profile" ? `${action.effectiveFrom} · 公式资料` : "date" in action ? `${action.date} · ${action.kind === "save_activity" ? action.name : "每日消耗"}` : record && "effectiveFrom" in record ? `${record.effectiveFrom} · 公式资料` : record && "name" in record ? `${record.date} · ${record.name}` : record && "date" in record ? `${record.date} · 消耗` : "消耗记录"; }
  if(isTraining(action))return action.kind==="schedule_training"?`${action.date} · 训练计划`:"训练模板";
  if (isBody(action)) return `${action.date} · ${action.period === "daytime" ? "晨间" : "晚间"}`;
  if (action.kind === "save_meal") return `${action.date} · ${mealTypeLabel(action.mealType)}`;
  return row.meal?.food?.name ?? (action.kind === "save_food" ? action.name : row.meal?.meal ? `${row.meal.meal.date} · ${mealTypeLabel(row.meal.meal.mealType)}` : "记录");
}

export function RecordReviewSummary({ operation, beforeNavigate }: {
  operation: RecordReviewView;
  beforeNavigate?: () => Promise<boolean>;
}) {
  const [now] = useState(Date.now);
  const expired = operation.status === "expired" || operation.status === "pending" && !!operation.expiresAt && Date.parse(operation.expiresAt) <= now;
  const rows = operation.rows.filter(row => row.persisted || !row.excluded && row.body?.status !== "skipped");
  const status = expired ? "已过期" : operation.status === "confirmed" ? "已保存" : operation.status === "completed" ? "无需保存"
    : operation.status === "canceled" || operation.status === "cancelled" ? "已取消" : operation.status === "pending" ? "待确认" : "查看状态";
  return <section className={styles.readOnlyReview} aria-label="历史记录摘要">
    {rows.map(row => <article key={row.key} className={styles.inlineRow}>
      <header className={styles.inlineHeading}>
        <h4>{title(row)}</h4>
        <span>{row.persisted ? "已保存" : status}</span>
      </header>
      <InlineRecordContent row={row} compact/>
    </article>)}
    {rows.length === 0 && <p>{status}</p>}
    <LoadingLink className={styles.readOnlyReviewLink} href={operation.confirmationPath} returnScope={beforeNavigate ? "assistant" : "workspace"} beforeNavigate={beforeNavigate}>
      查看审核 <span aria-hidden="true">›</span>
    </LoadingLink>
  </section>;
}

export function RecordReview({ operation: initial, review, load, sources: initialSources, removeSource, energySources: initialEnergySources, removeEnergySource,embedded=false,beforeNavigate,mealActions }: { beforeNavigate?:()=>Promise<boolean>;embedded?:boolean;mealActions?:ReactNode; operation: RecordReviewView; review: (action: RecordReviewAction) => ReviewResult; load: () => ReviewResult; sources: string[]; removeSource: (label: string) => Promise<SourceRemovalResult>; energySources: string[]; removeEnergySource: (label: string) => Promise<SourceRemovalResult> }) {
  const {finish:finishGuide}=useGuideWorkflow();
  const guideTask=mealActions?"meal":"review";
  const scope=useId(),rowId=(key:string)=>scope+"-record-"+key;
  const [local, setLocal] = useState<RecordReviewView | null>(null), [editing, setEditing] = useState<string | null>(null), [error, setError] = useState("");
  const [sources, setSources] = useState(initialSources), [busy, startTransition] = useTransition();
  const [energySources, setEnergySources] = useState(initialEnergySources);
  const [recovery, setRecovery] = useState<{ kind: Recovery; revision: number } | null>(null);
  const [updated, setUpdated] = useState<{ revision: number; changes: string[] } | null>(null);
  const [working, setWorking] = useState<"read" | RecordReviewAction["kind"] | null>(null);
  const op = local && (local.id !== initial.id || local.revision >= initial.revision) ? local : initial;
  const guard = useRef(false), now = useOperationClock();
  const expired = !!op.expiresAt && now !== undefined && Date.parse(op.expiresAt) <= now, active = op.status === "pending";
  const pending = op.rows.filter(row => !row.excluded && !row.persisted && row.body?.status !== "skipped");
  const issues = pending.filter(row => isTraining(row.action) ? !row.training || row.training.error : isBody(row.action) ? !row.body?.preview.canConfirm : isEnergy(row.action) ? !row.energy || row.energy.error : !row.meal || row.meal.error || row.meal.needsUserInput?.length);
  const missing = pending.filter(row => (row.action.kind === "save_meal" || row.action.kind === "save_food") && (row.action.expectedImageCount ?? 0) > (row.meal?.meal?.imageIds?.length ?? row.meal?.food?.imageIds?.length ?? 0));
  const editRow = op.rows.find(row => row.key === editing);
  const changedMeals = op.changedMeals ?? [];
  const nextStep = recovery?.kind === "read" ? "read" : changedMeals.length ? "current" : (recovery?.kind === "update" && op.revision <= recovery.revision) || expired || op.needsRefresh ? "update" : "save";

  function applyResult(result: RecordReviewView) {
    setLocal(current => current?.id === result.id && current.revision > result.revision ? current : result);
    setRecovery(null);
    if(result.status!=="pending")finishGuide(guideTask);
  }

  async function readLatest(uncertainSave = false) {
    setWorking("read");
    try {
      const result = await load();
      if (result.ok) {
        applyResult(result.data);
        if (result.data.status === "pending") {
          if (uncertainSave) setError("本次尚未保存。核对后可再次确认保存。");
          else if (editing) setError("已读取最新内容。当前输入已保留，请核对后应用。");
        }
        return;
      }
    } catch { /* 读取失败时保留当前卡片，允许再次读取。 */ }
    setRecovery({ kind: "read", revision: op.revision });
    setError(uncertainSave ? "暂时无法确认是否已保存。请重新读取。" : "暂时读不到最新内容。请重新读取。");
  }

  function perform(action?: RecordReviewAction) {
    if (guard.current || action?.kind === "update" && nextStep !== "save") return;
    guard.current = true;
    setError("");
    setWorking(action?.kind ?? "read");
    startTransition(async () => {
      try {
        if (!action) { await readLatest(); return; }
        const result = await review(action);
        if (!result.ok) {
          if (action.kind === "confirm" && (!result.status || result.status >= 500)) { await readLatest(true); return; }
          if (["snapshot_changed", "preview_changed", "expired", "preview_expired"].includes(result.code ?? "")) {
            setRecovery({ kind: "update", revision: op.revision });
          } else if (["review_changed", "closed_review", "meal_target_changed"].includes(result.code ?? "")) {
            if (action.kind === "update") {
              setRecovery({ kind: "read", revision: op.revision });
              setError("这份内容有新版本。请先重新读取，当前输入已保留。");
            } else await readLatest();
          } else if (action.kind === "refresh" && (!result.status || result.status >= 500)) {
            setError("暂时无法更新内容。请稍后重试。");
          } else setError(result.error);
          return;
        }
        applyResult(result.data);
        if (!embedded) window.dispatchEvent(new CustomEvent("formward-assistant-updated", { detail: { previewId: result.data.id } }));
        if (action.kind === "refresh") setUpdated({ revision: result.data.revision, changes: updatedNutrition(op, result.data) });
        if (action.kind === "update") setEditing(null);
        if (action.kind === "confirm" && result.data.status === "confirmed") {
          const keys = result.data.rows.filter(row => !row.excluded).flatMap(row => {
            if (isBody(row.action)) return [`measurement:${row.action.date}:${row.action.period}:observed`];
            if (isEnergy(row.action)) {
              const after = row.energy?.after;
              return after && "date" in after ? ["name" in after ? "activity:" + after.id : "energyDay:" + after.date] : [];
            }
            return row.meal?.meal ? ["meal:" + row.meal.meal.id, "mealDay:" + row.meal.meal.date] : row.meal?.food ? ["food:" + row.meal.food.id] : [];
          });
          void fetchRecordStamps().then(stamps => acknowledgeRecordChanges(keys, stamps)).catch(() => {});
        }
      } catch {
        if (action?.kind === "confirm") await readLatest(true);
        else if (action?.kind === "refresh") setError("暂时无法更新内容。请稍后重试。");
        else { setRecovery({ kind: "read", revision: op.revision }); setError("操作结果暂时无法确认。请重新读取。"); }
      } finally {
        setWorking(null);
        guard.current = false;
      }
    });
  }
  async function remove(label: string) { const result = await removeSource(label); if (result.ok) setSources(result.sources); return result; }
  async function removeEnergy(label: string) { const result = await removeEnergySource(label); if (result.ok) setEnergySources(result.sources); return result; }
  const returnPath = reviewReturnPath(op.rows);
  const command = (kind: "check" | "exclude" | "restore", keys: string[]) => perform({ kind, keys, revision: op.revision });
  if(!active&&embedded){
    const persisted=op.rows.filter(row=>row.persisted),label=op.status==="confirmed"?(persisted.length>1?`已保存${persisted.length}项`:"已保存"):op.status==="completed"?"无需保存":op.status==="expired"?"已过期":op.saved?"已取消剩余内容":"已取消";
    return <section className={styles.inlineResult} data-embedded="true" role="status" aria-label="记录结果"><h3>{label}</h3>{persisted.map(row=>{const record=row.meal?.meal,href=recordReceipt([row])[0]?.href;return <article key={row.key} className={styles.inlineSavedRow}><header className={styles.inlineHeading}><h4>{title(row)}{isBody(row.action)&&row.body?.preview.rows[0]?.after?.fasting===true?" · 空腹":""}</h4></header><InlineRecordContent row={row} settled/>{href&&<div className={styles.inlineReceiptLink}><span>{record?record.items.length+"样食物":""}</span><LoadingLink href={href} returnScope={beforeNavigate?"assistant":"workspace"} beforeNavigate={beforeNavigate}>{record?"查看饮食 →":"查看记录 →"}</LoadingLink></div>}</article>;})}{!persisted.length&&<><p className={styles.inlineMeta}>{op.status==="completed"?"没有需要写入的新内容。":"本次未保存新内容，已有记录保持。"}</p>{mealActions}</>}</section>;
  }
  if(active&&!pending.length)return <section className={styles.emptyReview} aria-label="记录状态"><h3>没有待保存内容</h3>{op.rows.map(row=><div className={styles.emptyReviewRow} key={row.key}><span>{title(row)} · {row.persisted?"已保存":row.excluded?"已取消":"已跳过"}</span>{row.excluded&&!row.persisted&&row.body?.status!=="skipped"&&<button disabled={busy||expired} onClick={()=>command("restore",[row.key])}>恢复本项</button>}</div>)}{error&&<p role="alert">{error}</p>}{!embedded&&<WorkspaceReturnLink fallback={returnPath} disabled={busy}/>}</section>;
  if (!active) return <section className={styles.success} data-embedded={embedded||undefined} role="status"><span className={styles.check} aria-hidden="true">{op.status === "confirmed" ? "✓" : "—"}</span><h1>{op.status === "confirmed" ? "已保存" : op.status === "completed" ? "无需保存" : op.saved ? "已取消剩余内容" : "已取消"}</h1>
    {op.saved > 0 && <><p>{op.status === "cancelled" ? "此前已保存" : "已保存"} {op.saved} 项</p>{op.rows.some(row => row.persisted && category(row.action) === "meals") && <p>饮食有修改的日期，请到饮食页重新确认是否已记全。</p>}<ul className={styles.receipt} aria-label="已保存记录">{recordReceipt(op.rows).map(item => <li key={item.type + item.date}><span>{item.date ? item.date + " · " : ""}{item.type}{item.count}项</span><LoadingLink href={item.href} beforeNavigate={embedded?beforeNavigate:undefined}>查看记录 →</LoadingLink></li>)}</ul></>}
    {!embedded&&<WorkspaceReturnLink fallback={returnPath} disabled={busy}/>}</section>;
  return <section className={styles.workspace} data-embedded={embedded||undefined} data-guide-scope aria-label="统一记录确认" aria-busy={busy}>{!embedded&&<><WorkspaceReturnLink fallback={returnPath} disabled={busy}/><header className={styles.heading}><h1>确认记录</h1><span>{pending.length} 项待保存</span></header></>}
    {embedded ? op.rows.filter(row => !(row.body?.status === "skipped" && row.body.preview.message.startsWith("同一时段的内容已合并"))).map(row => {
      const inactive = row.excluded || row.persisted || row.body?.status === "skipped", after = row.body?.preview.rows[0]?.after;
      const issue = op.needsUserInput.find(issue => issue.key === row.key);
      const heading = isTraining(row.action) ? row.action.kind === "schedule_training" ? "训练计划" : "训练模板" : title(row);
      return <article key={row.key} id={rowId(row.key)} className={styles.inlineRow} data-review-key={row.key} data-excluded={row.excluded||undefined}>
        <header className={styles.inlineHeading}><h3>{heading}{isBody(row.action) && after?.fasting === true ? " · 空腹" : ""}</h3><span>{row.persisted ? "已保存" : row.excluded ? "已取消" : row.body?.preview.rows[0]?.before || row.meal?.before || row.energy?.before || row.training?.before ? "修改" : "新增"}</span>{row===pending[0]&&nextStep==="save"&&!issues.length&&!editing&&<div className={styles.mealGuide}><TaskGuide task={guideTask} target="review-save" video={row.meal?"photo":undefined} text={row.meal?"核对食物和份量，再点「确认保存」。":"核对待保存的项目，再点「确认保存」。"} auto={!!mealActions}/></div>}</header>
        {!row.excluded&&<InlineRecordContent row={row}/>}
        {op.rows.length>1&&!row.persisted&&<div className={styles.inlineOperations}>{row.excluded ? <button disabled={busy} onClick={()=>command("restore",[row.key])}>恢复本项</button> : <><button disabled={busy||inactive} onClick={()=>{setError("");setEditing(row.key);}}>修改</button>{op.rows.length>1&&<button data-review-exclude disabled={busy||inactive} onClick={()=>command("exclude",[row.key])}>本项不保存</button>}</>}</div>}
        {!row.excluded&&row.meal&&<div className={styles.inlineDetails}><MealContent row={row} compact/></div>}
        {!row.excluded&&!row.meal&&(!isBody(row.action)||!!row.body?.preview.rows[0]?.before)&&<details className={styles.inlineDetails} open={row.inclusionReview||undefined}><summary>{row.inclusionReview ? "需要核对运动包含关系" : isBody(row.action) ? "修改前后" : isTraining(row.action) ? "训练内容" : "消耗明细"}</summary>
          {isTraining(row.action) ? <TrainingPlanReview compact rows={[row]} busy={busy} edit={setEditing} exclude={key=>command("exclude",[key])} restore={key=>command("restore",[key])}/> : isEnergy(row.action) ? <EnergyReview compact rows={[row]} busy={busy} dayRecords={op.energySnapshot?.days} edit={setEditing} exclude={keys=>command("exclude",keys)} restore={key=>command("restore",[key])} choose={(key,inclusion)=>perform({kind:"energy_inclusion",revision:op.revision,keys:[key],inclusion})}/> : isBody(row.action) ? <BodyContent row={row}/> : <MealContent row={row} compact/>}
        </details>}
        {issue&&<p role="alert" className={styles.error}>{issue.questions.join("；")}</p>}
      </article>;
    }) : sections.map(([key, label]) => { const rows = op.rows.filter(row => category(row.action) === key&&!(row.body?.status==="skipped"&&row.body.preview.message.startsWith("同一时段的内容已合并"))); if (!rows.length) return null;
      const cancellable = rows.filter(row => !row.excluded && !row.persisted && row.body?.status !== "skipped");
      if (key === "training") return <TrainingPlanReview key={key} rows={rows} busy={busy} edit={setEditing} exclude={key => command("exclude", [key])} restore={key => command("restore", [key])} />;
      if (key === "energy") return <EnergyReview key={key} rows={rows} busy={busy} dayRecords={op.energySnapshot?.days} edit={setEditing} exclude={keys => command("exclude", keys)} restore={key => command("restore", [key])} choose={(key, inclusion) => perform({ kind: "energy_inclusion", revision: op.revision, keys: [key], inclusion })} />;
      return <section className={styles.section} key={key} aria-label={label}>{(rows.length > 1 || sections.filter(([categoryKey]) => op.rows.some(row => category(row.action) === categoryKey)).length > 1) && <header className={styles.sectionHeading}><h2>{label}</h2>{cancellable.length > 0 && <button disabled={busy} onClick={() => command("exclude", cancellable.map(row => row.key))}>取消本栏</button>}</header>}
        {rows.map(row => { const skipped = row.body?.status === "skipped", inactive = row.excluded || row.persisted || skipped;
          const change = row.action.kind.startsWith("delete") ? "删除申请 · 可恢复" : row.action.kind.startsWith("restore") ? "恢复申请" : row.body?.preview.rows[0]?.before || row.meal?.before || row.energy?.before ? "修改申请" : "新增";
          const problem = Boolean(!inactive && (isBody(row.action) ? !row.body?.preview.canConfirm : isEnergy(row.action) ? row.energy?.error : row.meal?.error || row.meal?.needsUserInput?.length));
          return <article className={styles.row} id={rowId(row.key)} key={row.key} data-review-key={row.key} data-excluded={row.excluded} data-checked={row.checked}><header className={styles.rowHeading}><div><h3>{title(row)}</h3><span className={problem ? styles.error : styles.label}>{row.persisted ? "已保存" : skipped ? "已跳过" : row.excluded ? "已取消" : row.inclusionReview?"核对运动是否已包含":change}</span></div>
            {!row.persisted && !skipped && <div className={styles.actions}>{row.excluded ? <button disabled={busy} onClick={() => command("restore", [row.key])}>恢复本项</button> : <>{["save_record", "save_meal", "save_food", "save_energy_day", "save_activity", "save_energy_profile"].includes(row.action.kind) && <button disabled={busy} onClick={() => { setError(""); setEditing(row.key); }}>修改</button>}<button disabled={busy} onClick={() => command("exclude", [row.key])}>{row.action.kind==="save_meal" && !row.meal?.before ? "取消本次新增" : "取消"}</button></>}</div>}</header>
            {!inactive && row.action.kind === "save_meal" && !!row.meal?.duplicateIds.length && <MealDuplicateNotice date={row.action.date}/>}
            {!row.excluded && <>{isBody(row.action) ? <BodyContent row={row} /> : <MealContent row={row} />}
              {problem && <p role="alert" className={styles.error}>{row.body?.preview.needsUserInput?.map(issue => issue.message).join("；") || row.body?.preview.message || row.meal?.needsUserInput?.join("；") || row.meal?.error || row.energy?.error}</p>}
              {missing.some(item => item.key === row.key) && <p className={styles.textOnly}>照片未齐，可先保存文字，之后补传。</p>}
            </>}
          </article>;
        })}</section>;
    })}
    <footer className={styles.footer} data-review-footer data-meal-actions={mealActions ? true : undefined}>
      <div className={styles.reviewStatus}>
        {working && <LocalLoading label={working === "refresh" ? "正在更新…" : working === "read" ? "正在重新读取…" : working === "confirm" ? "正在保存…" : "正在处理…"} />}
        {!working && nextStep === "current" && <p role="status">{changedMeals.every(meal => !meal.id) ? "原餐次已删除，无法保存这次修改。" : "原餐次已在别处修改。请查看当前记录。"}</p>}
        {!working && nextStep === "update" && <p role="status">当前显示的是旧版。请先更新。</p>}
        {!working && nextStep === "save" && updated?.revision === op.revision && <>
          <strong role="status">{issues.length ? "已更新，请处理需要核对的内容" : "已更新，待保存"}</strong>
          {updated.changes.map(change => <p key={change}>{change}</p>)}
        </>}
        {!working && nextStep === "save" && updated?.revision !== op.revision && (!embedded || op.rows.length > 1) && <strong>{pending.length} 项待保存</strong>}
        {!embedded && nextStep === "save" && pending.some(row => isEnergy(row.action)) && <span className={styles.footerScope}>{pendingChangesLabel(op.rows)}</span>}
        {nextStep === "save" && issues.length > 0 && <button onClick={() => document.getElementById(rowId(issues[0].key))?.scrollIntoView({ block: "center" })}>{issues.length} 项需处理</button>}
        {!editing && error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
      {embedded && op.rows.length === 1 && pending[0] && <button disabled={busy || nextStep !== "save"} onClick={() => { setError(""); setEditing(pending[0].key); }}>修改</button>}
      <button disabled={busy || nextStep === "read"} onClick={() => perform({ kind: "cancel", revision: op.revision })}>本次不保存</button>
      {mealActions}
      {nextStep === "current" ? changedMeals.map(meal => meal.id && <LoadingLink key={meal.key} className={styles.save} href={`/dashboard/meals?date=${meal.date}`} beforeNavigate={embedded ? beforeNavigate : undefined}>查看当前记录</LoadingLink>) :
        <button className={styles.save} data-guide-target={nextStep==="save"?"review-save":undefined} disabled={busy || !!editing || nextStep === "save" && (!pending.length || !!issues.length)} onClick={() => {
          if (nextStep === "read") perform();
          else if (nextStep === "update") perform({ kind: "refresh", revision: op.revision });
          else perform({ kind: "confirm", revision: op.revision, allowMissingImageKeys: [] });
        }}>{working === "refresh" ? "正在更新…" : working === "read" ? "正在读取…" : working === "confirm" ? "正在保存…" : nextStep === "update" ? "更新内容" : nextStep === "read" ? "重新读取" : "确认保存"}</button>}
    </footer>
    {editRow && <EditorDialog wide={editRow.action.kind === "save_meal"} title="修改待保存内容" busy={busy} close={() => { if (!busy) { setEditing(null); setError(""); } }}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {nextStep === "read" && <button disabled={busy} onClick={() => perform()}>重新读取</button>}
      {nextStep === "update" && <button disabled={busy} onClick={() => perform({ kind: "refresh", revision: op.revision })}>{working === "refresh" ? "正在更新…" : "更新内容"}</button>}
      <fieldset className={styles.editFields} disabled={nextStep !== "save"}>
      {isTraining(editRow.action) ? <TrainingPlanReviewEditor key={editRow.key} row={editRow} busy={busy} apply={action => perform({ kind: "update", revision: op.revision, key: editRow.key, action })} /> : isEnergy(editRow.action) ? <EnergyEditor dayRecords={op.energySnapshot?.days} activityPreview={editRow.energy?.after&&"name" in editRow.energy.after?editRow.energy.after:undefined} activities={op.energySnapshot?.activities.filter(row=>!row.deletedAt && "date" in editRow.action && row.date===editRow.action.date)??[]} initial={editRow.action} sources={energySources} removeSource={removeEnergy} busy={busy} error={error||editRow.energy?.error||""} submitLabel="应用修改" save={action => perform({ kind: "update", revision: op.revision, key: editRow.key, action })} /> : isBody(editRow.action) && editRow.body ? <MeasurementReviewEditor item={editRow.body} busy={busy} sources={sources} removeSource={remove} close={() => setEditing(null)} save={action => perform({ kind: "update", revision: op.revision, key: editRow.key, action })} /> : editRow.action.kind === "save_meal" ? <MealEditor allowAi={false} foodRefs={Object.fromEntries(op.rows.flatMap(row => row.action.kind === "save_food" && row.meal?.food ? [[row.key,row.meal.food]] : []))} initial={editRow.action} historicalItems={editRow.meal?.meal?.items ?? []} historicalFoods={editRow.meal?.meal?.items.flatMap(item => item.foodSnapshot ? [item.foodSnapshot] : []) ?? []} foods={op.foods} submitLabel="应用修改" error={error || editRow.meal?.error || ""} busy={busy} save={async draft => perform({ kind: "update", revision: op.revision, key: editRow.key, action: { ...draft, kind: "save_meal" } })} /> : editRow.action.kind === "save_food" ? <FoodEditor initial={editRow.action} submitLabel="应用修改" error={error} busy={busy} save={async draft => perform({ kind: "update", revision: op.revision, key: editRow.key, action: { ...draft, kind: "save_food" } })} /> : null}
      </fieldset>
    </EditorDialog>}
  </section>;
}
