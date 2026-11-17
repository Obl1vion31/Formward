"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { changeAccountTierAction } from "@/app/admin/actions";
import { useDraftGuard } from "@/components/draft-guard";
import type { MembershipTier } from "../auth/entitlements";
import type { AdminConsoleData } from "./queries";
import styles from "./console.module.css";

type Person = AdminConsoleData["users"][number];
const options = [["free", "Free · 4次识图／日"], ["beta", "内测版 · ¥1／日"], ["plus", "Plus · ¥2／日"]] as const;

export function MembershipForm({ person, onDirty, onVerificationRequired, refresh }: { person: Person; onDirty: (dirty: boolean) => void; onVerificationRequired: () => void; refresh: () => Promise<void> }) {
  const [selection, setSelection] = useState<MembershipTier | null>(null), [saved, setSaved] = useState<{tier: MembershipTier; version: number} | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const baseline = saved && saved.version > person.entitlementVersion ? saved.tier : person.membershipTier;
  const tier = selection ?? baseline, version = Math.max(saved?.version ?? 0, person.entitlementVersion);
  const requestId = useRef<string | null>(null), dirty = tier !== baseline;
  useDraftGuard(dirty, busy);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !dirty || person.role === "owner") return;
    setBusy(true); setError(""); setNotice(""); requestId.current ??= crypto.randomUUID();
    try {
      const result = await changeAccountTierAction(person.id, tier, version, requestId.current);
      if (!result.ok) {
        setError(result.error);
        if (["verification_required", "invalid_session", "mfa_required"].includes(result.code)) onVerificationRequired();
        if (result.code === "version_conflict") { requestId.current = null; await refresh(); setError("设置已被更新，已读取最新版本。你的选择保留，请核对后保存。"); }
        return;
      }
      setSaved(result.data); setSelection(null); requestId.current = null;
      setNotice("档位已保存，后续AI请求按新档位执行。"); onDirty(false); await refresh();
    } catch { setError("保存结果暂未确认，请保留选择后重试。"); }
    finally { setBusy(false); }
  }
  const override = person.aiPaused || person.aiDailyBudgetCents !== null || person.aiDailyRecognitionLimit !== null;
  return <section className={styles.membership} data-membership-form><h2>会员档位</h2><form onSubmit={save}><label>选择档位<select aria-label="选择档位" value={person.role === "owner" ? "admin" : tier} disabled={busy || person.role === "owner"} onChange={event => { setSelection(event.target.value as MembershipTier); requestId.current = null; setNotice(""); }}>
    {person.role === "owner" ? <option value="admin">管理员</option> : <>{person.membershipTier === "pro" && <option value="pro" disabled>Pro（暂未开放）</option>}{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</>}
  </select></label><button disabled={busy || !dirty || person.role === "owner"}>{busy ? "正在保存…" : "保存档位"}</button></form>
    <p className={styles.tierHint}>{person.role === "owner" ? "管理员保留现有试用权限。" : tier === "free" ? "Free只开放每天4次识图，聊天关闭。" : "聊天和识图共用所选档位的每日金额。"} 所有人仍共用全站每天¥10。</p>
    <p className={styles.tierHint}>{override ? "此用户有个人限制，实际额度还受下方设置约束；切换档位会保留这些设置。" : "未设置个人限制，按档位默认额度执行。"}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}

export function MembershipPlaceholder() {
  return <><section className={styles.membership} data-membership-form><h2>会员档位</h2><form><label>选择档位<select aria-label="选择档位" disabled defaultValue=""><option value="">正在读取档位…</option>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button disabled>保存档位</button></form><p className={styles.tierHint}><span className={styles.placeholder} aria-label="正在读取档位规则"/></p><p className={styles.tierHint}><span className={styles.placeholder} aria-label="正在读取个人限制"/></p></section><details className={styles.personalPolicy}><summary>个人 AI 限制</summary></details></>;
}
