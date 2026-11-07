import { requireCompletedOnboarding } from "@/features/onboarding/server";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { readEnergySnapshot } from "@/features/activities/records";
import {loadEnergyConnection} from "@/features/data-sources/state";
import { EnergyView } from "@/features/activities/energy-view";
import { energyPresentation } from "@/features/activities/presentation";
import { localMeasurementDate } from "@/features/measurements/entry-state";
import { systemMeasurementTimezone } from "@/features/measurements/timezone";
import { linkedDate } from "@/features/measurements/calendar";
import { saveEnergyAction, removeEnergySourceAction } from "./actions";
import { TrainingTabs } from "@/features/training/navigation";
import { listEnergySources } from "@/features/activities/sources";
import { linkedTrend, type TrendRoute } from '@/components/metric-trend-model';
import {recordOpenIntent,type RecordIntent} from '@/components/record-intent';
export const metadata = { title: "Formward · 消耗" };
export const maxDuration = 60;
export default async function EnergyPage({ searchParams }: { searchParams: Promise<{ date?: string | string[];entry?:string;intent?:string|string[];view?:string;from?:string;to?:string }> }) {
  const user = await currentPageUser(); if (!user) redirect("/"); await requireCompletedOnboarding();
  const params=await searchParams,entry=params.entry==='1',trend=params.entry?null:linkedTrend(params);return <Content user={user} date={linkedDate(params.date)} entry={entry} trend={trend} intent={recordOpenIntent(params,entry,!!trend)}/>;
}
async function Content({ user, date, entry,trend,intent }: { user: NonNullable<Awaited<ReturnType<typeof currentPageUser>>>; date: string | null;entry:boolean;trend:TrendRoute|null;intent:RecordIntent }) {
  const db = getDatabase(), snapshot = await readEnergySnapshot(db, user.id);
  const today = localMeasurementDate(new Date(), systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE));
  const sourceStatus=await loadEnergyConnection(db,user.id);
  return <><TrainingTabs active="energy" /><EnergyView sourceStatus={sourceStatus} key={`${date}:${intent}:${trend?.from}:${trend?.to}`} initialIntent={intent} presentation={energyPresentation(snapshot, [], today, await listEnergySources(db, user.id),user.id)} save={saveEnergyAction} removeSource={removeEnergySourceAction} initialDate={date} initialEntry={entry} initialTrend={trend} /></>;
}
