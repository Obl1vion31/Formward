import { requireCompletedOnboarding } from "@/features/onboarding/server";
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
import { saveMealAction, permanentlyDeleteAction, saveMealDayAction } from "./actions";
import { linkedTrend, type TrendRoute } from "@/components/metric-trend-model";
export const metadata={title:"Formward · 饮食记录"};
export const maxDuration = 60;
export default async function MealsPage({searchParams}:{searchParams:Promise<{date?:string|string[];entry?:string;view?:string;from?:string;to?:string}>}) { const user=await currentPageUser(); if(!user) redirect("/"); await requireCompletedOnboarding(); const params=await searchParams;return <Suspense fallback={<RouteLoading/>}><Content user={user} date={linkedDate(params.date)} entry={params.entry==="1"} trend={params.entry?null:linkedTrend(params)}/></Suspense>; }
async function Content({user,date,entry,trend}:{user:NonNullable<Awaited<ReturnType<typeof currentPageUser>>>;date:string|null;entry:boolean;trend:TrendRoute|null}) {
  const db=getDatabase(), snapshot=await readMealSnapshot(db,user.id), operations=await listMealOperations(db,user.id);
  const today=localMeasurementDate(new Date(),systemMeasurementTimezone(new Date(),process.env.FORMWARD_TIMEZONE));
  return <main className="dashboard-page"><MealsView initialDate={date} initialEntry={entry} initialTrend={trend} snapshot={snapshot} today={today} operations={operations} save={saveMealAction} saveDay={saveMealDayAction} purge={permanentlyDeleteAction}/></main>;
}
