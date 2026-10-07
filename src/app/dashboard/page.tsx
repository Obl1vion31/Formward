import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { listMeasurements } from "@/features/measurements/records";
import { MeasurementsView } from "@/features/measurements/measurements-view";
import { LogoutButton } from "./logout-button";
import { listMeasurementDates, measurementDisplay } from "@/features/measurements/editing";
import { estimateCellAction, saveDayAction } from "./actions";

export const metadata: Metadata = { title: "Formward · 身体记录" };

export default async function DashboardPage() {
  const user = await currentUser(await headers());
  if (!user) redirect("/");
  const db = getDatabase();
  // 本地 PGlite 使用单连接多路复用，按顺序读取以保持结果与查询对应。
  const records = await listMeasurements(db, user.id);
  const dates = await listMeasurementDates(db, user.id);

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <a className="dashboard-logo" href="/dashboard" aria-label="Formward 主页">formward<span>.</span></a>
        <div className="dashboard-account"><span>{user.email}</span><LogoutButton /></div>
      </header>
      <MeasurementsView records={records.map(measurementDisplay)} dates={dates} accountCreatedAt={user.createdAt.toISOString()} actions={{ save: saveDayAction, estimate: estimateCellAction }} />
    </main>
  );
}
