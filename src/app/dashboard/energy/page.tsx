import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { readEnergySnapshot } from "@/features/activities/records";
import { EnergyView } from "@/features/activities/energy-view";
import { listMeasurements } from "@/features/measurements/records";
import { measurementDisplay } from "@/features/measurements/editing";
import { localMeasurementDate } from "@/features/measurements/entry-state";
import { systemMeasurementTimezone } from "@/features/measurements/timezone";
import { linkedDate } from "@/features/measurements/calendar";
import { RouteLoading } from "@/components/page-loading";
import { DashboardHeader } from "../header";
import { saveEnergyAction } from "./actions";
export const metadata = { title: "Formward · 消耗" };
export const maxDuration = 60;
export default async function EnergyPage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const user = await currentPageUser(); if (!user) redirect("/");
  return <Suspense fallback={<RouteLoading />}><Content user={user} date={linkedDate((await searchParams).date)} /></Suspense>;
}
async function Content({ user, date }: { user: NonNullable<Awaited<ReturnType<typeof currentPageUser>>>; date: string | null }) {
  const db = getDatabase(), snapshot = await readEnergySnapshot(db, user.id), records = await listMeasurements(db, user.id);
  const today = localMeasurementDate(new Date(), systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE));
  return <main className="dashboard-page"><DashboardHeader email={user.email} /><EnergyView snapshot={snapshot} records={records.map(measurementDisplay)} today={today} save={saveEnergyAction} initialDate={date} /></main>;
}
