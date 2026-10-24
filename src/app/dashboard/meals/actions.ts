"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { safeAiError } from "@/features/measurements/ai-api";
import { submitMealOperation, decideMealOperation, reviseMealOperation, readMealSnapshot, getMealOperation } from "@/features/meals/records";
import type { MealInput, MealAction } from "@/features/meals/model";
async function perform<T>(work: (userId: string) => Promise<T>) {
  const user = await currentUser(await headers());
  if (!user) return { ok: false as const, error: "登录已失效，请重新登录。" };
  try { const data = await work(user.id); revalidatePath("/dashboard/meals"); revalidatePath("/dashboard/meals/review/[id]", "page"); revalidatePath("/dashboard/ai"); revalidatePath("/dashboard"); return { ok: true as const, data }; }
  catch(error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
export async function saveMealAction(input: MealInput, allowMissingImages = false) { return perform(async userId => {
  const db=getDatabase(), op=await submitMealOperation(db,{userId,origin:"manual"},input);
  if (op.status !== "confirmed" && !op.canConfirm && !(allowMissingImages && op.canConfirmWithoutImages)) throw new Error(op.rows.find(r=>r.error)?.error ?? "请检查录入内容。");
  const result=await decideMealOperation(db,userId,op.id,op.revision,"confirm",allowMissingImages);
  return { snapshot:await readMealSnapshot(db,userId), message:result.result?.message ?? "已保存。" };
}); }
export async function decideMealAction(id: string, revision: number, decision: "confirm" | "cancel", allowMissingImages = false) { return perform(userId => decideMealOperation(getDatabase(),userId,id,revision,decision,allowMissingImages)); }
export async function loadMealReviewAction(id: string) { return perform(async userId => {
  const { displayMealOperation } = await import("@/features/meals/records");
  return displayMealOperation(await getMealOperation(getDatabase(),userId,id));
}); }
export async function refreshMealAction(id: string, revision: number) { return perform(userId=>reviseMealOperation(getDatabase(),userId,id,revision)); }
export async function editMealPreviewAction(id: string, revision: number, index: number, action: MealAction) { return perform(async userId=>{
  const db=getDatabase(), current=await getMealOperation(db,userId,id), actions=[...current.draft.actions];
  if (!Number.isInteger(index) || index<0 || index>=actions.length) throw new Error("审核条目不存在。");
  actions[index]=action; return reviseMealOperation(db,userId,id,revision,actions);
}); }

export async function permanentlyDeleteAction(input: import("@/features/meals/recently-deleted").PermanentDeletion) { return perform(async userId => {
  const { permanentlyDeleteMealRecord } = await import("@/features/meals/recently-deleted");
  const db = getDatabase(), result = await permanentlyDeleteMealRecord(db,userId,input);
  return { snapshot:await readMealSnapshot(db,userId),message:result.message };
}); }

export async function saveMealDayAction(input: import("@/features/meals/model").MealDayInput) { return perform(async userId=>{
  const {setMealDayStatus}=await import("@/features/meals/day-status");
  const db=getDatabase();await setMealDayStatus(db,userId,input);
  return {snapshot:await readMealSnapshot(db,userId),message:input.status==="complete"?"已确认这一天记完。":"已标记未记全，摄入保留，暂不计入盈余。"};
});}
