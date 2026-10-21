"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { submitEnergyOperation, decideEnergyOperation, readEnergySnapshot } from "@/features/activities/records";
import type { EnergyInput } from "@/features/activities/model";
import { safeAiError } from "@/features/measurements/ai-api";
export async function saveEnergyAction(input: EnergyInput) {
  const user = await currentUser(await headers());
  if (!user) return { ok: false as const, error: "登录已失效，请重新登录。" };
  try {
    const db = getDatabase(), operation = await submitEnergyOperation(db, { userId: user.id, origin: "manual" }, input);
    if (operation.status !== "confirmed" && !operation.canConfirm) throw new Error(operation.rows.find(row => row.error)?.error ?? "请检查输入。");
    await decideEnergyOperation(db, user.id, operation.id, operation.revision, "confirm");
    const snapshot = await readEnergySnapshot(db, user.id);
    revalidatePath("/dashboard/energy"); revalidatePath("/dashboard"); revalidatePath("/dashboard/ai", "layout");
    return { ok: true as const, data: { snapshot, message: "已保存。" } };
  } catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
