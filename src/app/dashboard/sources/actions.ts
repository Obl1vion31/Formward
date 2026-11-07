"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { withCurrentSession } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { safeAiError } from "@/features/measurements/ai-api";
import { bindPersonalSource, configureConnection, configurePolicy } from "@/features/data-sources/mutations";
import { adoptSourceDays, resolveSourceConflict } from "@/features/data-sources/adoption";
import { loadSourceSettings } from "@/features/data-sources/state";
import { synchronizeSource, type SyncResult } from "@/features/data-sources/sync";
import type { SourceRecordChange } from "@/features/data-sources/model";

async function change(work: (userId: string) => Promise<void | { changes?: SourceRecordChange[]; sync?: SyncResult; settingsSaved?: boolean }>, health = false) {
  try {
    return await withCurrentSession(await headers(), async user => {
      const result=await work(user.id);
      revalidatePath("/dashboard/sources");
      if (health || result?.sync?.changes?.length) { revalidatePath("/dashboard/energy"); revalidatePath("/dashboard"); }
      return { ok: true as const, data: await loadSourceSettings(getDatabase(), user.id), ...result, recordChanges:result?.changes??result?.sync?.changes??[] };
    });
  } catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
export async function loadSourcesAction() {
  try { return await withCurrentSession(await headers(), async user => ({ ok: true as const, data: await loadSourceSettings(getDatabase(), user.id) })); }
  catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
export async function bindPersonalSourceAction(input: unknown) { return change(async id => { await bindPersonalSource(getDatabase(), id, input); return {settingsSaved:true,sync:await synchronizeSource(getDatabase(),id,{manual:true,activate:true})}; }); }
export async function configureConnectionAction(id: string, input: unknown) { return change(async userId => { await configureConnection(getDatabase(), userId, id, input); return {settingsSaved:true,sync:await synchronizeSource(getDatabase(),userId,{manual:true,activate:true})}; }); }
export async function configureSourcePolicyAction(input: unknown) { return change(id => configurePolicy(getDatabase(), id, input)); }
export async function adoptSourceDaysAction(input: unknown) { return change(id => adoptSourceDays(getDatabase(), id, input), true); }
export async function resolveSourceConflictAction(input: unknown) { return change(id => resolveSourceConflict(getDatabase(), id, input), true); }
async function synchronize(manual: boolean, from?: string) {
  try {
    return await withCurrentSession(await headers(), async user => {
      const result = await synchronizeSource(getDatabase(), user.id, { manual, activate:manual, from });
      if (result.adoptedDates.length) { revalidatePath("/dashboard/energy"); revalidatePath("/dashboard"); }
      return { ok: true as const, data: await loadSourceSettings(getDatabase(), user.id), sync: result };
    });
  } catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
export async function synchronizeSourceAction(manual = false) { return synchronize(manual === true); }
export async function backfillSourceHistoryAction(from: unknown) {
  if(typeof from !== "string")return {ok:false as const,error:"请选择有效的历史起始日期。"};
  return synchronize(true,from);
}
