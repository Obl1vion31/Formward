import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { personalProfile } from "../../db/schema";
import { lockActiveAccount, requireSessionProof, type SecurityTransaction, type SessionProof } from "../auth/account-security";
import { ApiError } from "../auth/ai-identity";
import { emptyProfile, validateProfile, type PersonalProfile } from "./model";

function display(row: typeof personalProfile.$inferSelect | undefined): PersonalProfile {
  return row ? { heightCm: row.heightCm===null ? null : String(Number(row.heightCm)), birthDate: row.birthDate, onboardingStep: row.onboardingStep, version: row.version, updatedAt: row.updatedAt.toISOString() } : { ...emptyProfile };
}
/** 只供创建新账号的同一事务调用；缺少资料行的既有账号不被强制引导。 */
export async function initializePersonalProfile(tx: SecurityTransaction, userId: string) {
  await tx.insert(personalProfile).values({ userId, onboardingStep: "profile" });
}
export async function loadPersonalProfile(db: Database, proof: SessionProof) {
  await requireSessionProof(db, proof);
  return display((await db.select().from(personalProfile).where(eq(personalProfile.userId, proof.userId)))[0]);
}
export async function savePersonalProfile(db: Database, proof: SessionProof, input: unknown) {
  let value;try { value=validateProfile(input); } catch(error) { throw new ApiError(400,"invalid_input",error instanceof z.ZodError ? "资料格式不正确，请核对后重试。" : error instanceof Error ? error.message : "资料格式不正确。"); }
  return db.transaction(async tx => {
    await lockActiveAccount(tx, proof.userId); await requireSessionProof(tx, proof);
    const current=display((await tx.select().from(personalProfile).where(eq(personalProfile.userId, proof.userId)).for("update"))[0]);
    const step=value.continueOnboarding && current.onboardingStep!=="complete" ? "tutorial" : current.onboardingStep;
    if (current.heightCm===value.heightCm && current.birthDate===value.birthDate && current.onboardingStep===step && current.version>0) return current;
    if (current.version!==value.expectedVersion) throw new ApiError(409,"version_conflict","资料已在其他页面修改。当前输入已保留，请查看最新资料后再保存。");
    const data={ heightCm:value.heightCm, birthDate:value.birthDate, onboardingStep:step, version:current.version+1, updatedAt:new Date() };
    if (!current.version) return display((await tx.insert(personalProfile).values({ userId:proof.userId,...data }).returning())[0]);
    return display((await tx.update(personalProfile).set(data).where(eq(personalProfile.userId,proof.userId)).returning())[0]);
  });
}
export async function advanceOnboarding(db: Database, proof: SessionProof, input: unknown) {
  const value=z.object({ expectedVersion:z.number().int().min(0), step:z.enum(["profile","tutorial","complete"]) }).strict().parse(input);
  return db.transaction(async tx => {
    await lockActiveAccount(tx,proof.userId); await requireSessionProof(tx,proof);
    const row=(await tx.select().from(personalProfile).where(eq(personalProfile.userId,proof.userId)).for("update"))[0],current=display(row);
    if (current.onboardingStep===value.step || current.onboardingStep==="complete") return current;
    if (current.version!==value.expectedVersion) throw new ApiError(409,"version_conflict","引导进度已改变，请刷新查看最新步骤。");
    if (current.onboardingStep==="profile" && value.step==="complete") throw new ApiError(400,"invalid_input","请先继续到使用说明。");
    return display((await tx.update(personalProfile).set({ onboardingStep:value.step,version:current.version+1,updatedAt:new Date() }).where(eq(personalProfile.userId,proof.userId)).returning())[0]);
  });
}
export async function requireOnboardingOwner(db: Database, proof: SessionProof) {
  const identity=await requireSessionProof(db,proof);
  if (identity.user.role!=="owner") throw new ApiError(403,"forbidden","此入口仅供管理员演练。");
}
