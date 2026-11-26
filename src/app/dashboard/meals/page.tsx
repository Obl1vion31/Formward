import {WorkspaceSnapshot} from "@/features/dashboard/workspace-cache";
import {workspaceQuery} from "@/features/dashboard/workspace-cache-state";
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
import {getMealTask} from "@/features/assistant/meal-task";
import {z} from "zod";
export const metadata={title:"Formward · 饮食记录"};
export const maxDuration = 60;
export default async function MealsPage({searchParams}:{searchParams:Promise<{date?:string|string[];entry?:string;section?:string;intent?:string|string[];view?:string;from?:string;to?:string;manualTask?:string}>}) { const user=await currentPageUser(); if(!user) redirect("/"); await requireCompletedOnboarding(); const params=await searchParams,entry=params.entry==='1'&&(params.date===undefined||linkedDate(params.date)!==null),trend=params.entry?null:linkedTrend(params);return <Content cacheQuery={workspaceQuery({...params,section:undefined})} user={user} date={linkedDate(params.date)} entry={entry} manualTask={entry?params.manualTask:undefined} trend={trend} intent={recordOpenIntent(params,entry,!!trend)}/>; }
async function Content({cacheQuery,user,date,entry,manualTask,trend,intent}:{cacheQuery:string;user:NonNullable<Awaited<ReturnType<typeof currentPageUser>>>;date:string|null;entry:boolean;manualTask?:string;trend:TrendRoute|null;intent:RecordIntent}) {
  const db=getDatabase(), snapshot=await readMealSnapshot(db,user.id), operations=await listMealOperations(db,user.id);
  const today=localMeasurementDate(new Date(),systemMeasurementTimezone(new Date(),process.env.FORMWARD_TIMEZONE));
  const task=manualTask&&z.string().uuid().safeParse(manualTask).success?await getMealTask(db,user.id,manualTask).catch(()=>null):null;
  const manualDraft=task?.context.photoHandoff&&task.context.cancelled?task.context.originalDraft??task.context.draft:null;
  if(manualTask&&(!manualDraft||manualDraft.date!==date))redirect(date?"/dashboard/meals?date="+date:"/dashboard/meals");
  const content=<MealsView accountId={user.id} key={`${date}:${intent}:${manualTask}:${trend?.from}:${trend?.to}`} initialIntent={intent} initialDate={date??(entry?today:null)} initialEntry={entry} manual={task&&manualDraft?{id:task.id,draft:manualDraft}:undefined} initialTrend={trend} snapshot={snapshot} today={today} operations={operations} save={saveMealAction} saveDay={saveMealDayAction} purge={permanentlyDeleteAction}/>;
  return manualTask?content:<WorkspaceSnapshot path="/dashboard/meals" query={cacheQuery}>{content}</WorkspaceSnapshot>;
}
