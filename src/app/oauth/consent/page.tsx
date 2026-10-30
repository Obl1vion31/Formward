import type { Metadata } from "next";
import { LoadingLink } from "@/components/loading-link";
import { BrandLogo } from "@/components/brand-logo";
import { redirect } from "next/navigation";
import { getDatabase } from "@/db/client";
import { currentPageUser, getAuth } from "@/features/auth/server";
import { oauthPageRequest, oauthSearchQuery } from "@/features/auth/oauth-pages";
import { OAuthForm } from "@/features/auth/oauth-form";

export const metadata: Metadata = { title: "授权连接 Formward", referrer: "no-referrer", robots: { index: false, follow: false } };
export default async function OAuthConsent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = oauthSearchQuery(await searchParams), info = await oauthPageRequest(getDatabase(), getAuth(), query), user = await currentPageUser();
  if (info && !user) redirect(`/oauth/login?${query}`);
  return <main className="oauth-page"><section className="oauth-card"><LoadingLink href="/" className="home-logo" aria-label="Formward 首页"><BrandLogo /></LoadingLink><h1>允许连接你的账号？</h1>{info && user ? <><p><strong>{info.name}</strong> 请求以下权限：</p><ul>{info.scopes.map(item => <li key={item.scope}>{item.label}</li>)}</ul><p>写入先生成预览，仍需你在登录网页明确确认。你可以在“AI 接入”随时撤销连接。</p><OAuthForm kind="consent" query={query} email={user.email} /></> : <p role="alert">授权链接无效或已过期，请返回 AI 客户端重新连接。</p>}</section></main>;
}
