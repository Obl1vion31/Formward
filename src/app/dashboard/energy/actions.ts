"use server";
import {checkWebEnergy} from "@/features/records/web-entry-server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { withCurrentSession } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { submitEnergyOperation, decideEnergyOperation, readEnergySnapshot } from "@/features/activities/records";
import type { EnergyInput } from "@/features/activities/model";
import { safeAiError } from "@/features/measurements/ai-api";
import { energyPresentation } from "@/features/activities/presentation";
import { localMeasurementDate } from "@/features/measurements/entry-state";
import { systemMeasurementTimezone } from "@/features/measurements/timezone";
import { listEnergySources, removeEnergySource } from "@/features/activities/sources";
import type { SourceRemovalResult } from "@/components/source-input";
import {energyChangedKeys} from "@/features/activities/energy-save-state";
import {loadCalculationContext} from "@/features/activities/calculation";
import {listMeasurements} from "@/features/measurements/records";
import {measurementDisplay} from "@/features/measurements/editing";
import {listMeasurementSources} from "@/features/measurements/sources";
import {calendarOrdinal} from "@/features/measurements/calendar";
export async function loadEnergyCalculationAction(date:string) {
 try { return await withCurrentSession(await headers(), async user=>({ok:true as const,data:await loadCalculationContext(getDatabase(),user.id,date)})); }
 catch(error) { return {ok:false as const,error:safeAiError(error).error.message}; }
}
export async function loadEnergySupplementAction(date:string) {
 try { calendarOrdinal(date);return await withCurrentSession(await headers(),async user=>{const db=getDatabase();return {ok:true as const,data:{records:(await listMeasurements(db,user.id,[date])).map(measurementDisplay),sources:await listMeasurementSources(db,user.id)}};}); }
 catch(error){return {ok:false as const,error:safeAiError(error).error.message};}
}
export async function loadEnergyStateAction(){
 try{return await withCurrentSession(await headers(),async user=>{const db=getDatabase(),snapshot=await readEnergySnapshot(db,user.id),today=localMeasurementDate(new Date(),systemMeasurementTimezone());return {ok:true as const,data:energyPresentation(snapshot,[],today,await listEnergySources(db,user.id),user.id)};});}
 catch(error){return {ok:false as const,error:safeAiError(error).error.message};}
}
export async function saveEnergyAction(input: EnergyInput) {
  try {
    return await withCurrentSession(await headers(), async user => {
    const db = getDatabase();await checkWebEnergy(db,user.id,input,undefined,{emptyDateMoveTarget:true});const operation = await submitEnergyOperation(db, { userId: user.id, origin: "manual" }, input,{emptyDateMoveTarget:true});
    if (operation.status !== "confirmed" && !operation.canConfirm) throw new Error(operation.rows.find(row => row.error)?.error ?? "请检查输入。");
    await decideEnergyOperation(db, user.id, operation.id, operation.revision, "confirm", {permanentManualDeletion:true});
    const snapshot = await readEnergySnapshot(db, user.id);
    revalidatePath("/dashboard/energy"); revalidatePath("/dashboard"); revalidatePath("/dashboard/ai", "layout");
    const today = localMeasurementDate(new Date(), systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE));
    return { ok: true as const, data: { presentation: energyPresentation(snapshot, [], today, await listEnergySources(db, user.id),user.id), changedKeys:energyChangedKeys(operation.rows),message: "已保存。" } };
    });
  } catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}

export async function removeEnergySourceAction(label: string): Promise<SourceRemovalResult> {
  try {
    return await withCurrentSession(await headers(), async user => {
    const sources = await removeEnergySource(getDatabase(), { userId: user.id, actorId: user.id }, label);
    revalidatePath("/dashboard/energy"); revalidatePath("/dashboard/ai", "layout"); revalidatePath("/dashboard/meals/review", "layout");
    return { ok: true, sources };
    });
  } catch (error) { return { ok: false, error: safeAiError(error).error.message }; }
}
