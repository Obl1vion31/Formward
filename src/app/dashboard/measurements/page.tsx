import { requireCompletedOnboarding } from "@/features/onboarding/server";
import {headers} from "next/headers";
import {currentSessionIdentity} from "@/features/auth/server";
import {loadAccountPreferences} from "@/features/auth/preferences";
import { linkedDate } from "@/features/measurements/calendar";
import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { listMeasurements } from "@/features/measurements/records";
import { MeasurementsView } from "@/features/measurements/measurements-view";
import { listMeasurementDates, measurementDisplay } from "@/features/measurements/editing";
import { deleteCellAction, estimateCellAction, removeSourceAction, saveDayAction } from "../actions";
import { listMeasurementSources } from "@/features/measurements/sources";
import { linkedTrend, type TrendRoute } from "@/components/metric-trend-model";

export const metadata: Metadata = { title: "Formward · 身体记录" };

export default async function DashboardPage({searchParams}:{searchParams:Promise<{date?:string|string[];entry?:string;view?:string;from?:string;to?:string}>}) {
  const user = await currentPageUser();
  if (!user) redirect("/"); await requireCompletedOnboarding();
  const params=await searchParams;return <Suspense fallback={<WorkspaceSkeleton kind="body"/>}><DashboardContent user={user} date={linkedDate(params.date)} period={params.entry==="daytime"||params.entry==="evening"?params.entry:null} trend={params.entry?null:linkedTrend(params)} /></Suspense>;
}

async function DashboardContent({ user, date, period, trend }: { user: NonNullable<Awaited<ReturnType<typeof currentPageUser>>>; date:string|null;period:"daytime"|"evening"|null;trend:TrendRoute|null }) {
  const db = getDatabase();
  // 本地 PGlite 使用单连接多路复用，按顺序读取以保持结果与查询对应。
  const records = await listMeasurements(db, user.id);
  const dates = await listMeasurementDates(db, user.id);
  const sources = await listMeasurementSources(db, user.id);
  const {proof}=await currentSessionIdentity(await headers()),preferences=await loadAccountPreferences(db,proof);

  return (
    <main className="dashboard-page">

      <MeasurementsView preferences={preferences} initialDate={date} initialPeriod={period} initialTrend={trend} records={records.map(measurementDisplay)} dates={dates} sources={sources} accountCreatedAt={user.createdAt.toISOString()} actions={{ deleteCell:deleteCellAction, save: saveDayAction, estimate: estimateCellAction, removeSource: removeSourceAction }} />
    </main>
  );
}
