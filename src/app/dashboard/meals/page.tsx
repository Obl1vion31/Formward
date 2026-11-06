import { requireCompletedOnboarding } from "@/features/onboarding/server";
import { linkedDate } from "@/features/measurements/calendar";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { readMealSnapshot, listMealOperations } from "@/features/meals/records";
import { MealsView } from "@/features/meals/meals-view";
import { localMeasurementDate } from "@/features/measurements/entry-state";
import { systemMeasurementTimezone } from "@/features/measurements/timezone";
import { saveMealAction, permanentlyDeleteAction, saveMealDayAction } from "./actions";
import { linkedTrend, type TrendRoute } from "@/components/metric-trend-model";
import {recordOpenIntent,type RecordIntent} from '@/components/record-intent';
export const metadata={title:"Formward · 饮食记录"};
export const maxDuration = 60;
export default async function MealsPage({searchParams}:{searchParams:Promise<{date?:string|string[];entry?:string;intent?:string|string[];view?:string;from?:string;to?:string}>}) { const user=await currentPageUser(); if(!user) redirect("/"); await requireCompletedOnboarding(); const params=await searchParams,entry=params.entry==='1',trend=params.entry?null:linkedTrend(params);return <Content user={user} date={linkedDate(params.date)} entry={entry} trend={trend} intent={recordOpenIntent(params,entry,!!trend)}/>; }
async function Content({user,date,entry,trend,intent}:{user:NonNullable<Awaited<ReturnType<typeof currentPageUser>>>;date:string|null;entry:boolean;trend:TrendRoute|null;intent:RecordIntent}) {
  const db=getDatabase(), snapshot=await readMealSnapshot(db,user.id), operations=await listMealOperations(db,user.id);
  const today=localMeasurementDate(new Date(),systemMeasurementTimezone(new Date(),process.env.FORMWARD_TIMEZONE));
  return <><MealsView key={`${date}:${intent}:${trend?.from}:${trend?.to}`} initialIntent={intent} initialDate={date} initialEntry={entry} initialTrend={trend} snapshot={snapshot} today={today} operations={operations} save={saveMealAction} saveDay={saveMealDayAction} purge={permanentlyDeleteAction}/></>;
}
