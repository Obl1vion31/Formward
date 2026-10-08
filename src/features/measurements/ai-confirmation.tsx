"use client";
import { useRef, useState } from "react";
import type { operationDisplay } from "./ai-operations";
import { operationStatusLabels } from "./ai-instructions";
type Operation = ReturnType<typeof operationDisplay>;
const names = { new: "新增", edit: "修改", supplement: "补充", duplicate: "重复，跳过", conflict: "冲突", estimate: "估算" };
const fields = [{ key: "weightKg", label: "体重", unit: " kg" }, { key: "bodyFatPercent", label: "体脂率", unit: "%" }, { key: "deviceLabel", label: "来源", unit: "" }, { key: "fasting", label: "测量条件", unit: "" }];
function display(value: unknown, unit: string) { return value === true ? "空腹" : value === false ? "非空腹" : value === null || value === undefined ? "无" : `${value}${unit}`; }
export function AiConfirmation({ operation: initial, decide }: { operation: Operation; decide: (id: string, decision: "confirm" | "cancel") => Promise<{ ok: true; data: Operation } | { ok: false; error: string }> }) {
  const [updated, setUpdated] = useState<Operation | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const busyRef = useRef(false), operation = updated ?? initial, preview = operation.preview;
  async function submit(decision: "confirm" | "cancel") {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try { const result = await decide(operation.id, decision); if (result.ok) setUpdated(result.data); else setError(result.error); } catch { setError("操作未完成，请稍后重试。"); } finally { busyRef.current = false; setBusy(false); }
  }
  return <section className="ai-page" aria-labelledby="confirmation-title"><a href="/dashboard/ai" className="ai-back">← AI 接入</a><h1 id="confirmation-title">确认身体记录</h1><p className="ai-lead">{preview.date} · {operationStatusLabels[operation.status]}</p><p>{operation.result?.message ?? preview.message}</p>
    {preview.rows.map((row, index) => <section key={index} className="ai-section"><h2>{row.period === "daytime" ? "晨间" : "晚间"} · {names[row.state]}</h2><p>{row.message}</p><table className="ai-comparison"><thead><tr><th>字段</th><th>当前值</th><th>提交值</th></tr></thead><tbody>{fields.map(field => <tr key={field.key}><th>{field.label}</th><td>{display(row.before?.[field.key], field.unit)}</td><td>{row.after && !Object.hasOwn(row.after, field.key) ? "未提交" : display(row.after?.[field.key], field.unit)}</td></tr>)}</tbody></table>
      {!!row.before?.candidates && <p>同一时段存在多个实测候选，请让 AI 查询并明确要修改的记录。</p>}
      {!!row.replacedEstimates?.length && <p>此次实测会替代该时段已有的对应指标估计；其他估计保持。</p>}
    </section>)}
    {preview.explanation && <section className="ai-section"><h2>估算依据</h2><p>{preview.explanation.method}</p>{preview.explanation.basis.map((line, index) => <p key={index}>{line}</p>)}{preview.explanation.formula && <p>{preview.explanation.formula}</p>}{preview.explanation.sampleSummary.map((line, index) => <p key={index}>{line}</p>)}{preview.explanation.fallbackNote && <p>{preview.explanation.fallbackNote}</p>}<details><summary>查看实测参考</summary>{preview.explanation.references.map((line, index) => <p key={index}>{line}</p>)}</details><p>估计不代表实测，不参与实测摘要；结果存在不确定性。</p></section>}
    {error && <p role="alert" className="ai-error">{error}</p>}
    {operation.status === "pending" && <div className="ai-actions"><button className="ai-button" disabled={busy || !preview.canConfirm} onClick={() => void submit("confirm")}>{busy ? "处理中…" : "确认保存"}</button><button className="ai-button ai-secondary" disabled={busy} onClick={() => void submit("cancel")}>取消操作</button></div>}
    <p className="ai-muted">预览到期时间：{operation.expiresAt.slice(0, 16).replace("T", " ")} UTC。数据变化或令牌撤销后需要重新提交。</p><a href="/dashboard">回到身体记录</a>
  </section>;
}
