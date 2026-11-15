import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import type { Database } from "../../db/client";
import { measurement, measurementSource } from "../../db/schema";
import { loadRecordReview } from "../records/operations";
import { ApiError } from "../auth/ai-identity";
import { calendarOrdinal, addCalendarDays } from "../measurements/trend";
import { validateDeviceLabel } from "../measurements/source-label";
import type { FollowupQuestion, ResolvedSupplement } from "./followup";

export async function sourceFollowupQuestions(db: Database, userId: string, questions: FollowupQuestion[]) {
  return Promise.all(questions.map(async question => {
    if (!question.binding) return question;
    calendarOrdinal(question.binding.date);
    const rows = await db.select({ label: measurement.deviceLabel }).from(measurement).innerJoin(measurementSource, and(eq(measurementSource.userId, userId), eq(measurementSource.label, measurement.deviceLabel), isNull(measurementSource.deletedAt))).where(and(eq(measurement.userId, userId), eq(measurement.recordKind, "observed"), isNull(measurement.deletedAt), gte(measurement.recordDate, addCalendarDays(question.binding.date, -29)), lte(measurement.recordDate, question.binding.date))).orderBy(desc(measurement.recordDate), desc(measurement.updatedAt)).limit(240);
    const labels = [...new Set(rows.flatMap(row => row.label ? [row.label] : []))].slice(0, 4);
    return { ...question, prompt: "测量来源", options: labels.map((label, index) => ({ id: `source_${index}`, label })), allowText: true, optional: true, multiple: false };
  }));
}

/** 只将用户已确认的来源映射到相同日期与时段；候选本身绝不代表用户确认。 */
export function applyConfirmedSources(name: string, args: Record<string, unknown>, supplement: ResolvedSupplement | null) {
  if (!supplement) return args;
  const answers = supplement.answers.filter(answer => answer.binding?.kind === "measurement_source");
  if (!answers.length) return args;
  const result = structuredClone(args);
  const items = name === "preview_measurements" || name === "preview_record_bundle" ? result.items : undefined;
  if (!Array.isArray(items)) return result;
  const matched = new Set<string>();
  for (const row of items as Record<string, unknown>[]) {
    if (name === "preview_record_bundle" && row.kind !== "save_record") continue;
    const answer = answers.find(answer => answer.binding?.date === row.date && answer.binding?.period === row.period);
    if (!answer) continue;
    matched.add(answer.questionId);
    const source = answer.value === null ? null : validateDeviceLabel(answer.value);
    if (row.deviceLabel !== undefined && row.deviceLabel !== source && !(typeof row.deviceLabel === "string" && typeof source === "string" && row.deviceLabel.trim().toLocaleLowerCase() === source.toLocaleLowerCase())) throw new ApiError(400, "confirmed_source_conflict", "用户已回答本条测量来源，请使用已确认值，不重新猜测或追问。", { fields: [{ path: "items.deviceLabel", message: "来源须与当前任务的用户补充一致。" }], nextAction: "use_confirmed_followup_source" });
    row.deviceLabel = source;
    if (source === null) row.sourceUnspecifiedConfirmed = true;
    else delete row.sourceUnspecifiedConfirmed;
  }
  if (answers.some(answer => !matched.has(answer.questionId))) throw new ApiError(400, "confirmed_target_conflict", "本次预览的日期或时段与用户刚回答的测量任务不一致，请保持原目标。", { nextAction: "keep_followup_target" });
  return result;
}

/** 旧预览的日期与时段由本人真实草稿解析，不能信任模型在局部修改时重新指定目标。 */
export async function confirmedSourceArguments(db:Database,userId:string,name:string,args:Record<string,unknown>,supplement:ResolvedSupplement|null){
 if(name!=="update_preview"||!supplement?.answers.some(answer=>answer.binding?.kind==="measurement_source"))return applyConfirmedSources(name,args,supplement);
 if(typeof args.id!=="string"||!Array.isArray(args.changes))return args;
 const operation=await loadRecordReview(db,userId,args.id),changes=args.changes as Record<string,unknown>[];
 const targets=changes.filter(patch=>patch.kind==="save_record").map(patch=>{const original=operation.rows.find(row=>row.key===patch.key)?.action;if(original?.kind!=="save_record")throw new ApiError(409,"confirmed_target_conflict","来源补充的原测量项目已变化，请重新读取。");return {...patch,date:original.date,period:original.period};});
 const mapped=applyConfirmedSources("preview_measurements",{items:targets},supplement) as {items:Record<string,unknown>[]};
 return {...args,changes:changes.map(patch=>{const target=mapped.items.find(row=>row.key===patch.key);return target?{...patch,deviceLabel:target.deviceLabel,...(target.sourceUnspecifiedConfirmed?{sourceUnspecifiedConfirmed:true}:{})}:patch;})};
}
