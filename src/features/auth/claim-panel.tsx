"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoadingLink } from "@/components/loading-link";
import { inspectClaimAction, submitClaimAction } from "@/app/account/claim/actions";
import { signOut } from "./client";
import { AccountFeedback, AccountFrame, accountDate, useAccountTask } from "./account-ui";
import styles from "./account.module.css";

export function ClaimPanel({ signedInEmail }: { signedInEmail: string | null }) {
  const token = useRef(""), [info, setInfo] = useState<{ email: string; purpose: "invite" | "reset_password"; expiresAt: string } | null>(null);
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [checking, setChecking] = useState(!signedInEmail), [complete, setComplete] = useState(false);
  const task = useAccountTask();
  useEffect(() => {
    let active = true;
    const inspect = () => {
      const raw = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      token.current = raw; setComplete(false); setInfo(null); setPassword(""); setConfirmation(""); task.setError("");
      if (signedInEmail) return;
      setChecking(true);
      void inspectClaimAction(raw).then(result => {
        if (!active || token.current !== raw) return;
        if (result.ok) setInfo(result.data); else task.setError(result.error);
        setChecking(false);
      }).catch(() => { if (active && token.current === raw) { task.setError("连接失败，请重新打开链接后重试。"); setChecking(false); } });
    };
    inspect(); window.addEventListener("hashchange", inspect);
    return () => { active = false; window.removeEventListener("hashchange", inspect); };
    // setError 是本组件持有的状态更新函数；相同页面打开另一条链接也必须重新校验。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInEmail]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) { task.setError("两次密码不一致。"); return; }
    const result = await task.run("正在保存账号密码…", () => submitClaimAction(token.current, password));
    if (result?.ok) { setComplete(true); setPassword(""); setConfirmation(""); token.current = ""; history.replaceState(null, "", window.location.pathname); }
  }
  return <AccountFrame title={complete ? "密码已设置" : info?.purpose === "reset_password" ? "重新设置密码" : "激活你的账号"} intro={complete ? "请使用设置好的密码登录 Formward。" : "由你设置密码，开始使用自己的健康记录空间。"}>
    <div className={styles.claim}>
      <AccountFeedback error={task.error} />
      {signedInEmail ? <><h2>请先退出当前账号</h2><p className={styles.targetEmail}>{signedInEmail}</p><p className={styles.muted}>为避免使用错误账号，请退出后继续打开此链接。</p><button type="button" className={styles.primary} disabled={task.busy} onClick={() => void task.run("正在退出账号…", async () => { await signOut(); window.location.reload(); return { ok: true, data: null }; })}>退出并继续</button></> : complete ? <LoadingLink className={styles.primaryLink} href="/">前往登录 →</LoadingLink> : checking ? <p role="status" className={styles.muted}>正在检查链接…</p> : info ? <><p className={styles.accountIdentity}>{info.email}</p><p className={styles.muted}>有效至 {accountDate(info.expiresAt)}（北京时间）</p>{info.purpose === "reset_password" && <p className={styles.notice}>保存后会退出全部登录设备，并断开原有 AI 授权。</p>}<form onSubmit={submit}><label className={styles.field}>设置密码<input name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required disabled={task.busy} /></label><label className={styles.field}>确认密码<input name="confirmation" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required disabled={task.busy} /></label><p className={styles.muted}>使用 12–128 个字符，支持从密码管理器粘贴。</p><button type="submit" className={styles.primary} disabled={task.busy}>{task.busy ? "正在保存…" : info.purpose === "invite" ? "激活账号" : "保存新密码"}</button></form></> : <p className={styles.muted}>请联系邀请人获取新的链接。</p>}
    </div>
  </AccountFrame>;
}
