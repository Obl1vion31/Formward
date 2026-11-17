import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { accountEvent, assistantConversation, assistantMessage, assistantRun, assistantUsageRequest, membershipPlan, user } from "../../db/schema";
import { requireSessionProof, type SessionProof } from "../auth/account-security";
import { ApiError } from "../auth/ai-identity";
import { accountMembershipId, lockMembershipConfiguration } from "../auth/membership-policy";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const idSchema=z.string().min(1).max(128);
export const membershipInputSchema=z.object({id:idSchema.optional(),name:z.string().trim().min(1).max(40).refine(v=>!/[\x00-\x1f\x7f]/.test(v)),active:z.boolean(),isDefault:z.boolean(),dailyBudgetCents:z.number().int().min(0).max(1000).nullable(),dailyRecognitionLimit:z.number().int().min(0).max(100).nullable(),chatEnabled:z.boolean(),mealRecognitionEnabled:z.boolean(),version:z.number().int().min(0).optional(),requestId:z.string().uuid(),reason:z.string().trim().max(500).default("")}).strict().refine(v=>!v.chatEnabled||v.dailyBudgetCents!==null,{message:"开放聊天时请设置每日金额上限。"}).refine(v=>!v.isDefault||v.active,{message:"新用户默认档位必须启用。"});
export type MembershipInput=z.input<typeof membershipInputSchema>;
export const membershipArchiveSchema=z.object({id:idSchema,replacementId:idSchema.optional(),version:z.number().int().min(0),requestId:z.string().uuid(),reason:z.string().trim().max(500).default("")}).strict();
export type MembershipArchiveInput=z.input<typeof membershipArchiveSchema>;
const assignmentSchema=z.object({userId:idSchema,tierId:idSchema,version:z.number().int().min(0),requestId:z.string().uuid()}).strict();
const canonical=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Record<string,unknown>;
export function effectiveMembershipSql() { return sql`CASE WHEN ${user.role}='owner' AND ${user.id}=${process.env.FORMWARD_CHAT_PILOT_USER_ID??""} THEN 'admin' ELSE coalesce(${user.membershipTierId},${user.membershipTier}) END`; }
export async function membershipSnapshot(db:Pick<Database,"select">) {
 const plans=await db.select().from(membershipPlan).where(isNull(membershipPlan.archivedAt)).orderBy(desc(membershipPlan.isDefault),membershipPlan.systemOnly,membershipPlan.createdAt,membershipPlan.id);
 const counts=await db.select({tierId:effectiveMembershipSql().as("tier_id"),count:sql<number>`count(*)::int`,overrides:sql<number>`count(*)FILTER(WHERE ${user.aiDailyBudgetCents} IS NOT NULL OR ${user.aiDailyRecognitionLimit} IS NOT NULL)::int`}).from(user).groupBy(sql`1`);
 return plans.map(p=>({...p,createdAt:p.createdAt.toISOString(),updatedAt:p.updatedAt.toISOString(),archivedAt:null,users:counts.find(c=>c.tierId===p.id)?.count??0,overrides:counts.find(c=>c.tierId===p.id)?.overrides??0}));
}
export async function loadMembershipSettings(db:Database,proof:SessionProof) {await requireSessionProof(db,proof,true);const data=await membershipSnapshot(db);await requireSessionProof(db,proof,true);return data;}
async function begin(tx:Tx,proof:SessionProof) {
 await lockMembershipConfiguration(tx);await tx.select().from(user).where(eq(user.id,proof.userId)).for("update");return requireSessionProof(tx,proof,true);
}
async function replay(tx:Tx,key:string,action:string,input:Record<string,unknown>) {
 const[p]=await tx.select().from(accountEvent).where(eq(accountEvent.requestId,key));
 if(p){if(p.action!==action||!isDeepStrictEqual(p.details?.input,input))throw new ApiError(409,"request_conflict","同一请求编号不能用于其他档位修改。");return p;}
 return null;
}
async function affected(tx:Tx,id:string) { return tx.select().from(user).where(sql`${effectiveMembershipSql()}=${id}`).orderBy(user.id).for("update"); }
async function stopRuns(tx:Tx,ids:string[],chat:boolean,meal:boolean) {
 if(!ids.length||!chat&&!meal)return;
 const purposes=[...(chat?["chat"]:[]),...(meal?["meal_entry"]:[])];
 const conversations=tx.select({id:assistantConversation.id}).from(assistantConversation).where(inArray(assistantConversation.purpose,purposes));
 const stopped=await tx.update(assistantRun).set({state:"stopped"}).where(and(inArray(assistantRun.userId,ids),eq(assistantRun.state,"running"),inArray(assistantRun.conversationId,conversations))).returning({id:assistantRun.id,answer:assistantRun.assistantMessageId});
 for(const row of stopped){await tx.update(assistantMessage).set({state:"stopped",error:"当前档位的AI权限已调整，已有内容保留。"}).where(eq(assistantMessage.id,row.answer));await tx.update(assistantUsageRequest).set({state:"unknown"}).where(and(eq(assistantUsageRequest.runId,row.id),eq(assistantUsageRequest.state,"reserved")));}
}
function mutationError(error:unknown):never {
 const value=error as {code?:string;cause?:{code?:string}};
 if(value?.code==="23505"||value?.cause?.code==="23505")throw new ApiError(409,"membership_name_exists","这个档位名称已存在，请换一个名称。");throw error;
}
export async function saveMembership(db:Database,proof:SessionProof,input:MembershipInput) {
 const parsed=membershipInputSchema.safeParse(input);if(!parsed.success)throw new ApiError(400,"invalid_membership",parsed.error.issues[0]?.message??"请填写有效的档位设置。");
 const v=parsed.data,data=canonical(v),key=`membership:${proof.userId}:${v.requestId}`;
 return db.transaction(async tx=>{
  const actor=await begin(tx,proof),previous=await replay(tx,key,"membership_tier_saved",data);
  if(previous)return {id:String(previous.details?.id),repeated:true};
  const [old]=v.id?await tx.select().from(membershipPlan).where(eq(membershipPlan.id,v.id)):[];
  if(v.id&&(!old||old.archivedAt))throw new ApiError(404,"not_found","档位不存在或已删除。");
  if(old&&old.version!==v.version)throw new ApiError(409,"version_conflict","档位已被更新，请读取最新设置。填写内容保留。");
  if(old?.systemOnly&&v.isDefault)throw new ApiError(400,"invalid_membership","管理员专用档位不能分配给新用户。");
  if(old?.isDefault&&!v.isDefault)throw new ApiError(409,"default_membership","请在其他档位中设置新的默认档位，或删除时选择接替档位。");
  const plans=await tx.select({id:membershipPlan.id}).from(membershipPlan).where(isNull(membershipPlan.archivedAt));if(!old&&plans.length>=50)throw new ApiError(400,"membership_limit","最多保留50个未删除档位，请先整理现有档位。");
  const members=old?await affected(tx,old.id):[],ids=members.map(p=>p.id),id=old?.id??randomUUID();
  if(v.isDefault)await tx.update(membershipPlan).set({isDefault:false,version:sql`${membershipPlan.version}+1`,updatedAt:new Date()}).where(and(eq(membershipPlan.isDefault,true),sql`${membershipPlan.id}<>${id}`));
  const settings={name:v.name,active:v.active,isDefault:v.isDefault,dailyBudgetCents:v.dailyBudgetCents,dailyRecognitionLimit:v.dailyRecognitionLimit,chatEnabled:v.chatEnabled,mealRecognitionEnabled:v.mealRecognitionEnabled,updatedAt:new Date()};
  if(old)await tx.update(membershipPlan).set({...settings,version:old.version+1}).where(eq(membershipPlan.id,id));else await tx.insert(membershipPlan).values({id,...settings});
  if(ids.length)await tx.update(user).set({entitlementVersion:sql`${user.entitlementVersion}+1`,updatedAt:new Date()}).where(inArray(user.id,ids));
  await stopRuns(tx,ids,!v.active||!v.chatEnabled,!v.active||!v.mealRecognitionEnabled);
  await tx.insert(accountEvent).values({id:randomUUID(),actorId:actor.user.id,userId:null,email:actor.user.email,action:"membership_tier_saved",reason:v.reason||"后台调整档位配置",requestId:key,details:{input:data,id,before:old??null,after:settings,affectedUsers:ids.length}});
  return {id,repeated:false};
 }).catch(mutationError);
}
export async function archiveMembership(db:Database,proof:SessionProof,input:MembershipArchiveInput) {
 const parsed=membershipArchiveSchema.safeParse(input);if(!parsed.success)throw new ApiError(400,"invalid_membership","删除档位的参数无效。");const v=parsed.data,data=canonical(v),key=`membership:${proof.userId}:${v.requestId}`;
 return db.transaction(async tx=>{
  const actor=await begin(tx,proof),previous=await replay(tx,key,"membership_tier_archived",data);if(previous)return {repeated:true};
  const [old]=await tx.select().from(membershipPlan).where(eq(membershipPlan.id,v.id));if(!old||old.archivedAt)throw new ApiError(404,"not_found","档位不存在或已删除。");
  if(old.systemOnly)throw new ApiError(403,"system_membership","管理员专用档位需保留，可以调整它的额度和权限。");
  if(old.version!==v.version)throw new ApiError(409,"version_conflict","档位已被更新，请读取最新设置后重试。");
  const members=await affected(tx,old.id),ids=members.map(p=>p.id);
  const [replacement]=v.replacementId?await tx.select().from(membershipPlan).where(eq(membershipPlan.id,v.replacementId)):[];
  if((ids.length||old.isDefault)&&(!replacement||replacement.id===old.id||replacement.systemOnly||!replacement.active||replacement.archivedAt))throw new ApiError(400,"replacement_required","请选择一个启用的接替档位，现有用户与新用户默认设置将转入该档位。");
  if(v.replacementId&&(!replacement||replacement.id===old.id||replacement.systemOnly||!replacement.active||replacement.archivedAt))throw new ApiError(400,"invalid_membership","接替档位无效。");
  if(old.isDefault){await tx.update(membershipPlan).set({isDefault:false}).where(eq(membershipPlan.id,old.id));await tx.update(membershipPlan).set({isDefault:true,version:sql`${membershipPlan.version}+1`,updatedAt:new Date()}).where(eq(membershipPlan.id,replacement!.id));}
  if(ids.length){await tx.update(user).set({membershipTierId:replacement!.id,entitlementVersion:sql`${user.entitlementVersion}+1`,updatedAt:new Date()}).where(inArray(user.id,ids));await stopRuns(tx,ids,!replacement!.chatEnabled,!replacement!.mealRecognitionEnabled);}
  await tx.update(membershipPlan).set({active:false,isDefault:false,archivedAt:new Date(),version:old.version+1,updatedAt:new Date()}).where(eq(membershipPlan.id,old.id));
  await tx.insert(accountEvent).values({id:randomUUID(),actorId:actor.user.id,email:actor.user.email,action:"membership_tier_archived",reason:v.reason||"后台删除档位并转移用户",requestId:key,details:{input:data,before:old,replacementId:replacement?.id??null,affectedUsers:ids.length}});
  return {repeated:false};
 });
}
export async function changeMembershipAssignment(db:Database,proof:SessionProof,input:z.infer<typeof assignmentSchema>) {
 const parsed=assignmentSchema.safeParse(input);if(!parsed.success)throw new ApiError(400,"invalid_membership","请选择有效档位。");const v=parsed.data,key=`${proof.userId}:${v.requestId}`,data=canonical(v);
 return db.transaction(async tx=>{
  const actor=await begin(tx,proof);const [target]=await tx.select().from(user).where(eq(user.id,v.userId)).for("update");
  if(!target)throw new ApiError(404,"not_found","用户不存在。");if(target.role!=="user"||target.id===proof.userId)throw new ApiError(403,"forbidden","管理员的专属额度请在档位管理中调整，此入口只分配普通用户档位。");
  const [previous]=await tx.select().from(accountEvent).where(eq(accountEvent.requestId,key));
  if(previous){if(previous.action!=="membership_changed"||previous.userId!==v.userId||!(isDeepStrictEqual(previous.details?.input,data)||previous.reason===JSON.stringify({tier:v.tierId,expectedVersion:v.version})))throw new ApiError(409,"request_conflict","同一请求编号不能用于其他修改。");return {tier:accountMembershipId(target),version:target.entitlementVersion,repeated:true};}
  if(target.entitlementVersion!==v.version)throw new ApiError(409,"version_conflict","用户设置已更新，请读取最新设置后再保存。");
  const [plan]=await tx.select().from(membershipPlan).where(eq(membershipPlan.id,v.tierId));if(!plan||!plan.active||plan.systemOnly||plan.archivedAt)throw new ApiError(400,"invalid_membership","请选择已启用的普通会员档位。");
  const changed=accountMembershipId(target)!==plan.id;if(changed){await tx.update(user).set({membershipTierId:plan.id,entitlementVersion:target.entitlementVersion+1,updatedAt:new Date()}).where(eq(user.id,target.id));await stopRuns(tx,[target.id],!plan.chatEnabled,!plan.mealRecognitionEnabled);}
  await tx.insert(accountEvent).values({id:randomUUID(),actorId:actor.user.id,userId:target.id,email:target.email,action:"membership_changed",reason:JSON.stringify({tier:v.tierId,expectedVersion:v.version}),requestId:key,details:{input:data,before:{tierId:accountMembershipId(target)},after:{tierId:plan.id},personalOverridesPreserved:true}});
  return {tier:plan.id,version:target.entitlementVersion+(changed?1:0),repeated:false};
 });
}
