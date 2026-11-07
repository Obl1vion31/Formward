import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { loadSources } from "@/features/data-sources/state";
import { DataSourcesPanel } from "@/features/data-sources/panel";
export const metadata = { title: "Formward · 设备与数据来源", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const maxDuration = 60;
export default async function SourcesPage() {
  const user = await currentPageUser(); if (!user) redirect("/");
  return <main className="dashboard-page"><DataSourcesPanel initial={await loadSources(getDatabase(), user.id)} embedded={false}/></main>;
}
