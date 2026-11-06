import { requireCompletedOnboarding } from "@/features/onboarding/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { readEnergySnapshot } from "@/features/activities/records";
import { EnergyView } from "@/features/activities/energy-view";
import { energyPresentation } from "@/features/activities/presentation";
import { localMeasurementDate } from "@/features/measurements/entry-state";
import { systemMeasurementTimezone } from "@/features/measurements/timezone";
import { linkedDate } from "@/features/measurements/calendar";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
import { saveEnergyAction, removeEnergySourceAction } from "./actions";
import { listEnergySources } from "@/features/activities/sources";
export const metadata = { title: "Formward · 消耗" };
export const maxDuration = 60;
export default async function EnergyPage({ searchParams }: { searchParams: Promise<{ date?: string | string[];entry?:string }> }) {
  const user = await currentPageUser(); if (!user) redirect("/"); await requireCompletedOnboarding();
  const params=await searchParams;return <Suspense fallback={<WorkspaceSkeleton kind="energy"/>}><Content user={user} date={linkedDate(params.date)} entry={params.entry==="1"} /></Suspense>;
}
async function Content({ user, date, entry }: { user: NonNullable<Awaited<ReturnType<typeof currentPageUser>>>; date: string | null;entry:boolean }) {
  const db = getDatabase(), snapshot = await readEnergySnapshot(db, user.id);
  const today = localMeasurementDate(new Date(), systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE));
  return <main className="dashboard-page"><EnergyView presentation={energyPresentation(snapshot, [], today, await listEnergySources(db, user.id))} save={saveEnergyAction} removeSource={removeEnergySourceAction} initialDate={date} initialEntry={entry} /></main>;
}
