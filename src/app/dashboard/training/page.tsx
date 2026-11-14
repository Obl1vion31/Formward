import {WorkspaceSnapshot} from "@/features/dashboard/workspace-cache";
import {workspaceQuery} from "@/features/dashboard/workspace-cache-state";
import { linkedDate } from '@/features/measurements/calendar';
import { redirect } from "next/navigation";
import { getDatabase } from "@/db/client";
import { currentPageUser } from "@/features/auth/server";
import { requireCompletedOnboarding } from "@/features/onboarding/server";
import { readTraining } from "@/features/training/records";
import { localMeasurementDate } from "@/features/measurements/entry-state";
import { systemMeasurementTimezone } from "@/features/measurements/timezone";
import { TrainingView } from "@/features/training/view";
import { refreshTrainingAction, saveTrainingAction } from "./actions";
export const metadata = { title: "Formward · 训练" };
export const maxDuration = 60;
export default async function TrainingPage({searchParams}:{searchParams:Promise<{date?:string|string[]}>}) {
  const user = await currentPageUser(); if (!user) redirect("/");
  await requireCompletedOnboarding();
  const params=await searchParams, linked=linkedDate(params.date), date=linked && linked >= "2000-01-01" && linked <= "2100-12-31" ? linked : null;
  const snapshot = await readTraining(getDatabase(), user.id);
  return <WorkspaceSnapshot path="/dashboard/training" query={workspaceQuery(params)}><TrainingView key={date??"today"} initialDate={date} initial={snapshot} today={localMeasurementDate(new Date(),systemMeasurementTimezone(new Date(),process.env.FORMWARD_TIMEZONE))} save={saveTrainingAction} refresh={refreshTrainingAction} /></WorkspaceSnapshot>;
}
