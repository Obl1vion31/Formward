"use client";
import { useRef, useState, type ReactNode } from "react";
import { LoadingLink } from "@/components/loading-link";
import { Inspector } from "@/components/inspector";
import { usePageLoading } from "@/components/page-loading-state";
import type { AccountResult } from "./account-management";
import styles from "./account.module.css";
import { BrandLogo } from "@/components/brand-logo";

export function useAccountTask() {
  const lock = useRef(false), [busy, setBusy] = useState(false), [label, setLabel] = useState(""), [error, setError] = useState("");
  usePageLoading({ active: busy, label });
  async function run<T>(message: string, work: () => Promise<AccountResult<T>>) {
    if (lock.current) return null;
    lock.current = true; setBusy(true); setLabel(message); setError("");
    try {
      const result = await work();
      if (!result.ok) setError(result.error);
      return result;
    } catch {
      setError("连接失败，请检查网络后重试。");
      return null;
    } finally { lock.current = false; setBusy(false); }
  }
  return { busy, error, setError, run };
}

export function AccountFrame({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <main className={styles.page}><header className={styles.topbar}><LoadingLink className={styles.logo} href="/dashboard" aria-label="Formward 主页"><BrandLogo /></LoadingLink><LoadingLink href="/dashboard">← 返回总览</LoadingLink></header><div className={styles.heading}><span className={styles.eyebrow}>FORMWARD ACCOUNT</span><h1>{title}</h1><p>{intro}</p></div>{children}</main>;
}
export function AccountFeedback({ error, message }: { error?: string; message?: string }) {
  return <>{error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.notice} role="status">{message}</p>}</>;
}
export function accountDate(value: Date | string | null) {
  return value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "暂无记录";
}
export function SecretAccountLink({ url, expiresAt, close }: { url: string; expiresAt: string; close: () => void }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState("");
  return <Inspector title="链接已生成" close={close} className={styles.dialog} header={<div className={styles.dialogHeader}><h2>链接已生成</h2><button type="button" onClick={close} aria-label="关闭链接">×</button></div>}>
    <p className={styles.muted}>请复制并通过原联系渠道交给本人。关闭后无法再次查看，可重新生成。</p>
    <label className={styles.field}>一次性链接<textarea autoFocus readOnly value={url} rows={4} onFocus={event => event.currentTarget.select()} /></label>
    <p className={styles.muted}>有效至 {accountDate(expiresAt)}（北京时间）</p>
    <AccountFeedback error={error} message={copied ? "链接已复制。" : ""} />
    <div className={styles.buttons}><button type="button" className={styles.primary} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError("自动复制失败，请选中上方链接后复制。"); } }}>{copied ? "已复制" : "复制链接"}</button><button type="button" onClick={close}>关闭</button></div>
  </Inspector>;
}
