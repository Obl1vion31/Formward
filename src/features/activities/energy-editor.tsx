"use client";
import { useState } from "react";
import { energyModes, energyValue, type ActivityRecord, type EnergyAction } from "./model";
import styles from "./energy.module.css";

type ActivityDraft = Extract<EnergyAction, { kind: "save_activity" }> & { key: string };
export function EnergyEditor({ initial, activities = [], busy, error, save, saveBatch, submitLabel = "保存" }: { initial: EnergyAction; activities?: ActivityRecord[]; busy: boolean; error: string; save: (action: EnergyAction) => void; saveBatch?: (actions: EnergyAction[]) => void; submitLabel?: string }) {
  const [draft, setDraft] = useState(initial);
  const [sex, setSex] = useState(initial.kind === "save_energy_profile" && initial.birthDate ? initial.sex : "");
  const [items, setItems] = useState<ActivityDraft[]>(() => activities.map(row => ({ key: row.id, kind: "save_activity", id: row.id, version: row.version, date: row.date, name: row.name, durationMinutes: row.durationMinutes, caloriesKcal: row.caloriesKcal, completed: row.completed, sourceSystem: row.sourceSystem, timezone: row.timezone })));
  const set = (key: string, value: unknown) => setDraft(current => ({ ...current, [key]: value, ...(key === "restingKcal" ? { restingEstimated: false } : key === "activeKcal" ? { activeEstimated: false } : key === "sourceSystem" ? { sourceRecordId: null } : {}) }));
  const modes: { entryMode: "components" | "total"; activityMode: "total" | "activities" } = draft.kind === "save_energy_day" ? energyModes({ ...draft, activityMode: draft.activityMode ?? (draft.activeKcal != null || !draft.id ? "total" : "activities"), totalKcal: draft.totalKcal ?? null, activeKcal: draft.activeKcal ?? null }) : { entryMode: "components", activityMode: "total" };
  const numberField = (key: "restingKcal" | "activeKcal" | "totalKcal" | "caloriesKcal" | "durationMinutes", label: string, placeholder: string) => <label key={key}>{label}<input aria-label={label} type="number" min="0" max="1000000" step="0.0001" inputMode="decimal" disabled={draft.kind === "save_energy_day" && (key === "totalKcal" ? modes.entryMode !== "total" : modes.entryMode !== "components" || key === "activeKcal" && modes.activityMode !== "total")} placeholder={placeholder} value={key in draft ? (draft as Record<string, unknown>)[key] as string ?? "" : ""} onChange={event => set(key, event.target.value || null)} /></label>;
  const sourceField = (key: "sourceSystem" | "restingSourceSystem" | "activeSourceSystem", label: string) => <label>{label}<input aria-label={label} maxLength={200} placeholder="可选，如 Garmin 手表" value={key in draft ? (draft as Record<string, unknown>)[key] as string ?? "" : key !== "sourceSystem" && "sourceSystem" in draft ? draft.sourceSystem ?? "" : ""} onChange={event => set(key, event.target.value || null)} /></label>;
  const detailTotal = items.every(item => item.completed === false || item.caloriesKcal != null) ? items.filter(item => item.completed !== false).reduce((sum, item) => sum + Number(item.caloriesKcal), 0) : null;
  const active = draft.kind === "save_energy_day" ? modes.activityMode === "activities" ? detailTotal : Number(draft.activeKcal ?? 0) : null;
  const total = draft.kind === "save_energy_day" ? modes.entryMode === "total" ? draft.totalKcal ?? null : draft.restingKcal != null && active != null ? Number(draft.restingKcal) + active : null : null;
  function submit() {
    if (draft.kind === "save_energy_profile") {
      const today = new Date().toLocaleDateString("en-CA");
      const affectedFrom = initial.kind === "save_energy_profile" && initial.effectiveFrom < draft.effectiveFrom ? initial.effectiveFrom : draft.effectiveFrom;
      if (affectedFrom < today && !window.confirm(`资料将从 ${draft.effectiveFrom} 生效，公式对照影响日期从 ${affectedFrom} 起至下一份资料之前；不会修改每日消耗。确认保存？`)) return;
    }
    if (draft.kind !== "save_energy_day") { save(draft); return; }
    const { restingKcal, activeKcal, totalKcal, ...base } = draft;
    const day: EnergyAction = modes.entryMode === "total" ? { ...base, entryMode: "total", activityMode: modes.activityMode, totalKcal: totalKcal ?? null } : { ...base, entryMode: "components", activityMode: modes.activityMode, restingKcal: restingKcal ?? null, ...(modes.activityMode === "total" ? { activeKcal: activeKcal ?? "0" } : {}) };
    const changes: EnergyAction[] = [day];
    if (saveBatch && modes.entryMode === "components" && modes.activityMode === "activities") {
      for (const item of items) { const { key, ...action } = item; void key; changes.push({ ...action, date: draft.date }); }
      for (const removed of activities.filter(row => !items.some(item => item.id === row.id))) changes.push({ kind: "delete_activity", id: removed.id, version: removed.version });
    }
    if (saveBatch) saveBatch(changes); else save(day);
  }
  const retired = draft.kind.includes("energy_defaults");
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); submit(); }}><fieldset disabled={busy || retired}>
    {retired ? <p role="alert">日常默认值已停用，请取消这一项。</p> : draft.kind === "save_energy_profile" ? <>
      <div className={styles.fields}><label>生效日期<input aria-label="生效日期" type="date" required value={draft.effectiveFrom} onChange={event => set("effectiveFrom", event.target.value)} /></label><label>身高 · cm<input aria-label="身高" type="number" required min="0.0001" max="300" step="0.0001" value={draft.heightCm} onChange={event => set("heightCm", event.target.value)} /></label><label>出生日期<input aria-label="出生日期" type="date" required value={draft.birthDate} onChange={event => set("birthDate", event.target.value)} /></label><label>公式性别参数<select aria-label="公式性别参数" required value={sex} onChange={event => { setSex(event.target.value); set("sex", event.target.value); }}><option value="" disabled>请选择</option><option value="male">男性</option><option value="female">女性</option></select></label></div>
    </> : draft.kind === "save_energy_day" || draft.kind === "save_activity" ? <>
      <div className={styles.editorTop}><label>日期<input aria-label="日期" type="date" required value={draft.date} onChange={event => set("date", event.target.value)} /></label>{draft.kind === "save_energy_day" && <div className={styles.modeSwitch} role="group" aria-label="消耗录入方式">{[["components", "分开记录"], ["total", "只记总数"]].map(([value, label]) => <button type="button" key={value} aria-pressed={modes.entryMode === value} onClick={() => set("entryMode", value)}>{label}</button>)}</div>}</div>
      {draft.kind === "save_energy_day" ? <>
        <div hidden={modes.entryMode !== "components"}>
          <section className={styles.editorSection}><h3>静息消耗</h3><div className={styles.fields}>{numberField("restingKcal", "静息 · kcal", "未填写")}{sourceField("restingSourceSystem", "静息来源")}</div></section>
          <section className={styles.editorSection}><div className={styles.title}><h3>活动消耗</h3><div className={styles.modeSwitch} role="group" aria-label="活动记录方式">{[["total", "记合计"], ["activities", "按运动累计"]].map(([value, label]) => <button type="button" key={value} aria-pressed={modes.activityMode === value} onClick={() => set("activityMode", value)}>{label}</button>)}</div></div>
            <div hidden={modes.activityMode !== "total"}><div className={styles.fields}>{numberField("activeKcal", "活动合计 · kcal", "未记录活动时记 0")}{sourceField("activeSourceSystem", "活动来源")}</div></div>
            <div hidden={modes.activityMode !== "activities"}>{saveBatch ? <>{items.map((item, index) => <div className={styles.activityDraft} key={item.key}><div className={styles.title}><h4>运动 {index + 1}</h4><button type="button" onClick={() => setItems(current => current.filter(row => row.key !== item.key))}>移除运动 {index + 1}</button></div><div className={styles.fields}>{([["name", "运动名称", "text"], ["caloriesKcal", "运动热量 · kcal", "number"], ["durationMinutes", "运动时长 · 分钟", "number"], ["sourceSystem", "运动来源", "text"]] as const).map(([key, label, type]) => <label key={key}>{label}<input aria-label={`${label} ${index + 1}`} type={type} disabled={modes.entryMode !== "components" || modes.activityMode !== "activities"} min={type === "number" ? 0 : undefined} max={type === "number" ? 1000000 : undefined} maxLength={type === "text" ? 200 : undefined} step={type === "number" ? "0.0001" : undefined} required={key === "name" && modes.entryMode === "components" && modes.activityMode === "activities"} value={item[key] ?? ""} onChange={event => setItems(current => current.map(row => row.key === item.key ? { ...row, [key]: event.target.value || (key === "name" ? "" : null) } : row))} /></label>)}</div><label className={styles.checkbox}><input type="checkbox" checked={item.completed ?? true} onChange={event => setItems(current => current.map(row => row.key === item.key ? { ...row, completed: event.target.checked } : row))} />已完成</label></div>)}<button type="button" onClick={() => setItems(current => [...current, { key: crypto.randomUUID(), kind: "save_activity", date: draft.date, name: "", completed: true, timezone: draft.timezone }])}>＋ 添加运动</button><p className={styles.hint}>活动合计 {energyValue(detailTotal)} kcal</p></> : <p className={styles.hint}>运动明细在各自的审核项中修改。</p>}</div>
          </section>
        </div>
        <div hidden={modes.entryMode !== "total"}><section className={styles.editorSection}><h3>全天总消耗</h3><div className={styles.fields}>{numberField("totalKcal", "全天总消耗 · kcal", "填写总数")}{sourceField("sourceSystem", "总消耗来源")}</div></section></div>
        <div className={styles.editorTotal} aria-live="polite"><span>当天总消耗<small>{modes.entryMode === "components" ? "自动合计" : "直接记录"}</small></span><strong>{energyValue(total)}<small>kcal</small></strong></div>
      </> : <><div className={styles.fields}><label>活动名称<input aria-label="活动名称" maxLength={200} required value={draft.name} onChange={event => set("name", event.target.value)} /></label>{sourceField("sourceSystem", "活动来源")}{numberField("durationMinutes", "时长 · 分钟", "可选")}{numberField("caloriesKcal", "活动热量 · kcal", "未填写")}</div><label className={styles.checkbox}><input type="checkbox" checked={draft.completed ?? true} onChange={event => set("completed", event.target.checked)} />已完成</label></>}
      <details><summary>时间与备注</summary><div className={styles.fields}><label>时区<input aria-label="时区" maxLength={100} value={draft.timezone ?? ""} onChange={event => set("timezone", event.target.value)} /></label>{draft.kind === "save_energy_day" && <label>备注<input aria-label="备注" maxLength={2000} value={draft.notes ?? ""} onChange={event => set("notes", event.target.value || null)} /></label>}</div></details>
    </> : null}
    {error && <p role="alert" className={styles.error}>{error}</p>}<button className={styles.save} type="submit">{busy ? "正在保存…" : submitLabel}</button>
  </fieldset></form>;
}
