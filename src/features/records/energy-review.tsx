"use client";
import { useState } from "react";
import { confirmAction } from "@/components/confirmation-state";
import { formatIntegerNumber } from "@/components/number-format";
import { activitySummary } from "../activities/activity-summary";
import { energyBaseline, energyModes, type EnergyDay, type EnergyDayRecord } from "../activities/model";
import type { RecordRow } from "./model";
import { energyChanges, energyReviewGroups, onlyInclusionChanged } from "./energy-review-model";
import styles from "./energy-review.module.css";

type Props = {
  rows: RecordRow[];
  busy: boolean;
  dayRecords?: EnergyDayRecord[];
  edit: (key: string) => void;
  exclude: (keys: string[]) => void;
  restore: (key: string) => void;
  choose: (key: string, inclusion: "included" | "additional") => void;
};
function NumberUnit({ value, unit = "kcal" }: { value: string | null | undefined; unit?: string }) {
  return <span className={styles.numberUnit}>{formatIntegerNumber(value)}<small>{unit}</small></span>;
}
function Changes({ row }: { row: RecordRow }) {
  const changes = energyChanges(row), numeric = changes.filter(change => change.numeric || ["name", "date"].includes(change.key));
  const visible = numeric.filter(change => !change.numeric || formatIntegerNumber(change.before as string) !== formatIntegerNumber(change.after as string));
  const precise = numeric.filter(change => change.numeric && !visible.includes(change));
  return <>{visible.length > 0 && <dl className={styles.changes} aria-label="本次修改">{visible.map(change => <div key={change.key}><dt>{change.label}</dt><dd><del>{change.numeric ? formatIntegerNumber(change.before as string) : String(change.before ?? "未填写")}</del><span aria-label="修改为"> → </span><strong>{change.numeric ? formatIntegerNumber(change.after as string) : String(change.after ?? "未填写")}</strong>{change.numeric && <small>{change.key === "durationMinutes" ? " 分钟" : " kcal"}</small>}</dd></div>)}</dl>}
    {precise.length > 0 && <details className={styles.details}><summary>有{precise.length}项小数变化，查看原始值</summary>{precise.map(change => <p key={change.key}>{change.label}：{String(change.before ?? "未知")} → {String(change.after ?? "未知")}</p>)}</details>}</>;
}
function Evidence({ row }: { row: RecordRow }) {
  const record = row.energy?.after;
  if (!record) return null;
  const before = row.energy?.before;
  const metadata = energyChanges(row).filter(change => !change.numeric && !["name", "date"].includes(change.key));
  const values: [string, string | null | undefined][] = "date" in record && "restingKcal" in record
    ? energyModes(record).entryMode === "total"
      ? [["来源", record.sourceSystem], ["备注", record.notes], ["时区", record.timezone]]
      : [["静息来源", record.restingSourceSystem ?? record.sourceSystem], ["活动来源", record.activeSourceSystem ?? record.sourceSystem], ["备注", record.notes], ["时区", record.timezone]]
    : "sourceSystem" in record ? [["来源", record.sourceSystem], ["时区", record.timezone]] : [];
  return <details className={styles.details}><summary>查看来源与备注</summary>
    <dl className={styles.evidence}>{values.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {metadata.length > 0 && <div className={styles.metadataChanges}><span>其他修改</span>{metadata.map(change => <p key={change.key}>{change.label}：{displayMode(change.before)} → {displayMode(change.after)}</p>)}</div>}
    {before && <details className={styles.details}><summary>查看原记录</summary><dl className={styles.evidence}>{energyOriginalValues(before).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>}
  </details>;
}
function displayMode(value: unknown) {
  return value == null ? "未填写" : ({ components: "分开记录", total: "记总数", activities: "按运动累计" }[String(value)] ?? String(value));
}
function energyOriginalValues(record: NonNullable<RecordRow["energy"]>["after"]): [string, string][] {
  if (!record) return [];
  const labels: Record<string, string> = { date: "日期", name: "运动", restingKcal: "静息", activeKcal: "活动合计", totalKcal: "录入全天总数", exerciseActiveKcal: "纯运动", exerciseRestingKcal: "期间静息", caloriesKcal: "运动总消耗", durationMinutes: "时长", sourceSystem: "来源", restingSourceSystem: "静息来源", activeSourceSystem: "活动来源", notes: "备注", timezone: "时区" };
  return Object.entries(record).filter(([key, value]) => key in labels && value != null).map(([key, value]) => [labels[key], String(value)]);
}
function DayReading({ day, pending }: { day?: EnergyDay; pending: boolean }) {
  const modes = energyModes(day?.record), extra = day?.additionalKcal != null && Number(day.additionalKcal) !== 0;
  return <div className={styles.dayReading} data-energy-review-total>
    <p className={styles.totalLabel}>当天总消耗</p>
    <strong className={styles.dayTotal}>{pending ? <span>待核对</span> : <NumberUnit value={day?.totalKcal} />}</strong>
    <div className={styles.dayParts}>{modes.entryMode === "total" ? extra
      ? <><span>录入总数 <NumberUnit value={day?.recordedTotalKcal} /></span><b>＋</b><span>额外运动 <NumberUnit value={day?.additionalKcal} /></span></>
      : <span>直接录入全天总数</span>
      : <><span>静息 <NumberUnit value={day?.restingKcal} unit="" /></span><b>＋</b><span>{modes.activityMode === "activities" ? "运动累计" : "活动合计"} <NumberUnit value={day?.activeKcal} unit="" /></span></>}</div>
    {extra && modes.entryMode !== "total" && <p className={styles.extraParts}>活动包含手填合计 {formatIntegerNumber(day?.recordedActiveKcal)} 和额外运动 {formatIntegerNumber(day?.additionalKcal)} kcal</p>}
    {!pending && day?.totalKcal == null && <p className={styles.notice}>{!day?.record ? "尚未填写当天消耗，可先保存运动。" : "当天消耗尚有缺项，可保存已有部分。"}</p>}
  </div>;
}
function RowActions({ row, props }: { row: RecordRow; props: Props }) {
  if (row.persisted) return <span className={styles.status}>已保存</span>;
  return <div className={styles.rowActions}>{row.excluded
    ? <button type="button" disabled={props.busy} onClick={() => props.restore(row.key)}>恢复本项</button>
    : <><button type="button" disabled={props.busy || !["save_energy_day", "save_activity"].includes(row.action.kind)} onClick={() => props.edit(row.key)}>修改</button><button type="button" disabled={props.busy} onClick={() => props.exclude([row.key])}>取消</button></>}</div>;
}
function Exercise({ row, day, props }: { row: RecordRow; day?: EnergyDayRecord; props: Props }) {
  const [changing, setChanging] = useState(false);
  const after = row.energy?.after, activity = after && "name" in after ? after : undefined;
  const baseline = energyBaseline(day), modes = energyModes(day);
  const relation = activity?.inclusionBasis === baseline ? activity?.inclusion : null;
  const unresolved = !!baseline && !!activity?.completed && !!row.energy?.coverageQuestions?.length && !relation;
  const choiceVisible = unresolved || changing;
  const reading = activity ? activitySummary(activity, day, { pending: unresolved }) : null;
  const relationOnly = onlyInclusionChanged(row);
  return <article className={styles.exercise} id={"record-" + row.key} data-review-key={row.key} data-excluded={row.excluded}>
    <header className={styles.exerciseHeading}><h3>{activity?.name ?? (row.action.kind === "save_activity" ? row.action.name : "运动")}</h3><span className={styles.status}>{row.excluded ? "已取消" : relationOnly ? relation === "included" ? "确认已包含" : relation === "additional" ? "确认额外增加" : "待核对包含关系" : row.energy?.before ? "修改运动" : "新增运动"}</span></header>
    {!row.excluded && <>{reading && <><strong className={styles.exerciseTotal}><NumberUnit value={reading.totalKcal} /></strong>{reading.breakdown && <p className={styles.breakdown}>{reading.breakdown}</p>}
      {relationOnly && <p className={styles.unchanged}>运动数值未改</p>}
      {choiceVisible ? <div className={styles.question} role="group" aria-label="运动包含关系"><p>这项运动是否已包含在当天{modes.entryMode === "total" ? "总消耗" : "活动合计"} {formatIntegerNumber(modes.entryMode === "total" ? day?.totalKcal : day?.activeKcal)} 千卡中？</p><div className={styles.choices}>{([["included", "已包含，不再增加"], ["additional", "额外增加"]] as const).map(([choice, label]) => <button type="button" key={choice} disabled={props.busy} aria-pressed={relation === choice} onClick={() => { setChanging(false); props.choose(row.key, choice); }}>{label}</button>)}</div></div>
        : <div className={styles.effect}><p data-exercise-effect>{reading.effect}</p>{baseline && activity?.completed && !props.busy && !row.persisted && <button type="button" onClick={() => setChanging(true)}>修改包含关系</button>}</div>}</>}
      {row.energy?.warnings?.map(text => <p role="status" className={styles.notice} key={text}>{text}</p>)}
      {row.energy?.error && !unresolved && <p role="alert" className={styles.error}>{row.energy.error}</p>}
      <Changes row={row} /></>}
    <div className={styles.exerciseFooter}>{!row.excluded && <Evidence row={row} />}<RowActions row={row} props={props} /></div>
  </article>;
}
export function EnergyReview(props: Props) {
  return <section aria-label="消耗与活动" className={styles.section}>{energyReviewGroups(props.rows).map(group => {
    const selected = group.rows.filter(row => !row.excluded);
    const day = selected.find(row => row.energy?.day)?.energy?.day;
    const dayRecord = props.dayRecords?.find(record => !record.deletedAt && record.date === group.date);
    const active = group.rows.filter(row => !row.excluded && !row.persisted);
    const problems = active.some(row => !row.energy || !!row.energy.error);
    const dayRows = group.rows.filter(row => row.action.kind !== "save_activity");
    return <section className={styles.group} key={group.date ?? "unknown"} aria-label={(group.date ?? "") + " 消耗确认"}>
      <header className={styles.groupHeading}><h2>{group.date ?? "消耗"}<span>消耗确认</span></h2>{active.length > 0 && <details className={styles.groupMenu}><summary aria-label={(group.date ?? "") + "消耗更多操作"}>更多</summary><button type="button" disabled={props.busy} onClick={async event => { const menu = event.currentTarget.closest("details"); if (menu) menu.open = false; if (await confirmAction({ title: "取消本组待保存内容？", message: (group.date ?? "本组") + "有" + active.length + "项待保存内容。\n取消后不会保存这些新增或修改，已有记录保留。", confirmLabel: "取消本组", danger: true })) props.exclude(active.map(row => row.key)); }}>取消本组待保存内容</button></details>}</header>
      <div className={styles.groupBody} data-has-exercises={group.rows.some(row => row.action.kind === "save_activity")}><div className={styles.dayColumn}>
      {selected.length ? <DayReading day={day} pending={problems} /> : <p className={styles.notice}>本组待保存内容已取消，已有记录保留。</p>}
      {dayRows.map(row => <article className={styles.dayRow} id={"record-" + row.key} key={row.key} data-review-key={row.key} data-excluded={row.excluded}>
        <div className={styles.dayRowHeading}><span className={styles.status}>{row.excluded ? "每日消耗已取消" : row.energy?.before ? "更新当天消耗" : "新增当天消耗"}</span><RowActions row={row} props={props} /></div>
        {!row.excluded && <>{row.energy?.warnings?.map(text => <p role="status" className={styles.notice} key={text}>{text}</p>)}{row.energy?.error && <p role="alert" className={styles.error}>{row.energy.error}</p>}<Changes row={row} /><Evidence row={row} /></>}
      </article>)}
      </div><div className={styles.exerciseColumn}>{group.rows.filter(row => row.action.kind === "save_activity").map(row => <Exercise row={row} key={row.key} day={dayRecord} props={props} />)}</div></div>
    </section>;
  })}</section>;
}
