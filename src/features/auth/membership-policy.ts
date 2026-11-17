import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { membershipPlan } from "../../db/schema";
import { ApiError } from "./ai-identity";

export type MembershipPolicy = Pick<typeof membershipPlan.$inferSelect, "id" | "name" | "active" | "archivedAt" | "dailyBudgetCents" | "dailyRecognitionLimit" | "chatEnabled" | "mealRecognitionEnabled" | "version" | "systemOnly" | "isDefault">;
export type MembershipAccount = { id: string; role?: string | null; membershipTier?: string | null; membershipTierId?: string | null };
export function administratorMembership(account: MembershipAccount) { return !!process.env.FORMWARD_CHAT_PILOT_USER_ID && account.id === process.env.FORMWARD_CHAT_PILOT_USER_ID && account.role === "owner"; }
export function accountMembershipId(account: MembershipAccount) { return administratorMembership(account) ? "admin" : account.membershipTierId ?? account.membershipTier ?? "free"; }
export async function membershipForAccount(db: Pick<Database, "select">, account: MembershipAccount): Promise<MembershipPolicy> {
  const [policy] = await db.select().from(membershipPlan).where(eq(membershipPlan.id, accountMembershipId(account)));
  if (!policy) throw new ApiError(503, "membership_configuration", "会员档位配置暂不可用，手动记录仍可使用。");
  return policy;
}
export async function withMembership<T extends MembershipAccount>(db: Pick<Database, "select">, account: T) { return { ...account, membershipPolicy: await membershipForAccount(db, account) }; }
/** 档位变更、新账号和分配共用锁；模型请求在账号锁内读取最新策略，不缓存额度。 */
export async function lockMembershipConfiguration(tx: Pick<Database, "execute">) { await tx.execute(sql`SELECT pg_advisory_xact_lock(194375, 1)`); }
export async function defaultMembershipId(tx: Pick<Database, "select" | "execute">) {
  await lockMembershipConfiguration(tx);
  const [row] = await tx.select({id:membershipPlan.id}).from(membershipPlan).where(and(eq(membershipPlan.isDefault,true),eq(membershipPlan.active,true),isNull(membershipPlan.archivedAt)));
  if (!row) throw new ApiError(503,"membership_configuration","新用户默认档位尚未配置，请联系管理员。");
  return row.id;
}
