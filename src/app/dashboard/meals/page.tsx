import { linkedDate } from "@/features/measurements/calendar";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { readMealSnapshot, listMealOperations } from "@/features/meals/records";
import { MealsView } from "@/features/meals/meals-view";
import { localMeasurementDate } from "@/features/measurements/entry-state";
import { systemMeasurementTimezone } from "@/features/measurements/timezone";
import { RouteLoading } from "@/components/page-loading";
import { DashboardHeader } from "../header";
import { saveMealAction, permanentlyDeleteAction, saveMealDayAction } from "./actions";
export const metadata={title:"Formward · 饮食记录"};
export const maxDuration = 60;
export default async function MealsPage({searchParams}:{searchParams:Promise<{date?:string|string[]}>}) { const user=await currentPageUser(); if(!user) redirect("/"); return <Suspense fallback={<RouteLoading/>}><Content user={user} date={linkedDate((await searchParams).date)}/></Suspense>; }
async function Content({user,date}:{user:NonNullable<Awaited<ReturnType<typeof currentPageUser>>>;date:string|null}) {
  const db=getDatabase(), snapshot=await readMealSnapshot(db,user.id), operations=await listMealOperations(db,user.id);
  const today=localMeasurementDate(new Date(),systemMeasurementTimezone(new Date(),process.env.FORMWARD_TIMEZONE));
  return <main className="dashboard-page"><DashboardHeader email={user.email}/><MealsView initialDate={date} snapshot={snapshot} today={today} operations={operations} save={saveMealAction} saveDay={saveMealDayAction} purge={permanentlyDeleteAction}/></main>;
}
