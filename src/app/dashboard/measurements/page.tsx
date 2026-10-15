import { linkedDate } from "@/features/measurements/calendar";
import type { Metadata } from "next";
import { Suspense } from "react";
import { RouteLoading } from "@/components/page-loading";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { listMeasurements } from "@/features/measurements/records";
import { MeasurementsView } from "@/features/measurements/measurements-view";
import { DashboardHeader } from "../header";
import { listMeasurementDates, measurementDisplay } from "@/features/measurements/editing";
import { estimateCellAction, removeSourceAction, saveDayAction } from "../actions";
import { listMeasurementSources } from "@/features/measurements/sources";

export const metadata: Metadata = { title: "Formward · 身体记录" };

export default async function DashboardPage({searchParams}:{searchParams:Promise<{date?:string|string[]}>}) {
  const user = await currentPageUser();
  if (!user) redirect("/");
  return <Suspense fallback={<RouteLoading />}><DashboardContent user={user} date={linkedDate((await searchParams).date)} /></Suspense>;
}

async function DashboardContent({ user, date }: { user: NonNullable<Awaited<ReturnType<typeof currentPageUser>>>; date:string|null }) {
  const db = getDatabase();
  // 本地 PGlite 使用单连接多路复用，按顺序读取以保持结果与查询对应。
  const records = await listMeasurements(db, user.id);
  const dates = await listMeasurementDates(db, user.id);
  const sources = await listMeasurementSources(db, user.id);

  return (
    <main className="dashboard-page">
      <DashboardHeader email={user.email} />
      <MeasurementsView initialDate={date} records={records.map(measurementDisplay)} dates={dates} sources={sources} accountCreatedAt={user.createdAt.toISOString()} actions={{ save: saveDayAction, estimate: estimateCellAction, removeSource: removeSourceAction }} />
    </main>
  );
}
