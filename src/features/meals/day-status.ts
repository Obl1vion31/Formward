import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { meal, mealDay, mealDayEvent } from "../../db/schema";
import { ApiError } from "../auth/ai-identity";
import { lockOwner, type Transaction } from "../auth/owner-lock";
import { linkedDate } from "../measurements/calendar";
import type { MealDayInput, MealDayView } from "./model";

type MealVersion = { id: string; version: number };
export function mealDayDigest(rows: MealVersion[]) {
  return createHash("sha256").update([...rows].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(row=>row.id+":"+row.version).join("|")).digest("hex");
}
export async function readMealDayViews(db: Pick<Database,"select">, userId: string, meals: {id:string;version:number;localDate:string;deletedAt:Date|null}[]) {
  const states = await db.select().from(mealDay).where(eq(mealDay.userId,userId));
  const dates = [...new Set(meals.filter(row=>!row.deletedAt).map(row=>row.localDate))];
  return new Map(dates.map(date=>{
    const row=states.find(day=>day.date===date), contentDigest=mealDayDigest(meals.filter(m=>!m.deletedAt&&m.localDate===date));
    const status=row && row.contentDigest===contentDigest ? row.status : "unconfirmed";
    return [date,{date,status,version:row?.version??0,contentDigest,source:row?.source??"unconfirmed"} satisfies MealDayView];
  }));
}
const inputSchema=z.object({operationId:z.string().uuid(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),status:z.enum(["complete","incomplete"]),version:z.number().int().min(0),contentDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
/** 仅网页登录本人确认全天状态；AI保存一餐不代表用户确认整天。 */
export async function setMealDayStatus(db: Database, userId: string, raw: MealDayInput) {
  const parsed=inputSchema.safeParse(raw);
  if(!parsed.success||!linkedDate(parsed.data.date))throw new ApiError(400,"invalid_input","请选择有效的饮食日期与记录状态。");
  const input=parsed.data, requestDigest=createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return db.transaction(async tx=>{
    await lockOwner(tx,userId);
    const [prior]=await tx.select().from(mealDayEvent).where(and(eq(mealDayEvent.userId,userId),eq(mealDayEvent.requestId,input.operationId)));
    if(prior){if(prior.requestDigest!==requestDigest)throw new ApiError(409,"request_conflict","请求标识已用于另一项确认。");return {repeated:true};}
    const meals=await tx.select({id:meal.id,version:meal.version}).from(meal).where(and(eq(meal.userId,userId),eq(meal.localDate,input.date),isNull(meal.deletedAt)));
    if(!meals.length)throw new ApiError(409,"empty_day","这一天还没有饮食记录，请先录入。");
    const [before]=await tx.select().from(mealDay).where(and(eq(mealDay.userId,userId),eq(mealDay.date,input.date)));
    if((before?.version??0)!==input.version||mealDayDigest(meals)!==input.contentDigest)throw new ApiError(409,"version_conflict","这一天的饮食已改变，请刷新后再确认是否记完。");
    const values={status:input.status,contentDigest:input.contentDigest,version:(before?.version??0)+1,source:"user",updatedBy:userId,updatedAt:new Date()};
    const [after]=before?await tx.update(mealDay).set(values).where(and(eq(mealDay.userId,userId),eq(mealDay.date,input.date))).returning():await tx.insert(mealDay).values({id:randomUUID(),userId,date:input.date,...values}).returning();
    await tx.insert(mealDayEvent).values({id:randomUUID(),userId,date:input.date,requestId:input.operationId,requestDigest,actorId:userId,snapshot:{before:before??null,after,reason:"user_confirmation"}});
    return {repeated:false};
  });
}
/** 与餐次写入同一事务执行；幂等重试在调用前已返回，不会重复作废后来的确认。 */
export async function invalidateMealDays(tx: Transaction, userId: string, dates: string[], operationId: string, actorId: string) {
  for(const date of [...new Set(dates)]){
    const meals=await tx.select({id:meal.id,version:meal.version}).from(meal).where(and(eq(meal.userId,userId),eq(meal.localDate,date),isNull(meal.deletedAt)));
    const [before]=await tx.select().from(mealDay).where(and(eq(mealDay.userId,userId),eq(mealDay.date,date)));
    const values={status:"unconfirmed" as const,contentDigest:mealDayDigest(meals),version:(before?.version??0)+1,source:"record_change",updatedBy:userId,updatedAt:new Date()};
    const [after]=before?await tx.update(mealDay).set(values).where(and(eq(mealDay.userId,userId),eq(mealDay.date,date))).returning():await tx.insert(mealDay).values({id:randomUUID(),userId,date,...values}).returning();
    const requestId=operationId+":"+date+":record-change";
    await tx.insert(mealDayEvent).values({id:randomUUID(),userId,date,requestId,requestDigest:createHash("sha256").update(requestId).digest("hex"),actorId,snapshot:{before:before??null,after,reason:"record_change",operationId}});
  }
}

/** 一次性、指定账号的旧历史确认；不由页面、API或migration自动调用。 */
export async function initializeHistoricalMealDays(db: Database, userId: string) {
  return db.transaction(async tx => {
    await lockOwner(tx,userId);
    const rows=await tx.select().from(meal).where(and(eq(meal.userId,userId),isNull(meal.deletedAt)));
    const dates=[...new Set(rows.filter(row=>row.localDate<="2026-10-23").map(row=>row.localDate))].sort();
    const changed: string[]=[];
    for(const date of dates) {
      const requestId="historical-initialization-20261023:"+date;
      const [prior]=await tx.select().from(mealDayEvent).where(and(eq(mealDayEvent.userId,userId),eq(mealDayEvent.requestId,requestId)));
      if(prior) continue;
      const [before]=await tx.select().from(mealDay).where(and(eq(mealDay.userId,userId),eq(mealDay.date,date)));
      // 不覆盖用户明确确认、未记全等状态。
      if(before && before.source!=="record_change") continue;
      const contentDigest=mealDayDigest(rows.filter(row=>row.localDate===date));
      const values={status:"complete" as const,contentDigest,version:(before?.version??0)+1,source:"historical_initialization_20261023",updatedBy:userId,updatedAt:new Date()};
      const [after]=before?await tx.update(mealDay).set(values).where(eq(mealDay.id,before.id)).returning():await tx.insert(mealDay).values({id:randomUUID(),userId,date,...values}).returning();
      await tx.insert(mealDayEvent).values({id:randomUUID(),userId,date,requestId,requestDigest:createHash("sha256").update(contentDigest+":"+requestId).digest("hex"),actorId:userId,snapshot:{before:before??null,after,reason:"historical_initialization",cutoff:"2026-10-23"}});
      changed.push(date);
    }
    return {dates:changed};
  });
}
