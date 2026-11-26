import {WorkspaceSnapshot} from "@/features/dashboard/workspace-cache";
import {workspaceQuery} from "@/features/dashboard/workspace-cache-state";
import { requireCompletedOnboarding } from "@/features/onboarding/server";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { readEnergySnapshot } from "@/features/activities/records";
import {loadEnergyConnection,loadEnergyDeviceCoverage} from "@/features/data-sources/state";
import { EnergyView } from "@/features/activities/energy-view";
import { energyPresentation } from "@/features/activities/presentation";
import { localMeasurementDate } from "@/features/measurements/entry-state";
import { systemMeasurementTimezone } from "@/features/measurements/timezone";
import { linkedDate } from "@/features/measurements/calendar";
import { saveEnergyAction, removeEnergySourceAction } from "./actions";
import { listEnergySources } from "@/features/activities/sources";
import { linkedTrend, type TrendRoute } from '@/components/metric-trend-model';
import {recordOpenIntent,type RecordIntent} from '@/components/record-intent';
export const metadata = { title: "Formward · 消耗" };
export const maxDuration = 60;
export default async function EnergyPage({ searchParams }: { searchParams: Promise<{ date?: string | string[];entry?:string;intent?:string|string[];view?:string;from?:string;to?:string;mode?:string }> }) {
  const user = await currentPageUser(); if (!user) redirect("/"); await requireCompletedOnboarding();
  const params=await searchParams,entry=params.entry==='1'&&(params.date===undefined||linkedDate(params.date)!==null),trend=params.entry?null:linkedTrend(params);return <Content cacheQuery={workspaceQuery(params)} user={user} date={linkedDate(params.date)} entry={entry} estimate={entry&&params.mode==="estimate"} trend={trend} intent={recordOpenIntent(params,entry,!!trend)}/>;
}
async function Content({cacheQuery, user, date, entry, estimate,trend,intent }: {cacheQuery:string; user: NonNullable<Awaited<ReturnType<typeof currentPageUser>>>; date: string | null;entry:boolean;estimate:boolean;trend:TrendRoute|null;intent:RecordIntent }) {
  const db = getDatabase();
  const [snapshot, sourceStatus, deviceCoverage, sources] = await Promise.all([readEnergySnapshot(db, user.id),
    loadEnergyConnection(db,user.id), loadEnergyDeviceCoverage(db,user.id), listEnergySources(db,user.id)]);
  const today = localMeasurementDate(new Date(), systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE));
  return <WorkspaceSnapshot path="/dashboard/energy" query={cacheQuery}><EnergyView sourceStatus={sourceStatus} deviceCoverage={deviceCoverage} key={`${date}:${intent}:${estimate}:${trend?.from}:${trend?.to}`} initialIntent={intent} presentation={energyPresentation(snapshot, [], today, sources,user.id)} save={saveEnergyAction} removeSource={removeEnergySourceAction} initialDate={date??(entry?today:null)} initialEntry={entry} initialEstimate={estimate} initialTrend={trend} /></WorkspaceSnapshot>;
}
