import { requireCompletedOnboarding } from "@/features/onboarding/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { listMeasurements } from "@/features/measurements/records";
import { measurementDisplay } from "@/features/measurements/editing";
import { localMeasurementDate } from "@/features/measurements/entry-state";
import { systemMeasurementTimezone } from "@/features/measurements/timezone";
import { readMealSnapshot } from "@/features/meals/records";
import { readEnergySnapshot } from "@/features/activities/records";
import {assistantContext} from "@/features/assistant/model";
import {reminderCatalog} from "@/features/dashboard/daily-reminders";
import { overviewPresentation } from "@/features/dashboard/presentation";
import { OverviewView } from "@/features/dashboard/overview-view";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
export const metadata = { title: "Formward · 总览" };
export default async function DashboardPage() {
 const user = await currentPageUser(); if (!user) redirect("/"); await requireCompletedOnboarding();
 return <Suspense fallback={<WorkspaceSkeleton kind="overview"/>}><Content user={user}/></Suspense>;
}
async function Content({ user }: { user: NonNullable<Awaited<ReturnType<typeof currentPageUser>>> }) {
 const db=getDatabase(), records=await listMeasurements(db,user.id), snapshot=await readMealSnapshot(db,user.id),energy=await readEnergySnapshot(db,user.id);
 const today=localMeasurementDate(new Date(),systemMeasurementTimezone(new Date(),process.env.FORMWARD_TIMEZONE));
 return <main className="dashboard-page"><OverviewView accountId={user.id} assistant={assistantContext(reminderCatalog(snapshot.meals,records.map(measurementDisplay),energy),new Date(),systemMeasurementTimezone(new Date(),process.env.FORMWARD_TIMEZONE),user.createdAt.toISOString())} presentation={overviewPresentation(snapshot.meals, records.map(measurementDisplay), energy, today)}/></main>;
}
