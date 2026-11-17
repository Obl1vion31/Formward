"use client";
import { useEffect, useState, type FormEvent } from "react";
import {LoadingLink as Link} from "@/components/loading-link";
import {useDraftGuard,pageRefreshApproved} from "@/components/draft-guard";
import Image from "next/image";
import QRCode from "qrcode";
import { loadSecurityAction, verifySecurityAction } from "@/app/account/security/actions";
import styles from "./mfa.module.css";

function safeReturn(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/dashboard";
  const url = new URL(value, "https://fixed.test");
  return url.origin === "https://fixed.test" && ["/dashboard", "/admin", "/onboarding", "/oauth/login", "/oauth/consent", "/doubao/"].some(path => url.pathname === path || url.pathname.startsWith(path.endsWith("/") ? path : path + "/")) ? url.pathname + url.search : "/dashboard";
}
export function MfaPanel({ challenge = false, returnTo, embedded = false }: { challenge?: boolean; returnTo?: string; embedded?: boolean }) {
  const [data, setData] = useState<Extract<Awaited<ReturnType<typeof loadSecurityAction>>, { ok: true }>["data"] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [password, setPassword] = useState(""), [code, setCode] = useState(""), [recovery, setRecovery] = useState(false);
  const [totp, setTotp] = useState(""), [qr, setQr] = useState(""), [codes, setCodes] = useState<string[]>([]), [saved, setSaved] = useState(false), [binding, setBinding] = useState(false);
  const [pending, setPending] = useState(challenge), [loading, setLoading] = useState(!challenge);
  const [changing,setChanging]=useState(false);
  useDraftGuard(!!password||!!code||binding||codes.length>0&&!saved,busy);
  useEffect(()=>{if(!binding&&(!codes.length||saved))return;const warn=(e:BeforeUnloadEvent)=>{if(!pageRefreshApproved()){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[binding,codes.length,saved]);
  async function reload() { const result = await loadSecurityAction(); if (result.ok) setData(result.data); else setError(result.error); setLoading(false); return result; }
  useEffect(() => { if (!challenge) { let live = true; void loadSecurityAction().then(r => { if (live) { if (r.ok) setData(r.data); else setError(r.error); setLoading(false); } }); return () => { live = false; }; } }, [challenge]);
  useEffect(() => { let live = true; if (totp) void QRCode.toDataURL(totp, { width: 224, margin: 2 }).then(value => { if (live) setQr(value); }).catch(() => { if (live) setError("二维码未能显示，可复制手动密钥绑定。"); }); return () => { live = false; }; }, [totp]);
  async function authCall(path: string, body: object) {
    const response = await fetch("/api/auth/two-factor/" + path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(response.status === 429 ? "验证次数较多，请一分钟后重试。" : result?.message || "验证未完成，请重试。");
    return result;
  }
  async function perform(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(""); setNotice(""); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "操作未完成，请重试。"); } finally { setBusy(false); } }
  async function verifyLogin(e: FormEvent) { e.preventDefault(); await perform(async () => {
    await authCall(recovery ? "verify-backup-code" : "verify-totp", { code, trustDevice: false }); setCode("");
    if (recovery) { setPending(false); await reload(); } else window.location.assign(safeReturn(returnTo));
  }); }
  async function enable(e: FormEvent) { e.preventDefault(); await perform(async () => {
    if (data?.enabled && !data.recovery) { const verified = await verifySecurityAction(password, code); if (!verified.ok) throw new Error(verified.error); }
    const result = await authCall("enable", { password, issuer: "Formward" }); setTotp(result.totpURI); setCodes(result.backupCodes ?? []); setPassword(""); setCode(""); setBinding(true); setSaved(false);
  }); }
  async function confirm(e: FormEvent) { e.preventDefault(); await perform(async () => {
    await authCall("verify-totp", { code, trustDevice: false }); setCode(""); setTotp(""); setQr(""); setBinding(false); setChanging(false); await reload(); setNotice("双重验证已启用，其他网页会话已退出。请妥善保存恢复码。");
  }); }
  return <section className={`${styles.panel} ${embedded ? styles.embedded : ""}`} aria-busy={busy || loading}>
    {!embedded && <Link className={styles.brand} href="/">formward<span>.</span></Link>}
    <h1>{pending ? "验证身份" : "双重验证"}</h1>
    <p className={styles.muted}>{pending ? "输入验证器当前的6位动态码，完成这次登录。" : data?.email || "管理验证器和恢复方式。"}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading && <p role="status">正在读取安全状态…</p>}
    {pending ? <form onSubmit={verifyLogin}><label>{recovery ? "一次性恢复码" : "动态码"}<input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" inputMode={recovery ? "text" : "numeric"} maxLength={recovery ? 64 : 6} required disabled={busy} /></label><button disabled={busy || !code.trim()}>{busy ? "正在验证…" : "验证并继续"}</button><button className={styles.secondary} type="button" onClick={() => { setRecovery(!recovery); setCode(""); }} disabled={busy}>{recovery ? "使用验证器" : "无法使用验证器？使用恢复码"}</button></form>
      : data && <>
        {!binding && <p className={styles.status}>{data.enrollmentPaused ? "管理员动态码已暂时关闭，可使用账号密码继续。敏感操作仍需再次验证密码。" : data.recovery ? "请重新绑定验证器后继续。" : data.enabled ? "已启用验证器动态码" : data.required ? "管理员账号需要先绑定验证器。" : "可为账号增加验证器动态码保护。"}</p>}
        {!binding && (!data.enabled&&data.required||data.recovery||changing) && <form onSubmit={enable}><h2>{data.enabled ? "更换验证器" : "绑定验证器"}</h2><label>当前密码<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} maxLength={128} required disabled={busy} /></label>{data.enabled && !data.recovery && <label>当前验证器动态码<input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={6} required disabled={busy}/></label>}<button disabled={busy}>{busy ? "正在准备…" : "生成绑定二维码"}</button>{changing&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>{setChanging(false);setPassword("");setCode("");}}>取消更换</button>}</form>}
        {binding && <form onSubmit={confirm}><h2>扫描二维码并验证</h2><p className={styles.muted}>使用验证器扫描，只在你的设备上保存。验证成功后生效。</p>{qr && <Image unoptimized className={styles.qr} src={qr} width={224} height={224} alt="本人验证器绑定二维码" />}<details><summary>手动绑定密钥</summary><code className={styles.secret}>{totp ? new URL(totp).searchParams.get("secret") : ""}</code></details><label>新验证器动态码<input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={6} required disabled={busy} /></label><button disabled={busy || code.length !== 6}>验证并启用</button></form>}
        {codes.length > 0 && <div className={styles.recovery}><h2>保存一次性恢复码</h2><p>每个码只能使用一次，原文只在这次生成时显示。离开后无法再次查看。</p><div className={styles.codes}>{codes.map(value => <code key={value}>{value}</code>)}</div><label className={styles.check}><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />我已保存恢复码</label></div>}
        {!data.recovery && !binding && !changing && (!data.required||data.enabled) && (!codes.length || saved) && <>
          <form onSubmit={e => { e.preventDefault(); void perform(async () => { const r = await verifySecurityAction(password, code); if (!r.ok) throw new Error(r.error); setPassword(""); setCode(""); setNotice("身份已再次验证，5分钟内可进行敏感操作。"); }); }}><h2>再次验证身份</h2><p className={styles.muted}>用于创建令牌、修改权限等操作，有效5分钟。</p><label>当前密码<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required disabled={busy}/></label>{data.enabled&&<label>动态码<input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required disabled={busy}/></label>}<button disabled={busy}>验证身份</button></form>
          {data.enabled&&!data.required && <button className={styles.secondary} disabled={busy} onClick={() => void perform(async () => { const r = await verifySecurityAction(password, code); if (!r.ok) throw new Error(r.error); await authCall("disable", { password }); setPassword(""); setCode(""); await reload(); setNotice("已关闭双重验证，其他网页会话已退出。"); })}>关闭双重验证（需当前密码和动态码）</button>}
          {!data.enrollmentPaused && <button className={styles.secondary} type="button" disabled={busy} onClick={()=>{setChanging(true);setPassword("");setCode("");}}>{data.enabled?"更换验证器":"启用双重验证"}</button>}
        </>}
        {!embedded && (!data.required||data.enabled) && !data.recovery && !binding && (!codes.length || saved) && <Link className={styles.continue} href={safeReturn(returnTo)}>继续使用 Formward →</Link>}
      </>}
    {!embedded && !pending && !data && !loading && <Link href="/">返回登录</Link>}
  </section>;
}
