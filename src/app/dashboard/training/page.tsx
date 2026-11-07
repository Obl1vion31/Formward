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
export default async function TrainingPage() {
  const user = await currentPageUser(); if (!user) redirect("/");
  await requireCompletedOnboarding();
  const snapshot = await readTraining(getDatabase(), user.id);
  return <TrainingView initial={snapshot} today={localMeasurementDate(new Date(),systemMeasurementTimezone(new Date(),process.env.FORMWARD_TIMEZONE))} save={saveTrainingAction} refresh={refreshTrainingAction} />;
}
