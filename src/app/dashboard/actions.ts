"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { listMeasurements, type MeasurementActor } from "@/features/measurements/records";
import { estimateMeasurementCell, listMeasurementDates, measurementDisplay, saveMeasurementDay, type EstimateCellInput, type SaveMeasurementDayInput } from "@/features/measurements/editing";
import type { EntryResult } from "@/features/measurements/entry-state";
import type { Database } from "@/db/client";
import { listMeasurementSources } from "@/features/measurements/sources";

async function perform(work: (db: Database, actor: MeasurementActor) => Promise<string>): Promise<EntryResult> {
  const user = await currentUser(await headers());
  if (!user) return { ok: false, error: "登录已失效，请重新登录后保存。" };
  try {
    const db = getDatabase();
    const message = await work(db, { userId: user.id, actorId: user.id, actorType: "user" });
    const records = await listMeasurements(db, user.id);
    const dates = await listMeasurementDates(db, user.id);
    const sources = await listMeasurementSources(db, user.id);
    revalidatePath("/dashboard");
    return { ok: true, records: records.map(measurementDisplay), dates, sources, message };
  } catch (error) {
    // 数据库错误可能含 SQL 和数值，只把业务校验消息返回给本账号。
    return { ok: false, error: error instanceof Error && !["query", "code", "cause"].some(key => key in error) ? error.message : "操作未完成，请稍后重试。" };
  }
}
export async function saveDayAction(input: SaveMeasurementDayInput) {
  return perform(async (db, actor) => { const result = await saveMeasurementDay(db, actor, input); return result.repeated ? "此录入已保存。" : "已保存录入，其他空项保持空白。"; });
}
export async function estimateCellAction(input: EstimateCellInput) {
  return perform(async (db, actor) => (await estimateMeasurementCell(db, actor, input)).message);
}
