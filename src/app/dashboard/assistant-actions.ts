"use server";
import { headers } from "next/headers";
import { withCurrentSession } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { dismissAssistantMealReminder } from "@/features/assistant/server";

export async function dismissAssistantReminderAction(input: { id: string; timezone: string }) {
  try {
    return await withCurrentSession(await headers(), async user => {
      await dismissAssistantMealReminder(getDatabase(), user, input.id, input.timezone);
      return { ok: true as const, id: input.id };
    });
  } catch {
    return { ok: false as const, error: "忽略未保存，请重试。" };
  }
}
