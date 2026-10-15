import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { listMeasurements } from "@/features/measurements/records";
import { measurementDisplay } from "@/features/measurements/editing";
import { localMeasurementDate } from "@/features/measurements/entry-state";
import { systemMeasurementTimezone } from "@/features/measurements/timezone";
import { readMealSnapshot } from "@/features/meals/records";
import { OverviewView } from "@/features/dashboard/overview-view";
import { RouteLoading } from "@/components/page-loading";
import { DashboardHeader } from "./header";
export const metadata = { title: "Formward · 总览" };
export default async function DashboardPage() {
 const user = await currentPageUser(); if (!user) redirect("/");
 return <Suspense fallback={<RouteLoading/>}><Content user={user}/></Suspense>;
}
async function Content({ user }: { user: NonNullable<Awaited<ReturnType<typeof currentPageUser>>> }) {
 const db=getDatabase(), records=await listMeasurements(db,user.id), snapshot=await readMealSnapshot(db,user.id);
 const today=localMeasurementDate(new Date(),systemMeasurementTimezone(new Date(),process.env.FORMWARD_TIMEZONE));
 return <main className="dashboard-page"><DashboardHeader email={user.email}/><OverviewView records={records.map(measurementDisplay)} meals={snapshot.meals} today={today}/></main>;
}
