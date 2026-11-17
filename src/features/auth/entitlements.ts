import { ApiError } from "./ai-identity";
import type { MembershipPolicy } from "./membership-policy";

export const membershipTiers = ["free", "beta", "plus", "pro"] as const;
export type MembershipTier = typeof membershipTiers[number];
export const membershipLabels = { free: "Free", beta: "内测版", plus: "Plus", pro: "Pro（暂未开放）", admin: "管理员" } as const;
type Account = { id: string; role?: string | null; banned?: boolean | null; membershipTier?: MembershipTier | null; membershipTierId?: string | null; membershipPolicy?: MembershipPolicy; entitlementVersion?: number; aiPaused?: boolean; aiDailyBudgetCents?: number | null; aiDailyRecognitionLimit?: number | null };
export function accountEntitlements(account: Account) {
  const administrator = !!process.env.FORMWARD_CHAT_PILOT_USER_ID && account.id === process.env.FORMWARD_CHAT_PILOT_USER_ID && account.role === "owner";
  if (!account.membershipPolicy && process.env.FORMWARD_MANAGED_MEMBERSHIP_REQUIRED === "1") throw new ApiError(503,"membership_configuration","会员配置尚未就绪，请稍后重试。");
  const legacy = administrator ? "admin" : account.membershipTier ?? "free", policy=account.membershipPolicy;
  const tier = policy?.id ?? legacy, active=policy?policy.active&&!policy.archivedAt:true;
  const enabled = process.env.FORMWARD_CHAT_ENABLED === "1" && !account.banned && !account.aiPaused && active;
  const chat = enabled && (policy?policy.chatEnabled:["admin", "beta", "plus"].includes(tier));
  const mealRecognition = enabled && (policy?policy.mealRecognitionEnabled:tier !== "pro") && process.env.FORMWARD_MEAL_AI_ENABLED !== "0";
  const defaultBudget = policy?(policy.dailyBudgetCents??0)/100:legacy === "beta" ? 1 : legacy === "admin" || legacy === "plus" ? 2 : 0;
  return { tier, label: policy?.name??membershipLabels[legacy], version: account.entitlementVersion ?? 0, chat, mealRecognition,
    dailyBudgetCny: account.aiDailyBudgetCents == null ? defaultBudget : account.aiDailyBudgetCents / 100,
    amountLimited: (policy?policy.dailyBudgetCents!==null:legacy !== "free") || account.aiDailyBudgetCents != null,
    dailyRecognitionLimit: account.aiDailyRecognitionLimit ?? (policy?policy.dailyRecognitionLimit:legacy === "free" ? 4 : null), paused: !!account.aiPaused||!active, devices: true as const };
}
export type AccountEntitlements = ReturnType<typeof accountEntitlements>;
export function assertAssistantEntitlement(account: Account, purpose: "chat" | "meal_entry" = "chat") {
  const result = accountEntitlements(account);
  if (!(purpose === "meal_entry" ? result.mealRecognition : result.chat)) throw new ApiError(403, purpose === "meal_entry" ? "meal_ai_disabled" : "chat_unavailable", purpose === "meal_entry" ? "饮食识图暂不可用，手动填写仍可使用。" : "当前档位暂未开放聊天，可继续手动记录或拍照录入饮食。");
  return result;
}
