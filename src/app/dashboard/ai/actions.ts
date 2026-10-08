"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/features/auth/server";
import { createAiToken, revokeAiToken } from "@/features/auth/ai-tokens";
import { getDatabase } from "@/db/client";
import { safeAiError } from "@/features/measurements/ai-api";
import { decideAiMeasurementOperation } from "@/features/measurements/ai-operations";

async function perform<T>(work: (userId: string) => Promise<T>) {
  const user = await currentUser(await headers());
  if (!user) return { ok: false as const, error: "登录已失效，请重新登录。" };
  try {
    const data = await work(user.id);
    revalidatePath("/dashboard/ai", "layout"); revalidatePath("/dashboard");
    return { ok: true as const, data };
  } catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
export async function createTokenAction(name: string, permission: "read" | "write") {
  return perform(userId => createAiToken(getDatabase(), userId, name, permission));
}
export async function revokeTokenAction(id: string) {
  return perform(async userId => { await revokeAiToken(getDatabase(), userId, id); return { id }; });
}
export async function decideOperationAction(id: string, decision: "confirm" | "cancel") {
  return perform(userId => decideAiMeasurementOperation(getDatabase(), userId, id, decision));
}
