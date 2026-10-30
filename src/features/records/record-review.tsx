"use client";
import {acknowledgeRecordChanges,fetchRecordStamps} from "@/components/record-change-client";
import {formatRecordNumber,formatUnitNumber} from "@/components/number-format";
import {mealTypeLabel} from "../meals/model";
import {unusualNumbers} from "@/components/number-change";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoadingLink } from "@/components/loading-link";
import { usePageLoading } from "@/components/page-loading-state";
import { EditorDialog, FoodEditor, MealEditor } from "../meals/meals-view";
import { Disclosure } from "@/components/disclosure";
import { ImageGallery } from "../meals/photos";
import { MealEvidence } from "../meals/review-details";
import { formatNutrition, metrics, metricLabels, type FoodView, type MealView, type Result } from "../meals/model";
import { useOperationClock } from "../meals/use-operation-clock";
import { MeasurementReviewEditor, MeasurementReviewExplanation } from "../measurements/ai-confirmation";
import { timezoneLabel } from "../measurements/timezone";
import type { SourceRemovalResult } from "../measurements/entry-state";
import { EnergyEditor } from "../activities/energy-editor";
import { EnergyReview } from "./energy-review";
import { pendingChangesLabel } from "./energy-review-model";
import { category, isBody, isEnergy, type RecordRow, type RecordReviewAction, type RecordReviewView } from "./model";
import { recordReceipt } from "./review-summary";
import styles from "./record-review.module.css";

type ReviewResult = Promise<Result<RecordReviewView>>;
const sections = [["body", "身体状况"], ["meals", "摄入记录"], ["foods", "食材库记录"], ["energy", "消耗与活动"]] as const;
const value = (key: string, entry: unknown) => entry == null ? "未填写" : key === "fasting" ? entry ? "空腹" : "非空腹" : key === "timezone" ? timezoneLabel(String(entry)) : ["weightKg","bodyFatPercent"].includes(key) ? formatRecordNumber(String(entry)) : String(entry);
function NumberNotice({before,after}:{before?:unknown;after?:unknown}){const prior=(before??{}) as Record<string,unknown>,next=(after??{}) as Record<string,unknown>;const names:Record<string,string>={weightKg:"体重",bodyFatPercent:"体脂",restingKcal:"静息",activeKcal:"活动",totalKcal:"总消耗",caloriesKcal:"热量"};const rows=unusualNumbers(Object.keys(names).map(key=>({label:names[key],unit:key==="weightKg"?"kg":key==="bodyFatPercent"?"%":"kcal",value:next[key] as string,previous:prior[key] as string})));return rows.length?<p role="status">请留意：{rows.map(row=>`${row.label}从 ${formatUnitNumber(row.previous,row.unit)} 变为 ${formatUnitNumber(row.value,row.unit)} ${row.unit}`).join("；")}，保存前请核对。</p>:null;}
function BodyContent({ row }: { row: RecordRow }) {
  const preview = row.body?.preview.rows[0], before = preview?.before, after = preview?.after;
  const fields = [["weightKg", "体重", "kg"], ["bodyFatPercent", "体脂率", "%"], ["deviceLabel", "来源", ""], ["fasting", "条件", ""], ["timezone", "时区", ""]];
  const editing = !!before && preview?.state !== "new" && !before.candidates;
  const visible = fields.filter(([key]) => editing ? value(key, before?.[key]) !== value(key, after?.[key]) : after?.[key] != null);
  return <>{preview?.warnings?.length?preview.warnings.map(text=><p role="status" key={text}>{text}</p>):<NumberNotice before={before} after={after}/>}<dl className={styles.bodyValues}>{visible.map(([key, label, unit]) => <div key={key}><dt>{label}</dt><dd>{editing && before?.[key] != null && <><del>{value(key, before?.[key])}{before?.[key] != null ? unit : ""}</del><span aria-label="修改为"> → </span></>}<strong>{value(key, after?.[key])}{after?.[key] != null ? unit : ""}</strong></dd></div>)}</dl>{row.body && <MeasurementReviewExplanation item={row.body} />}</>;
}
function RecordContent({ record,showItems=true }: { record?: FoodView | MealView;showItems?:boolean }) {
  if (!record) return null;
  return <div className={styles.recordContent}>{"items" in record ? <>
    <div className={styles.mealTotal} role="group" aria-label="本餐合计"><div><strong>{record.totals.values.caloriesKcal === null ? "未知" : formatNutrition(record.totals.values.caloriesKcal, "caloriesKcal")}<small>kcal</small></strong><span>本餐合计{record.totals.values.caloriesKcal !== null && record.totals.incomplete.caloriesKcal ? " · 已知部分" : ""}</span></div>
      <p>{(["proteinG", "carbsG", "fatG"] as const).map((metric, i) => <span key={metric}>{["P", "C", "F"][i]} {record.totals.values[metric] === null ? "未知" : formatNutrition(record.totals.values[metric], metric) + "g"}{record.totals.values[metric] !== null && record.totals.incomplete[metric] ? "（部分）" : ""}</span>)}</p>
    </div>
    {showItems&&record.items.map((item, index) => <div className={styles.foodLine} key={item.id ?? index}><strong>{item.name}</strong><span>{item.quantity == null ? "份量未知" : Number(item.quantity) + (item.unit ?? "")}</span><span>{formatNutrition(item.nutrition.caloriesKcal, "caloriesKcal")} kcal</span><small>P {formatNutrition(item.nutrition.proteinG, "proteinG")} · C {formatNutrition(item.nutrition.carbsG, "carbsG")} · F {formatNutrition(item.nutrition.fatG, "fatG")} g</small></div>)}
  </> : <><p>每 {Number(record.baseQuantity)}{record.unit}{record.preparation ? " · " + record.preparation : ""}</p><p className={styles.nutrients}>{metrics.map(metric => <span key={metric}>{metricLabels[metric]} <strong>{formatNutrition(record.nutrition[metric], metric)}</strong> {metric === "caloriesKcal" ? "kcal" : "g"}</span>)}</p></>}</div>;
}

