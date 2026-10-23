"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { submitEnergyOperation, decideEnergyOperation, readEnergySnapshot } from "@/features/activities/records";
import type { EnergyInput } from "@/features/activities/model";
import { safeAiError } from "@/features/measurements/ai-api";
import { energyPresentation } from "@/features/activities/presentation";
import { listMeasurements } from "@/features/measurements/records";
import { measurementDisplay } from "@/features/measurements/editing";
import { localMeasurementDate } from "@/features/measurements/entry-state";
import { systemMeasurementTimezone } from "@/features/measurements/timezone";
import { listEnergySources, removeEnergySource } from "@/features/activities/sources";
import type { SourceRemovalResult } from "@/components/source-input";
export async function saveEnergyAction(input: EnergyInput) {
  const user = await currentUser(await headers());
  if (!user) return { ok: false as const, error: "登录已失效，请重新登录。" };
  try {
    const db = getDatabase(), operation = await submitEnergyOperation(db, { userId: user.id, origin: "manual" }, input);
    if (operation.status !== "confirmed" && !operation.canConfirm) throw new Error(operation.rows.find(row => row.error)?.error ?? "请检查输入。");
    await decideEnergyOperation(db, user.id, operation.id, operation.revision, "confirm");
    const snapshot = await readEnergySnapshot(db, user.id);
    revalidatePath("/dashboard/energy"); revalidatePath("/dashboard"); revalidatePath("/dashboard/ai", "layout");
    const today = localMeasurementDate(new Date(), systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE));
    return { ok: true as const, data: { presentation: energyPresentation(snapshot, (await listMeasurements(db, user.id)).map(measurementDisplay), today, await listEnergySources(db, user.id)), message: "已保存。" } };
  } catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}

export async function removeEnergySourceAction(label: string): Promise<SourceRemovalResult> {
  const user = await currentUser(await headers());
  if (!user) return { ok: false, error: "登录已失效，请重新登录。" };
  try {
    const sources = await removeEnergySource(getDatabase(), { userId: user.id, actorId: user.id }, label);
    revalidatePath("/dashboard/energy"); revalidatePath("/dashboard/ai", "layout"); revalidatePath("/dashboard/meals/review", "layout");
    return { ok: true, sources };
  } catch (error) { return { ok: false, error: safeAiError(error).error.message }; }
}
