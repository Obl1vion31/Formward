import type { Metadata } from "next";
import { currentPageUser } from "@/features/auth/server";
import { ClaimPanel } from "@/features/auth/claim-panel";

export const metadata: Metadata = { title: "Formward · 设置账号密码", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ClaimPage() {
  const user = await currentPageUser();
  return <ClaimPanel signedInEmail={user?.email ?? null} />;
}
