import type { Metadata } from "next";
import { currentPageUser } from "@/features/auth/server";
import { ClaimPanel } from "@/features/auth/claim-panel";
import { loginPageUrl } from "@/features/auth/login-return";

export const metadata: Metadata = { title: "Formward · 设置账号密码", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const [user, { next }] = await Promise.all([currentPageUser(), searchParams]);
  const loginHref = loginPageUrl(typeof next === "string" ? next : undefined);
  return <ClaimPanel signedInEmail={user?.email ?? null} loginHref={loginHref} />;
}
