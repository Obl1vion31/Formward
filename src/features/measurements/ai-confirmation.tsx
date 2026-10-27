"use client";
import { useDraftGuard, useDraftClose } from "@/components/draft-guard";
import { useState } from "react";
import type { ReviewInput, ReviewItem } from "./ai-operations";
import { offsetTimezone, timezoneLabel, timezoneOptions } from "./timezone";
import { SourceInput } from "@/components/source-input";
import type { SourceRemovalResult } from "./entry-state";

type Draft = { seed: ReviewItem; date: string; period: ReviewInput["period"]; weightKg: string; bodyFatPercent: string; deviceLabel: string; fasting: boolean; timezone: string; recordId: string; version: string };
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
  // 仅用户应用修改时确认当前空来源；填写来源清除旧请求的留空标记。
  if (!draft.deviceLabel.trim()) { input.deviceLabel = null; input.sourceUnspecifiedConfirmed = true; }
  else delete input.sourceUnspecifiedConfirmed;
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
function DraftForm({ item, draft, change, busy, updating, save, close, sources, removeSource }: { item: ReviewItem; draft: Draft; change: (draft: Draft) => void; busy: boolean; updating: boolean; save: () => void; close: () => void; sources: string[]; removeSource: (label: string) => Promise<SourceRemovalResult> }) {
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
        <div className="ai-draft-wide"><SourceInput label="测量来源" value={draft.deviceLabel} sources={sources} onChange={value => set({ deviceLabel: value })} removeSource={removeSource} disabled={busy} /></div>
        <div className="ai-draft-wide ai-timezone-field"><label>时区<select aria-label="时区" value={draft.timezone} onChange={event => set({ timezone: event.target.value })} disabled={busy}><option value="">未指定</option>{draft.timezone && !timezoneOptions.some(option => option.value === draft.timezone) && <option value={draft.timezone}>{timezoneLabel(draft.timezone, draft.date)}（保留原时区）</option>}{timezoneOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button className="ai-button ai-secondary" type="button" disabled={busy} onClick={() => set({ timezone: offsetTimezone(-new Date().getTimezoneOffset()) })}>采用设备时区</button></div>
        {draft.period === "daytime" ? <label className="ai-fasting ai-draft-wide"><input type="checkbox" checked={draft.fasting} onChange={event => set({ fasting: event.target.checked })} disabled={busy} />确认这次晨间测量为空腹</label> : <p className="ai-muted ai-draft-wide">晚间固定为非空腹。</p>}
      </>}
    </div>
    <p className="ai-muted">应用修改后，再核对前后值并确认保存。修改时区保留原当地钟点，未知测量时间保持空白。</p>
    <div className="ai-actions"><button type="submit" className="ai-button" disabled={busy}>{updating ? "正在更新…" : "应用修改"}</button><button type="button" className="ai-button ai-secondary" disabled={busy} onClick={close}>放弃本行修改</button></div>
  </form>;
}
export function MeasurementReviewEditor({ item, busy, save, close, sources, removeSource }: { item: ReviewItem; busy: boolean; save: (input: ReviewInput) => void; close: () => void; sources: string[]; removeSource: (label: string) => Promise<SourceRemovalResult> }) {
  const [draft, setDraft] = useState(() => draftFor(item));
  const [initialSignature] = useState(() => JSON.stringify(draft));
  useDraftGuard(JSON.stringify(draft) !== initialSignature, busy);
  const closeDraft = useDraftClose(close);
  return <DraftForm item={item} draft={draft} change={setDraft} busy={busy} updating={busy} save={() => save(inputFromDraft(item, draft))} close={closeDraft} sources={sources} removeSource={removeSource} />;
}
export { Explanation as MeasurementReviewExplanation };