function MealContent({ row }: { row: RecordRow }) {
  const preview = row.meal, after = preview?.meal ?? preview?.food, before = preview?.before;
  const afterImages = after?.imageIds ?? [], beforeImages = before?.imageIds ?? [];
  const changedImages = !!before && JSON.stringify(afterImages) !== JSON.stringify(beforeImages);
  return <>{preview?.warnings?.length?preview.warnings.map(text=><p role="status" key={text}>{text}</p>):<NumberNotice before={before&&("totals" in before?before.totals.values:before.nutrition)} after={after&&("totals" in after?after.totals.values:after.nutrition)}/>}{before&&after?<><div className={styles.changeSummary} aria-label="本次修改">{preview?.changes?<>{preview.changes.removed.map((item,index)=><p key={"r"+index} className={styles.removed}>移除 · {item.name} · {formatNutrition(item.nutrition.caloriesKcal,"caloriesKcal")} kcal</p>)}{preview.changes.added.map((item,index)=><p key={"a"+index}>新增 · {item.name} · {formatNutrition(item.nutrition.caloriesKcal,"caloriesKcal")} kcal</p>)}{preview.changes.changed.map((item,index)=><p key={"c"+index}>修改 · {item.after.name} {item.before.quantity!=null?Number(item.before.quantity)+(item.before.unit??""):"未知数量"} → {item.after.quantity!=null?Number(item.after.quantity)+(item.after.unit??""):"未知数量"} · {formatNutrition(item.before.nutrition.caloriesKcal,"caloriesKcal")} → {formatNutrition(item.after.nutrition.caloriesKcal,"caloriesKcal")} kcal</p>)}{preview.changes.metadata.map(text=><p key={text}>{text}</p>)}</>:<p>修改已有食材</p>}</div><RecordContent record={after} showItems={false}/>{"items" in after&&<Disclosure className={styles.evidence} summary={"修改后 "+after.items.length+" 项食物"}><RecordContent record={after}/></Disclosure>}<Disclosure className={styles.evidence} summary="查看原记录"><RecordContent record={before}/></Disclosure></>:<RecordContent record={after}/>}
    {changedImages ? <Disclosure className={styles.evidence} summary="照片变更"><div className={styles.comparison}><div><span className={styles.label}>修改前图片{!beforeImages.length && " · 无"}</span><ImageGallery ids={beforeImages} /></div><div><span className={styles.label}>修改后图片{!afterImages.length && " · 无"}</span><ImageGallery ids={afterImages} /></div></div></Disclosure> : afterImages.length > 0 && <Disclosure className={styles.evidence} summary={before?"对应照片":"照片"}><ImageGallery ids={afterImages}/></Disclosure>}
    {after && <details className={styles.evidence}><summary>依据与备注</summary>{"items" in after ? <><MealEvidence notes={after.notes} />{after.items.map((item, index) => <div key={index}><p>{item.name} · {item.basis ?? item.foodSnapshot?.basis ?? "未单独记录依据"}</p>{item.reviewExplanation && Object.entries(item.reviewExplanation).map(([key, note]) => <p key={key}>{note.basis}{note.uncertainty && `；不确定性：${note.uncertainty}`}</p>)}</div>)}</> : <><p>{after.basis ?? "未单独记录依据"}</p>{after.evidenceUrl && <a href={after.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}</>}</details>}
  </>;
}

function title(row: RecordRow) {
  const action = row.action;
  if (isEnergy(action)) { const record = row.energy?.after ?? row.energy?.before; return action.kind === "save_energy_defaults" ? `${action.restingFrom} · 日常默认值` : action.kind === "save_energy_profile" ? `${action.effectiveFrom} · 公式资料` : "date" in action ? `${action.date} · ${action.kind === "save_activity" ? action.name : "每日消耗"}` : record && "effectiveFrom" in record ? `${record.effectiveFrom} · 公式资料` : record && "name" in record ? `${record.date} · ${record.name}` : record && "date" in record ? `${record.date} · 消耗` : "消耗记录"; }
  if (isBody(action)) return `${action.date} · ${action.period === "daytime" ? "晨间" : "晚间"}`;
  if (action.kind === "save_meal") return `${action.date} · ${mealTypeLabel(action.mealType)}`;
  return row.meal?.food?.name ?? (action.kind === "save_food" ? action.name : row.meal?.meal ? `${row.meal.meal.date} · ${mealTypeLabel(row.meal.meal.mealType)}` : "记录");
}
export function RecordReview({ operation: initial, review, load, sources: initialSources, removeSource, energySources: initialEnergySources, removeEnergySource }: { operation: RecordReviewView; review: (action: RecordReviewAction) => ReviewResult; load: () => ReviewResult; sources: string[]; removeSource: (label: string) => Promise<SourceRemovalResult>; energySources: string[]; removeEnergySource: (label: string) => Promise<SourceRemovalResult> }) {
  const [local, setLocal] = useState<RecordReviewView | null>(null), [editing, setEditing] = useState<string | null>(null), [error, setError] = useState(""), [savedNow, setSavedNow] = useState(false), [stayOnReceipt, setStayOnReceipt] = useState(false);
  const [sources, setSources] = useState(initialSources), [busy, startTransition] = useTransition();
  const [energySources, setEnergySources] = useState(initialEnergySources);
  const op = local && (local.id !== initial.id || local.revision >= initial.revision) ? local : initial;
  const guard = useRef(false), router = useRouter(), now = useOperationClock();
  const displayTime = (timestamp: string) => `${new Date(timestamp).toLocaleString("zh-CN", { timeZone: now === undefined ? "UTC" : undefined })}${now === undefined ? " UTC" : ""}`;
  const expired = !!op.expiresAt && now !== undefined && Date.parse(op.expiresAt) <= now, active = op.status === "pending";
  const pending = op.rows.filter(row => !row.excluded && !row.persisted && row.body?.status !== "skipped");
  const issues = pending.filter(row => isBody(row.action) ? !row.body?.preview.canConfirm : isEnergy(row.action) ? !row.energy || row.energy.error : !row.meal || row.meal.error || row.meal.needsUserInput?.length);
  const missing = pending.filter(row => (row.action.kind === "save_meal" || row.action.kind === "save_food") && (row.action.expectedImageCount ?? 0) > (row.meal?.meal?.imageIds?.length ?? row.meal?.food?.imageIds?.length ?? 0));
  const editRow = op.rows.find(row => row.key === editing);
  usePageLoading({ active: busy, label: "正在处理记录审核…" });
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!savedNow || stayOnReceipt) return;
    returnTimer.current = setTimeout(() => { startTransition(() => router.replace("/dashboard")); }, 2000);
    return () => { if (returnTimer.current) clearTimeout(returnTimer.current); };
  }, [savedNow, stayOnReceipt, router]);
  function stay() { if (returnTimer.current) clearTimeout(returnTimer.current); setStayOnReceipt(true); }
  function perform(action?: RecordReviewAction) {
    if (guard.current) return; guard.current = true; setError("");
    startTransition(async () => {
      try {
        const result = await (action ? review(action) : load());
        if (result.ok) { setLocal(current => current?.id === result.data.id && current.revision > result.data.revision ? current : result.data); if (action?.kind === "update") { setEditing(null); } if (action?.kind === "confirm" && result.data.status === "confirmed") {const keys=result.data.rows.filter(row=>!row.excluded).flatMap(row=>{if(isBody(row.action))return [`measurement:${row.action.date}:${row.action.period}:${row.action.kind==="estimate_cell"?"estimated":"observed"}`];if(isEnergy(row.action)){const after=row.energy?.after;return after&&"date" in after?["name" in after?"activity:"+after.id:"energyDay:"+after.date]:[];}return row.meal?.meal?["meal:"+row.meal.meal.id,"mealDay:"+row.meal.meal.date]:row.meal?.food?["food:"+row.meal.food.id]:[];});try{acknowledgeRecordChanges(keys,await fetchRecordStamps());}catch{}setSavedNow(true);} }
        else setError(result.error);
      } catch { setError("操作未完成，当前输入已保留，请加载最新状态后重试。"); }
      finally { guard.current = false; }
    });
  }
  async function remove(label: string) { const result = await removeSource(label); if (result.ok) setSources(result.sources); return result; }
  async function removeEnergy(label: string) { const result = await removeEnergySource(label); if (result.ok) setEnergySources(result.sources); return result; }
  const command = (kind: "check" | "exclude" | "restore", keys: string[]) => perform({ kind, keys, revision: op.revision });
  if (!active) return <section className={styles.success} role="status"><span className={styles.check} aria-hidden="true">{op.status === "confirmed" ? "✓" : "—"}</span><h1>{op.status === "confirmed" ? "已保存" : op.status === "completed" ? "无需保存" : op.saved ? "已取消剩余内容" : "已取消"}</h1>
    {op.saved > 0 && <><p>{op.status === "cancelled" ? "此前已保存" : "已保存"} {op.saved} 项{savedNow && !stayOnReceipt ? " · 2 秒后返回主页" : ""}</p>{op.rows.some(row => row.persisted && category(row.action) === "meals") && <p>饮食有修改的日期，请到饮食页重新确认是否已记全。</p>}<ul className={styles.receipt} aria-label="已保存记录">{recordReceipt(op.rows).map(item => <li key={item.type + item.date}><span>{item.date ? item.date + " · " : ""}{item.type}{item.count}项</span><LoadingLink href={item.href} onClick={stay}>查看记录 →</LoadingLink></li>)}</ul></>}
    {savedNow && !stayOnReceipt && <button className={styles.stay} onClick={stay}>停留查看</button>}<LoadingLink href="/dashboard">返回主页 →</LoadingLink></section>;
  return <section className={styles.workspace} aria-label="统一记录确认" aria-busy={busy}><header className={styles.heading}><h1>确认记录</h1><span>{pending.length} 项待保存</span></header>
    {sections.map(([key, label]) => { const rows = op.rows.filter(row => category(row.action) === key&&!(row.body?.status==="skipped"&&row.body.preview.message.startsWith("同一时段的内容已合并"))); if (!rows.length) return null;
      const cancellable = rows.filter(row => !row.excluded && !row.persisted && row.body?.status !== "skipped");
      if (key === "energy") return <EnergyReview key={key} rows={rows} busy={busy} dayRecords={op.energySnapshot?.days} edit={setEditing} exclude={keys => command("exclude", keys)} restore={key => command("restore", [key])} choose={(key, inclusion) => perform({ kind: "energy_inclusion", revision: op.revision, keys: [key], inclusion })} />;
      return <section className={styles.section} key={key} aria-label={label}>{(rows.length > 1 || sections.filter(([categoryKey]) => op.rows.some(row => category(row.action) === categoryKey)).length > 1) && <header className={styles.sectionHeading}><h2>{label}</h2>{cancellable.length > 0 && <button disabled={busy} onClick={() => command("exclude", cancellable.map(row => row.key))}>取消本栏</button>}</header>}
        {rows.map(row => { const skipped = row.body?.status === "skipped", inactive = row.excluded || row.persisted || skipped;
          const change = row.action.kind.startsWith("delete") ? "删除申请 · 可恢复" : row.action.kind.startsWith("restore") ? "恢复申请" : row.body?.preview.rows[0]?.before || row.meal?.before || row.energy?.before ? "修改申请" : "新增";
          const problem = Boolean(!inactive && (isBody(row.action) ? !row.body?.preview.canConfirm : isEnergy(row.action) ? row.energy?.error : row.meal?.error || row.meal?.needsUserInput?.length));
          return <article className={styles.row} id={`record-${row.key}`} key={row.key} data-review-key={row.key} data-excluded={row.excluded} data-checked={row.checked}><header className={styles.rowHeading}><div><h3>{title(row)}</h3><span className={problem ? styles.error : styles.label}>{row.persisted ? "已保存" : skipped ? "已跳过" : row.excluded ? "已取消" : row.inclusionReview?"核对运动是否已包含":change}</span></div>
            {!row.persisted && !skipped && <div className={styles.actions}>{row.excluded ? <button disabled={busy} onClick={() => command("restore", [row.key])}>恢复本项</button> : <>{["save_record", "estimate_cell", "save_meal", "save_food", "save_energy_day", "save_activity", "save_energy_profile"].includes(row.action.kind) && <button disabled={busy} onClick={() => { setError(""); setEditing(row.key); }}>修改</button>}<button disabled={busy} onClick={() => command("exclude", [row.key])}>{row.action.kind==="save_meal" && !row.meal?.before ? "取消本次新增" : "取消"}</button></>}</div>}</header>
            {!inactive && row.action.kind === "save_meal" && !!row.duplicateMeals?.length && <section className={styles.duplicates} aria-label="已有相同餐次"><h4>已有相同内容，先核对是不是同一餐</h4>{row.duplicateMeals.map(meal => <div key={meal.id}><p><strong>{meal.date} · {mealTypeLabel(meal.mealType)}</strong><span>{meal.totals.values.caloriesKcal === null ? "未知" : formatNutrition(meal.totals.values.caloriesKcal, "caloriesKcal")} kcal{meal.totals.values.caloriesKcal !== null && meal.totals.incomplete.caloriesKcal ? " · 已知部分" : ""}</span></p><p>{meal.items.map(item => item.name + (item.quantity == null ? "" : " " + Number(item.quantity) + (item.unit ?? ""))).join("、")}</p><LoadingLink href={"/dashboard/meals?date=" + meal.date}>查看已有餐次 →</LoadingLink></div>)}<div className={styles.actions}><label><input type="checkbox" disabled={busy} checked={Boolean(row.action.allowDuplicate)} onChange={event => { const action = row.action; if (action.kind === "save_meal") perform({ kind: "update", revision: op.revision, key: row.key, action: { ...action, allowDuplicate: event.target.checked } }); }} />这是另一次进食，仍然新增</label></div></section>}
            {!row.excluded && <>{isBody(row.action) ? <BodyContent row={row} /> : <MealContent row={row} />}
              {problem && <p role="alert" className={styles.error}>{row.body?.preview.needsUserInput?.map(issue => issue.message).join("；") || row.body?.preview.message || row.meal?.needsUserInput?.join("；") || row.meal?.error || row.energy?.error}</p>}
              {missing.some(item => item.key === row.key) && <p className={styles.textOnly}>照片未齐，可先保存文字，之后补传。</p>}
            </>}
          </article>;
        })}</section>;
    })}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <details className={styles.evidence}><summary>审核信息与刷新</summary><p>提交于 <time dateTime={op.createdAt}>{displayTime(op.createdAt)}</time> · 审核版本 {op.revision}</p>{op.expiresAt && <p>有效至 <time dateTime={op.expiresAt}>{displayTime(op.expiresAt)}</time></p>}<div className={styles.actions}><button disabled={busy} onClick={() => perform({ kind: "refresh", revision: op.revision })}>刷新预览</button><button disabled={busy} onClick={() => perform()}>加载最新状态</button><button disabled={busy} onClick={() => perform({ kind: "cancel", revision: op.revision })}>取消本次提交</button></div></details>
    <footer className={styles.footer}><div><strong>{pending.length ? `${pending.length} 项待保存` : "没有待保存内容"}</strong>{pending.some(row => isEnergy(row.action)) && <span className={styles.footerScope}>{pendingChangesLabel(op.rows)}</span>}{expired ? <button disabled={busy} onClick={() => perform({ kind: "refresh", revision: op.revision })}>预览已过期 · 刷新</button> : issues.length > 0 ? <button onClick={() => document.getElementById(`record-${issues[0].key}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>{issues.length} 项需处理 ↑</button> : <small>统一保存当前未取消的内容</small>}</div><button className={styles.save} disabled={busy || !!editing || expired || !pending.length || !!issues.length} onClick={() => perform({ kind: "confirm", revision: op.revision, allowMissingImageKeys: [] })}>{busy ? "正在处理…" : "确认保存"}</button></footer>
    {editRow && <EditorDialog wide={editRow.action.kind === "save_meal"} title="修改待保存内容" busy={busy} close={() => { if (!busy) { setEditing(null); setError(""); } }}>
      <p className={styles.label}>应用修改后，返回此页面确认保存。</p>{error && <><p className={styles.error} role="alert">{error}</p><button disabled={busy} onClick={() => perform()}>加载最新状态，保留输入</button></>}
      {isEnergy(editRow.action) ? <EnergyEditor dayRecords={op.energySnapshot?.days} activityPreview={editRow.energy?.after&&"name" in editRow.energy.after?editRow.energy.after:undefined} activities={op.energySnapshot?.activities.filter(row=>!row.deletedAt && "date" in editRow.action && row.date===editRow.action.date)??[]} initial={editRow.action} sources={energySources} removeSource={removeEnergy} busy={busy} error={error||editRow.energy?.error||""} submitLabel="应用修改" save={action => perform({ kind: "update", revision: op.revision, key: editRow.key, action })} /> : isBody(editRow.action) && editRow.body ? <MeasurementReviewEditor item={editRow.body} busy={busy} sources={sources} removeSource={remove} close={() => setEditing(null)} save={action => perform({ kind: "update", revision: op.revision, key: editRow.key, action })} /> : editRow.action.kind === "save_meal" ? <MealEditor foodRefs={Object.fromEntries(op.rows.flatMap(row => row.action.kind === "save_food" && row.meal?.food ? [[row.key,row.meal.food]] : []))} initial={editRow.action} historicalItems={editRow.meal?.meal?.items ?? []} historicalFoods={editRow.meal?.meal?.items.flatMap(item => item.foodSnapshot ? [item.foodSnapshot] : []) ?? []} foods={op.foods} submitLabel="应用修改" error={error || editRow.meal?.error || ""} busy={busy} save={async draft => perform({ kind: "update", revision: op.revision, key: editRow.key, action: { ...draft, kind: "save_meal" } })} /> : editRow.action.kind === "save_food" ? <FoodEditor initial={editRow.action} submitLabel="应用修改" error={error} busy={busy} save={async draft => perform({ kind: "update", revision: op.revision, key: editRow.key, action: { ...draft, kind: "save_food" } })} /> : null}
    </EditorDialog>}
  </section>;
}
