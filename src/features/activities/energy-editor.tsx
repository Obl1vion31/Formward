"use client";
import { useState } from "react";
import type { EnergyAction } from "./model";
import styles from "./energy.module.css";

export function EnergyEditor({ initial, busy, error, save, submitLabel = "保存" }: { initial: EnergyAction; busy: boolean; error: string; save: (action: EnergyAction) => void; submitLabel?: string }) {
  const [draft, setDraft] = useState(initial);
  const [sex, setSex] = useState(initial.kind === "save_energy_profile" && initial.birthDate ? initial.sex : "");
  const set = (key: string, value: unknown) => setDraft(current => ({ ...current, [key]: value }));
  const numberField = (key: "restingKcal" | "activeKcal" | "totalKcal" | "caloriesKcal" | "durationMinutes", label: string, placeholder: string) => <label key={key}>{label}<input aria-label={label} type="number" min="0" max="1000000" step="0.0001" inputMode="decimal" placeholder={placeholder} value={key in draft ? (draft as Record<string, unknown>)[key] as string ?? "" : ""} onChange={event => set(key, event.target.value || null)} /></label>;
  return <form className={styles.form} onSubmit={event => {
    event.preventDefault();
    if (draft.kind === "save_energy_defaults" && draft.restingFrom < new Date().toLocaleDateString("en-CA") && !window.confirm(`平均静息将从 ${draft.restingFrom} 起用于没有单日静息值的日期，确认保存？`)) return;
    if (draft.kind === "save_energy_profile") {
      const today = new Date().toLocaleDateString("en-CA");
      const affectedFrom = initial.kind === "save_energy_profile" && initial.effectiveFrom < draft.effectiveFrom ? initial.effectiveFrom : draft.effectiveFrom;
      if (affectedFrom < today && !window.confirm(`资料将从 ${draft.effectiveFrom} 生效，受影响日期从 ${affectedFrom} 起至下一份有效资料之前；仅更新缺少录入静息值的公式估算。确认保存？`)) return;
    }
    save(draft);
  }}><fieldset disabled={busy}>
    {draft.kind === "save_energy_defaults" ? <>
      <div className={styles.fields}><label>平均静息生效日期<input aria-label="平均静息生效日期" type="date" required value={draft.restingFrom} onChange={event => set("restingFrom", event.target.value)} /></label>{numberField("restingKcal", "平均静息 · kcal", "留空改用公式")}</div>
      <label>未录活动按零的起始日期<input aria-label="未录活动按零的起始日期" type="date" value={draft.zeroActivityFrom ?? ""} onChange={event => set("zeroActivityFrom", event.target.value || null)} /></label>
    </> : draft.kind === "save_energy_profile" ? <>
      <div className={styles.fields}><label>生效日期<input aria-label="生效日期" type="date" required value={draft.effectiveFrom} onChange={event => set("effectiveFrom", event.target.value)} /></label><label>身高 · cm<input aria-label="身高" type="number" required min="0.0001" max="300" step="0.0001" value={draft.heightCm} onChange={event => set("heightCm", event.target.value)} /></label><label>出生日期<input aria-label="出生日期" type="date" required value={draft.birthDate} onChange={event => set("birthDate", event.target.value)} /></label><label>公式性别参数<select aria-label="公式性别参数" required value={sex} onChange={event => { setSex(event.target.value); set("sex", event.target.value); }}><option value="" disabled>请选择</option><option value="male">男性</option><option value="female">女性</option></select></label></div>
      <p className={styles.hint}>缺少录入静息值时使用这些资料估算。</p>
    </> : draft.kind === "save_energy_day" || draft.kind === "save_activity" ? <>
      <div className={styles.fields}><label>日期<input aria-label="日期" type="date" required value={draft.date} onChange={event => set("date", event.target.value)} /></label>{draft.kind === "save_activity" && <label>活动名称<input aria-label="活动名称" maxLength={200} required value={draft.name} onChange={event => set("name", event.target.value)} /></label>}</div>
      <div className={styles.fields}>{draft.kind === "save_energy_day" ? <>{numberField("restingKcal", "静息 · kcal", "留空使用公式估算")}{numberField("activeKcal", "活动合计 · kcal", "留空汇总活动，无活动填 0")}{numberField("totalKcal", "全天总消耗 · kcal", "可选，填写后采用这个总数")}</> : <>{numberField("durationMinutes", "时长 · 分钟", "可选")}{numberField("caloriesKcal", "活动热量 · kcal", "按设备或已知数值填写")}</>}</div>
      {draft.kind === "save_energy_day" && <label className={styles.checkbox}><input type="checkbox" checked={draft.activeEstimated ?? false} onChange={event => set("activeEstimated", event.target.checked)} />活动合计为估算</label>}
      {draft.kind === "save_activity" && <label className={styles.checkbox}><input type="checkbox" checked={draft.completed ?? true} onChange={event => set("completed", event.target.checked)} />已完成</label>}
      {draft.kind === "save_energy_day" && <label>备注<input aria-label="备注" maxLength={2000} value={draft.notes ?? ""} onChange={event => set("notes", event.target.value || null)} /></label>}
      <details><summary>来源与时间</summary><div className={styles.fields}><label>来源<input aria-label="来源" maxLength={200} value={draft.sourceSystem ?? ""} onChange={event => set("sourceSystem", event.target.value || null)} /></label><label>时区<input aria-label="时区" required maxLength={100} value={draft.timezone ?? ""} onChange={event => set("timezone", event.target.value)} /></label><label>来源记录编号<input maxLength={200} value={draft.sourceRecordId ?? ""} onChange={event => set("sourceRecordId", event.target.value || null)} /></label><label>来源发生时间<input placeholder="2026-10-22T08:00:00+08:00" value={draft.sourceOccurredAt ?? ""} onChange={event => set("sourceOccurredAt", event.target.value || null)} /></label></div></details>
    </> : null}
    {error && <p role="alert" className={styles.error}>{error}</p>}<button className={styles.save} type="submit">{busy ? "正在保存…" : submitLabel}</button>
  </fieldset></form>;
}
