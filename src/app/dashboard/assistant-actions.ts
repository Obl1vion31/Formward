"use server";
import { headers } from "next/headers";
import { withCurrentSession } from "@/features/auth/server";
import { ApiError } from "@/features/auth/ai-identity";
import { getDatabase } from "@/db/client";
import { dismissAssistantReminder } from "@/features/assistant/server";

export async function dismissAssistantReminderAction(input: { id: string; timezone: string }) {
  try {
    return await withCurrentSession(await headers(), async user => {
      await dismissAssistantReminder(getDatabase(), user, input.id, input.timezone);
      return { ok: true as const, id: input.id };
    });
  } catch (error) {
    const message = error instanceof ApiError && error.code === "invalid_reminder" ? error.message : "忽略未保存，请重试。";
    return { ok: false as const, error: message };
  }
}
