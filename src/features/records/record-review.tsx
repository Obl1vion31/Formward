"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoadingLink } from "@/components/loading-link";
import { usePageLoading } from "@/components/page-loading-state";
import { EditorDialog, FoodEditor, MealEditor } from "../meals/meals-view";
import { ImageGallery } from "../meals/photos";
import { MealEvidence } from "../meals/review-details";
import { formatNutrition, metrics, metricLabels, type FoodView, type MealView, type Result } from "../meals/model";
import { useOperationClock } from "../meals/use-operation-clock";
import { MeasurementReviewEditor, MeasurementReviewExplanation } from "../measurements/ai-confirmation";
import { timezoneLabel } from "../measurements/timezone";
import type { SourceRemovalResult } from "../measurements/entry-state";
import { EnergyEditor } from "../activities/energy-editor";
import { category, isBody, isEnergy, type RecordRow, type RecordReviewAction, type RecordReviewView } from "./model";
import styles from "./record-review.module.css";

type ReviewResult = Promise<Result<RecordReviewView>>;
const sections = [["body", "身体状况"], ["meals", "摄入记录"], ["foods", "食材库记录"], ["energy", "消耗与活动"]] as const;
const value = (key: string, entry: unknown) => entry == null ? "未填写" : key === "fasting" ? entry ? "空腹" : "非空腹" : key === "timezone" ? timezoneLabel(String(entry)) : typeof entry === "string" && /^\d+(\.\d+)?$/.test(entry) ? String(Number(entry)) : String(entry);
function BodyContent({ row }: { row: RecordRow }) {
  const preview = row.body?.preview.rows[0], before = preview?.before, after = preview?.after;
  const fields = [["weightKg", "体重", "kg"], ["bodyFatPercent", "体脂率", "%"], ["deviceLabel", "来源", ""], ["fasting", "条件", ""], ["timezone", "时区", ""]];
  const editing = !!before && preview?.state !== "new" && !before.candidates;
  const visible = fields.filter(([key]) => editing ? value(key, before?.[key]) !== value(key, after?.[key]) : after?.[key] != null);
  return <><dl className={styles.bodyValues}>{visible.map(([key, label, unit]) => <div key={key}><dt>{label}</dt><dd>{editing && before?.[key] != null && <><del>{value(key, before?.[key])}{before?.[key] != null ? unit : ""}</del><span aria-label="修改为"> → </span></>}<strong>{value(key, after?.[key])}{after?.[key] != null ? unit : ""}</strong></dd></div>)}</dl>{row.body && <MeasurementReviewExplanation item={row.body} />}</>;
}
function RecordContent({ record }: { record?: FoodView | MealView }) {
  if (!record) return null;
  return <div className={styles.recordContent}>{"items" in record ? record.items.map((item, index) => <div className={styles.foodLine} key={item.id ?? index}><strong>{item.name}</strong><span>{item.quantity == null ? "份量未知" : `${Number(item.quantity)}${item.unit ?? ""}`}</span><span>{formatNutrition(item.nutrition.caloriesKcal, "caloriesKcal")} kcal</span><small>P {formatNutrition(item.nutrition.proteinG, "proteinG")} · C {formatNutrition(item.nutrition.carbsG, "carbsG")} · F {formatNutrition(item.nutrition.fatG, "fatG")} g</small></div>) : <><p>每 {Number(record.baseQuantity)}{record.unit}{record.preparation ? ` · ${record.preparation}` : ""}</p><p className={styles.nutrients}>{metrics.map(metric => <span key={metric}>{metricLabels[metric]} <strong>{formatNutrition(record.nutrition[metric], metric)}</strong> {metric === "caloriesKcal" ? "kcal" : "g"}</span>)}</p></>}</div>;
}
function MealContent({ row }: { row: RecordRow }) {
  const preview = row.meal, after = preview?.meal ?? preview?.food, before = preview?.before;
  const afterImages = after?.imageIds ?? [], beforeImages = before?.imageIds ?? [];
  const changedImages = !!before && JSON.stringify(afterImages) !== JSON.stringify(beforeImages);
  return <>{before ? <div className={styles.comparison}><div><span className={styles.label}>原记录</span><RecordContent record={before} /></div><div><span className={styles.label}>修改后</span><RecordContent record={after} /></div></div> : <RecordContent record={after} />}
    {changedImages ? <div className={styles.comparison}><div><span className={styles.label}>修改前图片{!beforeImages.length && " · 无"}</span><ImageGallery ids={beforeImages} /></div><div><span className={styles.label}>修改后图片{!afterImages.length && " · 无"}</span><ImageGallery ids={afterImages} /></div></div> : afterImages.length > 0 && <div className={styles.images}><span className={styles.label}>{before ? "对应图片" : "新增图片"}</span><ImageGallery ids={afterImages} /></div>}
    {after && <details className={styles.evidence}><summary>依据与备注</summary>{"items" in after ? <><MealEvidence notes={after.notes} />{after.items.map((item, index) => <div key={index}><p>{item.name} · {item.basis ?? item.foodSnapshot?.basis ?? "未单独记录依据"}</p>{item.reviewExplanation && Object.entries(item.reviewExplanation).map(([key, note]) => <p key={key}>{note.basis}{note.uncertainty && `；不确定性：${note.uncertainty}`}</p>)}</div>)}</> : <><p>{after.basis ?? "未单独记录依据"}</p>{after.evidenceUrl && <a href={after.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}</>}</details>}
  </>;
}
function EnergyContent({ row }: { row: RecordRow }) {
  const before = row.energy?.before, after = row.energy?.after;
  if (!after) return null;
  const fields = [["entryMode", "记录方式"], ["activityMode", "活动记录方式"], ["restingSourceSystem", "静息来源"], ["activeSourceSystem", "活动来源"], ["notes", "备注"], ["date", "日期"], ["name", "活动"], ["restingKcal", "静息 · kcal"], ["activeKcal", "活动合计 · kcal"], ["totalKcal", "全天总消耗 · kcal"], ["caloriesKcal", "活动热量 · kcal"], ["durationMinutes", "时长 · 分钟"], ["completed", "已完成"], ["effectiveFrom", "生效日期"], ["heightCm", "身高 · cm"], ["birthDate", "出生日期"], ["sex", "公式性别参数"]];
  const content = after as unknown as Record<string, unknown>, prior = before as unknown as Record<string, unknown> | undefined;
  const display = (key: string, data: unknown) => data == null ? "未填写" : key === "entryMode" ? data === "total" ? "只记总数" : "分开记录" : key === "activityMode" ? data === "activities" ? "按运动累计" : "记合计" : key === "sex" ? data === "male" ? "男性" : "女性" : typeof data === "boolean" ? data ? "是" : "否" : String(data);
  return <><dl className={styles.bodyValues}>{fields.filter(([key]) => (!("entryMode" in after) || (after.entryMode !== "total" || !["restingKcal", "activeKcal", "restingSourceSystem", "activeSourceSystem", "activityMode"].includes(key)) && (after.entryMode !== "components" || key !== "totalKcal") && (after.activityMode !== "activities" || key !== "activeKcal")) && key in after && (before ? content[key] !== prior?.[key] : content[key] != null)).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{before && <><del>{display(key, prior?.[key])}</del> → </>}<strong>{display(key, content[key])}</strong></dd></div>)}</dl>{"sourceSystem" in after && after.sourceSystem && <details className={styles.evidence}><summary>来源</summary><p>{after.sourceSystem} · {after.timezone}</p></details>}</>;
}
function title(row: RecordRow) {
  const action = row.action;
  if (isEnergy(action)) { const record = row.energy?.after ?? row.energy?.before; return action.kind === "save_energy_defaults" ? `${action.restingFrom} · 日常默认值` : action.kind === "save_energy_profile" ? `${action.effectiveFrom} · 公式资料` : "date" in action ? `${action.date} · ${action.kind === "save_activity" ? action.name : "每日消耗"}` : record && "effectiveFrom" in record ? `${record.effectiveFrom} · 公式资料` : record && "name" in record ? `${record.date} · ${record.name}` : record && "date" in record ? `${record.date} · 消耗` : "消耗记录"; }
  if (isBody(action)) return `${action.date} · ${action.period === "daytime" ? "晨间" : "晚间"}`;
  if (action.kind === "save_meal") return `${action.date} · ${action.mealType}`;
  return row.meal?.food?.name ?? (action.kind === "save_food" ? action.name : row.meal?.meal ? `${row.meal.meal.date} · ${row.meal.meal.mealType}` : "记录");
}
export function RecordReview({ operation: initial, review, load, sources: initialSources, removeSource }: { operation: RecordReviewView; review: (action: RecordReviewAction) => ReviewResult; load: () => ReviewResult; sources: string[]; removeSource: (label: string) => Promise<SourceRemovalResult> }) {
  const [local, setLocal] = useState<RecordReviewView | null>(null), [editing, setEditing] = useState<string | null>(null), [error, setError] = useState(""), [savedNow, setSavedNow] = useState(false);
  const [sources, setSources] = useState(initialSources), [textOnly, setTextOnly] = useState<string[]>([]), [busy, startTransition] = useTransition();
  const op = local && (local.id !== initial.id || local.revision >= initial.revision) ? local : initial;
  const guard = useRef(false), router = useRouter(), now = useOperationClock();
  const displayTime = (timestamp: string) => `${new Date(timestamp).toLocaleString("zh-CN", { timeZone: now === undefined ? "UTC" : undefined })}${now === undefined ? " UTC" : ""}`;
  const expired = !!op.expiresAt && now !== undefined && Date.parse(op.expiresAt) <= now, active = op.status === "pending";
  const pending = op.rows.filter(row => !row.excluded && !row.persisted && row.body?.status !== "skipped");
  const issues = pending.filter(row => isBody(row.action) ? !row.body?.preview.canConfirm : isEnergy(row.action) ? !row.energy || row.energy.error : !row.meal || row.meal.error || row.meal.needsUserInput?.length);
  const missing = pending.filter(row => (row.action.kind === "save_meal" || row.action.kind === "save_food") && (row.action.expectedImageCount ?? 0) > (row.meal?.meal?.imageIds?.length ?? row.meal?.food?.imageIds?.length ?? 0));
  const editRow = op.rows.find(row => row.key === editing);
  usePageLoading({ active: busy, label: "正在处理记录审核…" });
  useEffect(() => { if (!savedNow) return; const timer = setTimeout(() => { startTransition(() => router.replace("/dashboard")); }, 2000); return () => clearTimeout(timer); }, [savedNow, router]);
  function perform(action?: RecordReviewAction) {
    if (guard.current) return; guard.current = true; setError("");
    startTransition(async () => {
      try {
        const result = await (action ? review(action) : load());
        if (result.ok) { setLocal(current => current?.id === result.data.id && current.revision > result.data.revision ? current : result.data); if (action?.kind === "update") { setEditing(null); setTextOnly(current => current.filter(key => key !== action.key)); } if (action?.kind === "confirm" && result.data.status === "confirmed") setSavedNow(true); }
        else setError(result.error);
      } catch { setError("操作未完成，当前输入已保留，请加载最新状态后重试。"); }
      finally { guard.current = false; }
    });
  }
  async function remove(label: string) { const result = await removeSource(label); if (result.ok) setSources(result.sources); return result; }
  const command = (kind: "check" | "exclude" | "restore", keys: string[]) => perform({ kind, keys, revision: op.revision });
  if (!active) return <section className={styles.success} role="status"><span className={styles.check} aria-hidden="true">{op.status === "confirmed" ? "✓" : "—"}</span><h1>{op.status === "confirmed" ? "已保存" : op.status === "completed" ? "无需保存" : op.saved ? "已取消剩余内容" : "已取消"}</h1>{op.saved > 0 && <p>{op.status === "cancelled" ? "此前已保存" : "已保存"} {op.saved} 项{savedNow ? " · 2 秒后返回主页" : ""}</p>}<LoadingLink href="/dashboard">返回主页 →</LoadingLink></section>;
  return <section className={styles.workspace} aria-label="统一记录确认" aria-busy={busy}><header className={styles.heading}><h1>确认记录</h1><span>{pending.length} 项待保存</span></header>
    {sections.map(([key, label]) => { const rows = op.rows.filter(row => category(row.action) === key); if (!rows.length) return null;
      const cancellable = rows.filter(row => !row.excluded && !row.persisted && row.body?.status !== "skipped");
      return <section className={styles.section} key={key} aria-label={label}><header className={styles.sectionHeading}><h2>{label}</h2>{cancellable.length > 0 && <button disabled={busy} onClick={() => command("exclude", cancellable.map(row => row.key))}>取消本栏</button>}</header>
        {rows.map(row => { const skipped = row.body?.status === "skipped", inactive = row.excluded || row.persisted || skipped;
          const change = row.action.kind.startsWith("delete") ? "删除申请 · 可恢复" : row.action.kind.startsWith("restore") ? "恢复申请" : row.body?.preview.rows[0]?.before || row.meal?.before || row.energy?.before ? "修改申请" : "新增";
          const problem = Boolean(!inactive && (isBody(row.action) ? !row.body?.preview.canConfirm : isEnergy(row.action) ? row.energy?.error : row.meal?.error || row.meal?.needsUserInput?.length));
          return <article className={styles.row} id={`record-${row.key}`} key={row.key} data-review-key={row.key} data-excluded={row.excluded} data-checked={row.checked}><header className={styles.rowHeading}><div><h3>{title(row)}</h3><span className={problem ? styles.error : styles.label}>{row.persisted ? "已保存" : skipped ? "已跳过" : row.excluded ? "已取消" : row.checked ? "✓ 已核对" : change}</span></div>
            {!row.persisted && !skipped && <div className={styles.actions}>{row.excluded ? <button disabled={busy} onClick={() => command("restore", [row.key])}>恢复本项</button> : <><button disabled={busy || !!problem || expired || row.checked} onClick={() => command("check", [row.key])}>{row.checked ? "已核对" : "确认本项"}</button>{["save_record", "estimate_cell", "save_meal", "save_food", "save_energy_day", "save_activity", "save_energy_profile"].includes(row.action.kind) && <button disabled={busy} onClick={() => { setError(""); setEditing(row.key); }}>修改</button>}<button disabled={busy} onClick={() => command("exclude", [row.key])}>取消</button></>}</div>}</header>
            {!row.excluded && <>{isBody(row.action) ? <BodyContent row={row} /> : isEnergy(row.action) ? <EnergyContent row={row} /> : <MealContent row={row} />}
              {problem && <p role="alert" className={styles.error}>{row.body?.preview.needsUserInput?.map(issue => issue.message).join("；") || row.body?.preview.message || row.meal?.needsUserInput?.join("；") || row.meal?.error || row.energy?.error}</p>}
              {missing.some(item => item.key === row.key) && <label className={styles.textOnly}><input type="checkbox" disabled={busy} checked={textOnly.includes(row.key)} onChange={event => setTextOnly(current => event.target.checked ? [...current, row.key] : current.filter(key => key !== row.key))} />照片未齐，先保存本项文字记录</label>}
            </>}
          </article>;
        })}</section>;
    })}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <details className={styles.evidence}><summary>审核信息与刷新</summary><p>提交于 <time dateTime={op.createdAt}>{displayTime(op.createdAt)}</time> · 审核版本 {op.revision}</p>{op.expiresAt && <p>有效至 <time dateTime={op.expiresAt}>{displayTime(op.expiresAt)}</time></p>}<div className={styles.actions}><button disabled={busy} onClick={() => perform({ kind: "refresh", revision: op.revision })}>刷新预览</button><button disabled={busy} onClick={() => perform()}>加载最新状态</button><button disabled={busy} onClick={() => perform({ kind: "cancel", revision: op.revision })}>取消本次提交</button></div></details>
    <footer className={styles.footer}><div><strong>{pending.length ? `${pending.length} 项待保存` : "没有待保存内容"}</strong>{expired ? <button disabled={busy} onClick={() => perform({ kind: "refresh", revision: op.revision })}>预览已过期 · 刷新</button> : issues.length > 0 ? <button onClick={() => document.getElementById(`record-${issues[0].key}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>{issues.length} 项需处理 ↑</button> : <small>统一保存当前未取消的内容</small>}</div><button className={styles.save} disabled={busy || !!editing || expired || !pending.length || !!issues.length || missing.some(row => !textOnly.includes(row.key))} onClick={() => perform({ kind: "confirm", revision: op.revision, allowMissingImageKeys: textOnly })}>{busy ? "正在处理…" : "确认并全部保存"}</button></footer>
    {editRow && <EditorDialog wide={editRow.action.kind === "save_meal"} title="修改待保存内容" busy={busy} close={() => { if (!busy) { setEditing(null); setError(""); } }}>
      {error && <><p className={styles.error} role="alert">{error}</p><button disabled={busy} onClick={() => perform()}>加载最新状态，保留输入</button></>}
      {isEnergy(editRow.action) ? <EnergyEditor initial={editRow.action} busy={busy} error={error} submitLabel="更新预览" save={action => perform({ kind: "update", revision: op.revision, key: editRow.key, action })} /> : isBody(editRow.action) && editRow.body ? <MeasurementReviewEditor item={editRow.body} busy={busy} sources={sources} removeSource={remove} close={() => setEditing(null)} save={action => perform({ kind: "update", revision: op.revision, key: editRow.key, action })} /> : editRow.action.kind === "save_meal" ? <MealEditor foodRefs={Object.fromEntries(op.rows.flatMap(row => row.action.kind === "save_food" && row.meal?.food ? [[row.key,row.meal.food]] : []))} initial={editRow.action} historicalItems={editRow.meal?.meal?.items ?? []} historicalFoods={editRow.meal?.meal?.items.flatMap(item => item.foodSnapshot ? [item.foodSnapshot] : []) ?? []} foods={op.foods} submitLabel="更新预览" error={error} busy={busy} save={async draft => perform({ kind: "update", revision: op.revision, key: editRow.key, action: { ...draft, kind: "save_meal" } })} /> : editRow.action.kind === "save_food" ? <FoodEditor initial={editRow.action} submitLabel="更新预览" error={error} busy={busy} save={async draft => perform({ kind: "update", revision: op.revision, key: editRow.key, action: { ...draft, kind: "save_food" } })} /> : null}
    </EditorDialog>}
  </section>;
}
