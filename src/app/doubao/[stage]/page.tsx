import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { BrandLogo } from "@/components/brand-logo";
import { getDatabase } from "@/db/client";
import { currentPageUser, getAuth } from "@/features/auth/server";
import { OAuthForm } from "@/features/auth/oauth-form";
import { oauthPageRequest, oauthSearchQuery } from "@/features/auth/oauth-pages";
import { doubaoConfig } from "@/features/doubao/config";
import { openEnvelope } from "@/features/doubao/envelope";
import { callbackDoubao, requireDoubaoClient } from "@/features/doubao/oauth";
import { doubaoScopeLabels } from "@/features/doubao/navigation";
import { DoubaoCallback } from "@/features/doubao/callback";
import styles from "@/features/doubao/authorization.module.css";

export const metadata: Metadata = { title: "连接豆包 · Formward", referrer: "no-referrer", robots: { index: false, follow: false } };

async function authorizationData(stage: string, query: string) {
  const search = new URLSearchParams(query);
  try {
    const config = doubaoConfig(), db = getDatabase(), auth = getAuth();
    if (stage === "callback") {
      return { kind: "callback" as const, result: await callbackDoubao(db, auth, config, search), insideDoubao: (await headers()).get("user-agent")?.includes("DoubaoApps") ?? false };
    }
    const info = await oauthPageRequest(db, auth, query);
    const envelope = openEnvelope(config, "authorize", search.get("state") ?? "");
    if (!info || search.get("client_id") !== envelope.clientId) throw new Error();
    await requireDoubaoClient(db, config, envelope.clientId, envelope.openIdDigest);
    const user = await currentPageUser();
    if (stage === "consent" && !user) return { kind: "redirect" as const, url: config.origin + "/doubao/login?" + query };
    return {
      kind: stage === "login" ? "login" as const : "consent" as const,
      email: user?.email, scopes: info.scopes.map(item => item.scope),
      navigation: { origin: config.origin, canonical: auth.options.baseURL as string },
    };
  } catch {
    return { kind: "invalid" as const };
  }
}

export default async function DoubaoAuthorization({ params, searchParams }: {
  params: Promise<{ stage: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { stage } = await params;
  if (!["login", "consent", "callback"].includes(stage)) notFound();
  const query = oauthSearchQuery(await searchParams), data = await authorizationData(stage, query);
  if (data.kind === "redirect") redirect(data.url);
  const title = data.kind === "callback" ? data.result.refused ? "未授权连接" : "返回豆包"
    : data.kind === "login" ? "登录并连接 Formward" : data.kind === "consent" ? "允许豆包连接你的账号？" : "连接豆包";
  return <main className={`oauth-page ${styles.page}`}><section className="oauth-card">
    <div className={styles.brand}><BrandLogo /></div><h1>{title}</h1>
    {data.kind === "callback" ? <DoubaoCallback result={data.result} insideDoubao={data.insideDoubao} />
      : data.kind === "login" ? <>
        <p>使用你的 Formward 账号登录。下一步会列出豆包申请的权限，由你确认。</p>
        <OAuthForm kind="login" query={query} email={data.email} doubao={data.navigation} />
      </> : data.kind === "consent" ? <>
        <ul>{doubaoScopeLabels(data.scopes).map(label => <li key={label}>{label}</li>)}</ul>
        <p>查询结果将提供给豆包。提交仅生成预览，正式保存仍需你在 Formward 网页确认；可在“AI 接入”撤销连接。</p>
        <p>本次连接经境外 Vercel 中转，业务与主库位于上海。</p>
        <OAuthForm kind="consent" query={query} email={data.email} doubao={data.navigation} />
      </> : <p role="alert">连接请求无效、已过期或服务尚未就绪。请返回豆包重新发起连接。</p>}
    <p className={styles.agreements}><a href="/privacy.html" target="_blank" rel="noreferrer">隐私政策</a> · <a href="/terms.html" target="_blank" rel="noreferrer">服务条款</a></p>
  </section></main>;
}
