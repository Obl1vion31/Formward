import type { Metadata } from "next";
import { LoadingLink } from "@/components/loading-link";
import { BrandLogo } from "@/components/brand-logo";
import { getDatabase } from "@/db/client";
import { currentPageUser, getAuth } from "@/features/auth/server";
import { oauthPageRequest, oauthSearchQuery } from "@/features/auth/oauth-pages";
import { OAuthForm } from "@/features/auth/oauth-form";

export const metadata: Metadata = { title: "登录并连接 Formward", referrer: "no-referrer", robots: { index: false, follow: false } };
export default async function OAuthLogin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = oauthSearchQuery(await searchParams), info = await oauthPageRequest(getDatabase(), getAuth(), query), user = await currentPageUser();
  return <main className="oauth-page"><section className="oauth-card"><LoadingLink href="/" className="home-logo" aria-label="Formward 首页"><BrandLogo /></LoadingLink><h1>登录并连接账号</h1>{info ? <><p>{info.name} 请求连接你的 Formward 账号。登录后可查看并确认授权权限。</p><OAuthForm kind="login" query={query} email={user?.email} /></> : <p role="alert">授权链接无效或已过期，请返回 AI 客户端重新连接。</p>}</section></main>;
}
