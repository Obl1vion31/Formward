"use server";
import { headers } from "next/headers";
import { getDatabase } from "@/db/client";
import { withCurrentSession } from "@/features/auth/server";
import { mutateTraining, readTraining } from "@/features/training/records";
import { safeAiError } from "@/features/measurements/ai-api";
import type { TrainingResult } from "@/features/training/model";

export async function saveTrainingAction(input: unknown): Promise<TrainingResult> {
  try {
    return await withCurrentSession(await headers(), async user => ({ ok: true as const, ...await mutateTraining(getDatabase(), user.id, input) }));
  } catch (error) {
    const safe = safeAiError(error);
    return { ok: false, error: safe.error.message, conflict: safe.error.code === "version_conflict" };
  }
}
export async function refreshTrainingAction(): Promise<TrainingResult> {
  try { return await withCurrentSession(await headers(), async user => ({ ok: true as const, snapshot: await readTraining(getDatabase(), user.id) })); }
  catch (error) { return { ok: false, error: safeAiError(error).error.message }; }
}
