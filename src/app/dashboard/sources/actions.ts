"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { withCurrentSession } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { safeAiError } from "@/features/measurements/ai-api";
import { bindPersonalSource, configureConnection, configurePolicy } from "@/features/data-sources/mutations";
import { adoptSourceDays, resolveSourceConflict } from "@/features/data-sources/adoption";
import { loadSources } from "@/features/data-sources/state";
import { synchronizeSource } from "@/features/data-sources/sync";

async function change(work: (userId: string) => Promise<unknown>, health = false) {
  try {
    return await withCurrentSession(await headers(), async user => {
      await work(user.id);
      revalidatePath("/dashboard/sources");
      if (health) { revalidatePath("/dashboard/energy"); revalidatePath("/dashboard"); }
      return { ok: true as const, data: await loadSources(getDatabase(), user.id) };
    });
  } catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
export async function loadSourcesAction() {
  try { return await withCurrentSession(await headers(), async user => ({ ok: true as const, data: await loadSources(getDatabase(), user.id) })); }
  catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
export async function bindPersonalSourceAction(input: unknown) { return change(id => bindPersonalSource(getDatabase(), id, input)); }
export async function configureConnectionAction(id: string, input: unknown) { return change(userId => configureConnection(getDatabase(), userId, id, input)); }
export async function configureSourcePolicyAction(input: unknown) { return change(id => configurePolicy(getDatabase(), id, input)); }
export async function adoptSourceDaysAction(input: unknown) { return change(id => adoptSourceDays(getDatabase(), id, input), true); }
export async function resolveSourceConflictAction(input: unknown) { return change(id => resolveSourceConflict(getDatabase(), id, input), true); }
export async function synchronizeSourceAction(manual = false) {
  try {
    return await withCurrentSession(await headers(), async user => {
      const result = await synchronizeSource(getDatabase(), user.id, { manual: manual === true });
      if (result.adoptedDates.length) { revalidatePath("/dashboard/energy"); revalidatePath("/dashboard"); }
      return { ok: true as const, data: await loadSources(getDatabase(), user.id), sync: result };
    });
  } catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
