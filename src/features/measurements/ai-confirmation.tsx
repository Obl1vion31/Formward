"use client";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { usePageLoading } from "@/components/page-loading-state";
import { LoadingLink } from "@/components/loading-link";
import type { operationDisplay, ReviewAction, ReviewInput, ReviewItem } from "./ai-operations";
import { operationStatusLabels } from "./ai-instructions";
import { offsetTimezone, timezoneLabel, timezoneOptions } from "./timezone";

type Operation = ReturnType<typeof operationDisplay>;
const subscribeClock = (notify: () => void) => { const timer = setInterval(notify, 1000); return () => clearInterval(timer); };
const currentSecond = () => Math.floor(Date.now() / 1000);
const serverSecond = () => 0;
type Draft = { seed: ReviewItem; date: string; period: ReviewInput["period"]; weightKg: string; bodyFatPercent: string; deviceLabel: string; fasting: boolean; timezone: string; recordId: string; version: string };
const names = { new: "新增实测", edit: "修改历史", supplement: "补充缺项", duplicate: "重复，已跳过", conflict: "需要核对", invalid: "需要修改", estimate: "单项估算" };
const states = { pending: "待确认", confirmed: "已保存", cancelled: "已取消", skipped: "已跳过" };
const fields = [{ key: "weightKg", label: "体重", unit: " kg" }, { key: "bodyFatPercent", label: "体脂率", unit: "%" }, { key: "deviceLabel", label: "来源", unit: "" }, { key: "fasting", label: "测量条件", unit: "" }, { key: "timezone", label: "时区", unit: "" }] as const;
function display(value: unknown, unit = "") { return value === true ? "空腹" : value === false ? "非空腹" : value === null || value === undefined ? "未指定" : `${value}${unit}`; }
function candidates(item: ReviewItem): Record<string, unknown>[] {
  const before = item.preview.rows[0]?.before;
  return Array.isArray(before?.candidates) ? before.candidates : before?.id ? [before] : [];
}
function draftFor(item: ReviewItem): Draft {
  const input = item.input, row = item.preview.rows[0];
  const value = (field: string) => Object.hasOwn(input, field) ? (input as unknown as Record<string, unknown>)[field] : row?.after && Object.hasOwn(row.after, field) ? row.after[field] : row?.before?.[field];
  return { seed: item, date: input.date, period: input.period, weightKg: String(value("weightKg") ?? ""), bodyFatPercent: String(value("bodyFatPercent") ?? ""), deviceLabel: String(value("deviceLabel") ?? ""), fasting: value("fasting") === true, timezone: String(value("timezone") ?? ""), recordId: input.kind === "save_record" ? input.recordId ?? "" : "", version: input.kind === "save_record" ? input.version ?? "" : "" };
}
/** 只提交用户改过的字段；回显的历史值不冒充新输入。 */
function inputFromDraft(item: ReviewItem, draft: Draft): ReviewInput {
  item = draft.seed;
  if (item.input.kind === "estimate_cell") return { ...item.input, date: draft.date, period: draft.period };
  const input = { ...item.input, date: draft.date, period: draft.period }, baseline = draftFor(item);
  for (const field of ["weightKg", "bodyFatPercent", "deviceLabel", "timezone"] as const) if (draft[field] !== baseline[field]) input[field] = draft[field].trim() || null;
  if (draft.fasting !== baseline.fasting || draft.period !== baseline.period) input.fasting = draft.period === "evening" ? false : draft.fasting;
  if (draft.date !== baseline.date || draft.period !== baseline.period) { delete input.recordId; delete input.version; }
  else if (draft.recordId) { input.recordId = draft.recordId; input.version = draft.version; }
  else { delete input.recordId; delete input.version; }
  return input;
}
function Explanation({ item }: { item: ReviewItem }) {
  const explanation = item.preview.explanation;
  if (!explanation) return null;
  return <details className="ai-evidence"><summary>查看估算依据与不确定性</summary><p>{explanation.method}</p>{explanation.basis.map((line, index) => <p key={index}>{line}</p>)}{explanation.formula && <p>{explanation.formula}</p>}{explanation.sampleSummary.map((line, index) => <p key={index}>{line}</p>)}{explanation.fallbackNote && <p>{explanation.fallbackNote}</p>}<details><summary>实测参考</summary>{explanation.references.map((line, index) => <p key={index}>{line}</p>)}</details><p>估计只辅助趋势，不代表实测，不参与实测摘要；结果存在不确定性。</p></details>;
}
function DraftForm({ item, draft, change, busy, updating, save, close }: { item: ReviewItem; draft: Draft; change: (draft: Draft) => void; busy: boolean; updating: boolean; save: () => void; close: () => void }) {
  const options = candidates(item), set = (patch: Partial<Draft>) => change({ ...draft, ...patch });
  const isRecord = item.input.kind === "save_record", sameTarget = draft.date === item.input.date && draft.period === item.input.period;
  return <form className="ai-draft" onSubmit={event => { event.preventDefault(); save(); }}>
    <div className="ai-draft-grid">
      <label>日期<input type="date" value={draft.date} onChange={event => set({ date: event.target.value, recordId: "", version: "" })} disabled={busy} required /></label>
      <label>时段<select aria-label="时段" value={draft.period} onChange={event => set({ period: event.target.value as Draft["period"], fasting: false, recordId: "", version: "" })} disabled={busy}><option value="daytime">晨间</option><option value="evening">晚间</option></select></label>
      {isRecord && <>
        {!!options.length && sameTarget && <label className="ai-draft-wide">要修改的历史记录<select aria-label="要修改的历史记录" value={draft.recordId} disabled={busy} onChange={event => { const record = options.find(record => record.id === event.target.value); set({ recordId: event.target.value, version: String(record?.updatedAt ?? "") }); }}><option value="">未选择历史记录</option>{options.map(record => <option key={String(record.id)} value={String(record.id)}>{display(record.weightKg, " kg")} · {display(record.bodyFatPercent, "%")} · {display(record.deviceLabel)} · {String(record.id).slice(0, 8)}</option>)}</select></label>}
        <label>体重（kg）<input type="text" inputMode="decimal" value={draft.weightKg} onChange={event => set({ weightKg: event.target.value })} disabled={busy} placeholder="未知留空" /></label>
        <label>体脂率（%）<input type="text" inputMode="decimal" value={draft.bodyFatPercent} onChange={event => set({ bodyFatPercent: event.target.value })} disabled={busy} placeholder="未知留空" /></label>
        <label className="ai-draft-wide">测量来源<input value={draft.deviceLabel} onChange={event => set({ deviceLabel: event.target.value })} disabled={busy} placeholder="填写实际使用的设备或来源" maxLength={300} /></label>
        <div className="ai-draft-wide ai-timezone-field"><label>时区<select aria-label="时区" value={draft.timezone} onChange={event => set({ timezone: event.target.value })} disabled={busy}><option value="">未指定</option>{draft.timezone && !timezoneOptions.some(option => option.value === draft.timezone) && <option value={draft.timezone}>{timezoneLabel(draft.timezone, draft.date)}（保留原时区）</option>}{timezoneOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button className="ai-button ai-secondary" type="button" disabled={busy} onClick={() => set({ timezone: offsetTimezone(-new Date().getTimezoneOffset()) })}>采用设备时区</button></div>
        {draft.period === "daytime" ? <label className="ai-fasting ai-draft-wide"><input type="checkbox" checked={draft.fasting} onChange={event => set({ fasting: event.target.checked })} disabled={busy} />确认这次晨间测量为空腹</label> : <p className="ai-muted ai-draft-wide">晚间固定为非空腹。</p>}
      </>}
    </div>
    <p className="ai-muted">更新预览后，再核对前后值并确认保存。修改时区保留原当地钟点，未知测量时间保持空白。</p>
    <div className="ai-actions"><button type="submit" className="ai-button" disabled={busy}>{updating ? "正在更新…" : "更新预览"}</button><button type="button" className="ai-button ai-secondary" disabled={busy} onClick={close}>放弃本行修改</button></div>
  </form>;
}
type ReviewResult = { ok: true; data: Operation } | { ok: false; error: string };
export function AiConfirmation({ operation: initial, review, load }: { operation: Operation; review: (id: string, action: ReviewAction) => Promise<ReviewResult>; load: (id: string) => Promise<ReviewResult> }) {
  const [updated, setUpdated] = useState<Operation | null>(null), [drafts, setDrafts] = useState<Record<string, Draft>>({}), [error, setError] = useState(""), [busy, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<{ kind: ReviewAction["kind"] | "load"; ids?: string[] } | null>(null);
  const labels = { confirm: "正在保存记录…", cancel: "正在取消待处理记录…", update: "正在更新预览…", refresh: "正在刷新预览…", load: "正在加载最新审核…" };
  usePageLoading({ active: busy, label: labels[pendingAction?.kind ?? "confirm"] });
  const processing = (kind: NonNullable<typeof pendingAction>["kind"], id?: string) => busy && pendingAction?.kind === kind && (id ? !pendingAction.ids || pendingAction.ids.includes(id) : !pendingAction.ids);
  const busyRef = useRef(false), operation = updated && updated.revision >= initial.revision ? updated : initial;
  const now = useSyncExternalStore(subscribeClock, currentSecond, serverSecond);
  const { counts } = operation, editing = Object.keys(drafts).length > 0, expired = operation.status === "expired" || (now > 0 && Date.parse(operation.expiresAt) <= now * 1000);
  function edit(item: ReviewItem) { setDrafts(current => ({ ...current, [item.id]: current[item.id] ?? draftFor(item) })); setError(""); }
  function removeDrafts(ids: string[]) { setDrafts(current => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id)))); }
  function submit(action: ReviewAction, clear: string[] = []) {
    if (busyRef.current || busy) return;
    busyRef.current = true; setError("");
    setPendingAction({ kind: action.kind, ids: "changes" in action ? action.changes.map(change => change.itemId) : "itemIds" in action ? action.itemIds : undefined });
    startTransition(async () => {
      try { const result = await review(operation.id, action); if (result.ok) { setUpdated(result.data); removeDrafts(clear); } else setError(result.error); }
      catch { setError("操作未完成，请稍后重试；输入已保留。"); }
      finally { busyRef.current = false; }
    });
  }
  function update(ids: string[]) {
    const changes = ids.map(itemId => ({ itemId, input: inputFromDraft(operation.items.find(item => item.id === itemId)!, drafts[itemId]) }));
    submit({ kind: "update", revision: operation.revision, changes }, ids);
  }
  function loadLatest() {
    if (busyRef.current || busy) return;
    busyRef.current = true;
    setPendingAction({ kind: "load" });
    startTransition(async () => {
      try { const result = await load(operation.id); if (result.ok) { setUpdated(result.data); setError(""); } else setError(result.error); }
      catch { setError("暂时无法加载最新审核，输入已保留。"); }
      finally { busyRef.current = false; }
    });
  }
  return <section className="ai-page ai-review-page" aria-labelledby="confirmation-title" aria-busy={busy}>
    <LoadingLink href="/dashboard/ai" className="ai-back">← AI 接入</LoadingLink>
    <div className="ai-review-heading"><div><p className="ai-eyebrow">BODY RECORDS / REVIEW</p><h1 id="confirmation-title">审核身体记录</h1><p className="ai-lead">{operation.preview.date} · {operationStatusLabels[operation.status]}</p></div><div className="ai-review-total"><strong>{counts.total}</strong><span>条提交记录</span></div></div>
    <p>每行可以修改、确认或取消；单行确认后立即保存。</p>
    <div className="ai-review-toolbar" aria-label="整批操作">
      <p className="ai-review-progress" role="status">已保存 {counts.saved} · 待确认 {counts.pending} · 已取消 {counts.cancelled} · 已跳过 {counts.skipped}</p>
      {!!counts.pending && <div className="ai-actions"><button className="ai-button" disabled={busy || editing || expired || !!counts.issues} onClick={() => submit({ kind: "confirm", revision: operation.revision })}>{processing("confirm") ? "正在保存…" : "全部确认保存"}</button><button className="ai-button ai-secondary" disabled={busy} onClick={() => { for (const item of operation.items) if (item.status === "pending") edit(item); }}>批量修改</button><button className="ai-button ai-secondary" disabled={busy} onClick={() => submit({ kind: "cancel", revision: operation.revision }, Object.keys(drafts))}>{processing("cancel") ? "正在取消…" : "取消剩余"}</button></div>}
      {editing && <div className="ai-actions"><button className="ai-button" disabled={busy} onClick={() => update(Object.keys(drafts))}>{busy && pendingAction?.kind === "update" ? "正在更新…" : "更新全部预览"}</button><button className="ai-button ai-secondary" disabled={busy} onClick={() => setDrafts({})}>放弃全部修改</button></div>}
      {!!counts.pending && <p className="ai-muted">{editing ? "有修改尚未更新预览，请先更新或放弃修改。" : counts.issues ? `${counts.issues} 条需要核对，整批保存暂不可用；有效行仍可单独保存。` : "全部确认只保存剩余待确认记录。"}取消剩余不会撤销已保存记录。</p>}
      {error && <p role="alert" className="ai-error">{error}</p>}
      {error.includes("另一个页面") && <button className="ai-button ai-secondary" disabled={busy} onClick={loadLatest}>{processing("load") ? "正在加载…" : "加载最新审核，保留输入"}</button>}
      {!!counts.pending && <div className="ai-review-refresh"><span className={expired ? "ai-error" : "ai-muted"}>{expired ? "预览已过期，请刷新后重新核对。" : `预览有效至 ${operation.expiresAt.slice(0, 16).replace("T", " ")} GMT+0`}</span><button className="ai-button ai-secondary" disabled={busy || editing} onClick={() => submit({ kind: "refresh", revision: operation.revision })}>{processing("refresh") ? "正在刷新…" : "刷新预览"}</button></div>}
    </div>
    <div className="ai-review-items">{operation.items.map((item, index) => {
      const row = item.preview.rows[0], input = item.input, terminal = item.status !== "pending";
      return <article className="ai-review-item" key={item.id} aria-labelledby={`item-${item.id}`} data-item-id={item.id} data-item-status={item.status}>
        <header className="ai-item-heading"><span className="ai-item-number">{String(index + 1).padStart(2, "0")}</span><div><h2 id={`item-${item.id}`}>{input.date} · {input.period === "daytime" ? "晨间" : "晚间"}</h2><p className="ai-muted">{row ? names[row.state] : "身体记录"}{input.kind === "estimate_cell" ? ` · ${input.metric === "weightKg" ? "体重" : "体脂率"}` : ""}</p></div><span className="ai-item-status">{states[item.status]}</span></header>
        <p className={!terminal && !item.preview.canConfirm ? "ai-error" : "ai-muted"}>{item.result?.message ?? row?.message ?? item.preview.message}</p>
        <table className="ai-comparison"><thead><tr><th>字段</th><th>当前值</th><th>{item.status === "confirmed" ? "已保存值" : "预览值"}</th></tr></thead><tbody>{fields.filter(field => input.kind !== "estimate_cell" || field.key === input.metric).map(field => {
          const shown = (values: Record<string, unknown> | null | undefined) => field.key === "timezone" ? String(values?.timezoneLabel ?? timezoneLabel(values?.timezone as string | null, input.date, values?.utcOffsetMinutes as number | null)) : display(values?.[field.key], field.unit);
          return <tr key={field.key}><th>{field.label}</th><td>{shown(row?.before)}</td><td>{row?.after && !Object.hasOwn(row.after, field.key) ? "未提交" : shown(row?.after)}</td></tr>;
        })}</tbody></table>
        {!!row?.before?.candidates && <p className="ai-muted">同一时段有多个实测。点击修改，明确选择要改的历史记录。</p>}
        {!!row?.replacedEstimates?.length && <p className="ai-muted">此次实测会替代该时段已有的对应指标估计。</p>}
        <Explanation item={item} />
        {drafts[item.id] ? <DraftForm item={item} draft={drafts[item.id]} change={draft => setDrafts(current => ({ ...current, [item.id]: draft }))} busy={busy} updating={processing("update", item.id)} save={() => update([item.id])} close={() => removeDrafts([item.id])} /> : !terminal && <div className="ai-actions ai-row-actions"><button className="ai-button" disabled={busy || editing || expired || !item.preview.canConfirm} onClick={() => submit({ kind: "confirm", revision: operation.revision, itemIds: [item.id] })}>{processing("confirm", item.id) ? "正在保存…" : "确认保存"}</button><button className="ai-button ai-secondary" disabled={busy} onClick={() => edit(item)}>修改</button><button className="ai-button ai-secondary" disabled={busy} onClick={() => submit({ kind: "cancel", revision: operation.revision, itemIds: [item.id] })}>{processing("cancel", item.id) ? "正在取消…" : "取消"}</button></div>}
      </article>;
    })}</div>
    <LoadingLink href="/dashboard">回到身体记录</LoadingLink>
  </section>;
}
