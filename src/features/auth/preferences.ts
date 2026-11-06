import {and,eq,isNull,isNotNull} from 'drizzle-orm';
import {z} from 'zod';
import type {Database} from '@/db/client';
import {accountPreferences,measurement as measurements} from '@/db/schema';
import {requireSessionProof,lockActiveAccount,webSessionContext,type SessionProof} from './account-security';
import {ApiError} from './ai-identity';
export type AccountPreferences={showBodyFat:boolean;version:number;updatedAt:string|null};
const inputSchema=z.object({showBodyFat:z.boolean(),expectedVersion:z.number().int().nonnegative()}).strict();
export async function loadAccountPreferences(db:Database,proof:SessionProof):Promise<AccountPreferences>{
 await requireSessionProof(db,proof);
 const [saved]=await db.select().from(accountPreferences).where(eq(accountPreferences.userId,proof.userId));
 if(saved)return {showBodyFat:saved.showBodyFat,version:saved.version,updatedAt:saved.updatedAt.toISOString()};
 const [fat]=await db.select({id:measurements.id}).from(measurements).where(and(eq(measurements.userId,proof.userId),eq(measurements.recordKind,'observed'),isNull(measurements.deletedAt),isNotNull(measurements.bodyFatPercent))).limit(1);
 return {showBodyFat:!!fat,version:0,updatedAt:null};
}
export async function saveAccountPreferences(db:Database,proof:SessionProof,input:unknown):Promise<AccountPreferences>{
 const parsed=inputSchema.safeParse(input);if(!parsed.success)throw new ApiError(400,'invalid_input','指标偏好格式无效。');
 return webSessionContext.run(proof,()=>db.transaction(async tx=>{
  await lockActiveAccount(tx,proof.userId);
  const [current]=await tx.select().from(accountPreferences).where(eq(accountPreferences.userId,proof.userId));
  if(current?.showBodyFat===parsed.data.showBodyFat)return {showBodyFat:current.showBodyFat,version:current.version,updatedAt:current.updatedAt.toISOString()};
  if((current?.version??0)!==parsed.data.expectedVersion)throw new ApiError(409,'version_conflict','其他设备已修改指标偏好，已读取最新设置。');
  const now=new Date();
  const [saved]=current?await tx.update(accountPreferences).set({showBodyFat:parsed.data.showBodyFat,version:current.version+1,updatedAt:now}).where(eq(accountPreferences.userId,proof.userId)).returning():await tx.insert(accountPreferences).values({userId:proof.userId,showBodyFat:parsed.data.showBodyFat}).returning();
  return {showBodyFat:saved.showBodyFat,version:saved.version,updatedAt:saved.updatedAt.toISOString()};
 }));
}
