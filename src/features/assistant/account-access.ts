import type { Database } from "../../db/client";
import { requireActiveAccount } from "../auth/account-security";
import { accountEntitlements } from "../auth/entitlements";
import { chatBalance } from "./chat-model";
import { chatUsage } from "./chat-store";

export async function loadAssistantEntitlements(db: Database, userId: string) {
  const entitlement = accountEntitlements(await requireActiveAccount(db, userId)), usage = await chatUsage(db, userId);
  return { accountId: userId, entitlement, usage: { percent: usage.percent, ...chatBalance(usage), recognition: usage.recognition } };
}
