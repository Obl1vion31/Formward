import { and, eq, ne, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { assistantMessage } from "../../db/schema";
import { ApiError } from "../auth/ai-identity";
import { requireActiveAccount } from "../auth/account-security";
import { loadRecordReview } from "../records/operations";
import { listMeasurementSources } from "../measurements/sources";
import { listEnergySources } from "../activities/sources";

export async function requireAssistantPreview(db:Database,userId:string,id:string){
  await requireActiveAccount(db,userId);
  const [source]=await db.select({id:assistantMessage.id}).from(assistantMessage).where(and(eq(assistantMessage.userId,userId),eq(assistantMessage.role,"assistant"),ne(assistantMessage.state,"working"),sql`${assistantMessage.references} @> ${JSON.stringify([{kind:"preview",operationId:id}])}::jsonb`)).limit(1);
  if(!source)throw new ApiError(404,"preview_unavailable","此提交不属于当前账号的已结束回答。");
}
export async function loadAssistantPreview(db:Database,userId:string,id:string){
  await requireAssistantPreview(db,userId,id);
  const [operation,sources,energySources]=await Promise.all([loadRecordReview(db,userId,id),listMeasurementSources(db,userId),listEnergySources(db,userId)]);
  return {operation,sources,energySources};
}
