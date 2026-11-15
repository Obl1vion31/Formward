import { ApiError } from "./ai-identity";

export const membershipTiers = ["free", "beta", "plus", "pro"] as const;
export type MembershipTier = typeof membershipTiers[number];
export const membershipLabels = { free: "Free", beta: "内测版", plus: "Plus", pro: "Pro（暂未开放）", admin: "管理员" } as const;
type Account = { id: string; role?: string | null; banned?: boolean | null; membershipTier?: MembershipTier | null; entitlementVersion?: number };
export function accountEntitlements(account: Account) {
  const administrator = !!process.env.FORMWARD_CHAT_PILOT_USER_ID && account.id === process.env.FORMWARD_CHAT_PILOT_USER_ID && account.role === "owner";
  const tier = administrator ? "admin" : account.membershipTier ?? "free";
  const enabled = process.env.FORMWARD_CHAT_ENABLED === "1" && !account.banned;
  const chat = enabled && ["admin", "beta", "plus"].includes(tier);
  const mealRecognition = enabled && tier !== "pro" && process.env.FORMWARD_MEAL_AI_ENABLED !== "0";
  return { tier, label: membershipLabels[tier], version: account.entitlementVersion ?? 0, chat, mealRecognition, dailyBudgetCny: tier === "beta" ? 1 : tier === "admin" || tier === "plus" ? 2 : 0, dailyRecognitionLimit: tier === "free" ? 4 : null, devices: true as const };
}
export type AccountEntitlements = ReturnType<typeof accountEntitlements>;
export function assertAssistantEntitlement(account: Account, purpose: "chat" | "meal_entry" = "chat") {
  const result = accountEntitlements(account);
  if (!(purpose === "meal_entry" ? result.mealRecognition : result.chat)) throw new ApiError(403, purpose === "meal_entry" ? "meal_ai_disabled" : "chat_unavailable", purpose === "meal_entry" ? "饮食识图暂不可用，手动填写仍可使用。" : "当前档位暂未开放聊天，可继续手动记录或拍照录入饮食。");
  return result;
}
