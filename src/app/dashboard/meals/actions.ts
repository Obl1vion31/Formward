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
  try { const data = await work(user.id); revalidatePath("/dashboard/meals", "layout"); revalidatePath("/dashboard/ai"); return { ok: true as const, data }; }
  catch(error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
export async function saveMealAction(input: MealInput) { return perform(async userId => {
  const db=getDatabase(), op=await submitMealOperation(db,{userId,origin:"manual"},input);
  if (!op.canConfirm) throw new Error(op.rows.find(r=>r.error)?.error ?? "请检查录入内容。");
  const result=await decideMealOperation(db,userId,op.id,op.revision,"confirm");
  return { snapshot:await readMealSnapshot(db,userId), message:result.result?.message ?? "已保存。" };
}); }
export async function decideMealAction(id: string, revision: number, decision: "confirm" | "cancel") { return perform(userId => decideMealOperation(getDatabase(),userId,id,revision,decision)); }
export async function refreshMealAction(id: string, revision: number) { return perform(userId=>reviseMealOperation(getDatabase(),userId,id,revision)); }
export async function editMealPreviewAction(id: string, revision: number, index: number, action: MealAction) { return perform(async userId=>{
  const db=getDatabase(), current=await getMealOperation(db,userId,id), actions=[...current.draft.actions];
  if (!Number.isInteger(index) || index<0 || index>=actions.length) throw new Error("审核条目不存在。");
  actions[index]=action; return reviseMealOperation(db,userId,id,revision,actions);
}); }
