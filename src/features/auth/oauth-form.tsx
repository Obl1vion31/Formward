"use client";
import { useRef, useState, type FormEvent } from "react";
import { usePageLoading } from "@/components/page-loading-state";
import { signIn } from "./client";

export function OAuthForm({ kind, query, email }: { kind: "login" | "consent"; query: string; email?: string }) {
  const [working, setWorking] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  usePageLoading({ active: working, label: kind === "login" ? "正在登录并继续授权…" : "正在处理账号授权…" });
  async function perform(accept: boolean, event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (lock.current) return;
    lock.current = true; setWorking(true); setError("");
    try {
      if (kind === "login" && !email) {
        const data = new FormData(event!.currentTarget);
        const result = await signIn(String(data.get("email")), String(data.get("password")), new AbortController().signal, query);
        if (!result.success) throw new Error(result.message);
        if (result.redirectUrl) { window.location.assign(result.redirectUrl); return; }
      }
      const response = await fetch(`/api/auth/oauth2/${kind === "consent" ? "consent" : "continue"}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oauth_query: query, ...(kind === "consent" ? { accept } : { selected: true }) }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error("授权请求已失效，请返回 AI 客户端重新连接。");
      window.location.assign(result.url);
    } catch (failure) {
      setError(failure instanceof Error && failure.name === "Error" ? failure.message : "连接失败，请稍后重试。");
      lock.current = false; setWorking(false);
    }
  }
  return <form className="oauth-form" aria-busy={working} onSubmit={event => void perform(true, event)}>
    {kind === "login" && !email && <><label>邮箱<input name="email" type="email" autoComplete="username" required disabled={working} /></label><label>密码<input name="password" type="password" autoComplete="current-password" required disabled={working} /></label></>}
    {email && <p className="oauth-account">当前账号：{email}</p>}
    {kind === "login" && !email && <p className="oauth-account">忘记密码？请联系邀请人获取一次性重设链接。</p>}
    {error && <p role="alert" className="oauth-error">{error}</p>}
    <div className="oauth-actions"><button className="ai-button" type="submit" disabled={working}>{working ? "正在处理…" : kind === "consent" ? "允许连接" : email ? "继续授权" : "登录并继续"}</button>{kind === "consent" && <button className="ai-button ai-secondary" type="button" disabled={working} onClick={() => void perform(false)}>拒绝</button>}</div>
  </form>;
}
