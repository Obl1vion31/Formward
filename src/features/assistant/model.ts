import { addCalendarDays } from "../measurements/calendar";
import { localMeasurementDate } from "../measurements/entry-state";
import type { ReminderCatalog } from "../dashboard/daily-reminders";

import { energyDeviceStatusLabel, type EnergyDeviceCoverage } from "../data-sources/energy-coverage";
import type { MealDayInput } from "../meals/model";

export type AssistantAction = { label: string; href: string; previewId?:string };
export type DailyReminderKind = "body" | "meals" | "energy" | "training";
export type AssistantItem = { id: string; category: DailyReminderKind | "ai"; date: string; title: string; detail: string; action: AssistantAction; dismissible?: boolean; expiresAt?: string; mealStatus?: "unconfirmed" | "incomplete"; mealConfirmation?: Pick<MealDayInput,"version"|"contentDigest">; review?: {source:string; title:string; value:string; detail:string; kind?:"meal"} };
export type AssistantContext = { generatedAt: string; localDate: string; timezone: string; pending: AssistantItem[] };
export const assistantPath = "/dashboard/assistant";
export const assistantRoutes = ["/dashboard", "/dashboard/meals", "/dashboard/training", "/dashboard/energy", "/dashboard/measurements", "/dashboard/ai", "/dashboard/export", "/dashboard/sources"];
export const assistantAvailable = (pathname: string) => assistantRoutes.includes(pathname);
export function assistantTimezone(value: string | null): string {
  if (!value || value.length > 100) throw new Error("请选择有效的设备时区。");
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; }
  catch { throw new Error("请选择有效的设备时区。"); }
}
export function assistantReminderId(kind: DailyReminderKind, date: string) {
  return kind + ":" + date + (kind === "body" ? ":daytime" : "");
}

export function assistantContext(catalog: ReminderCatalog, now: Date, timezone: string, createdAt: string, device: EnergyDeviceCoverage | null = null): AssistantContext {
  const zone = assistantTimezone(timezone), today = localMeasurementDate(now, zone), yesterday = addCalendarDays(today, -1);
  const createdOn = localMeasurementDate(new Date(createdAt), zone), pending: AssistantItem[] = [];
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(now));
  const morning = catalog.body.find(row => row.date === today && row.period === "daytime");
  if (hour >= 6 && !(morning?.weightRecorded ?? morning?.recorded)) {
    pending.push({
      id: assistantReminderId("body", today), category: "body", date: today, title: "空腹体重", dismissible: true,
      detail: morning?.blocked ? "晨间记录待核对" : "还没记录",
      action: { label: morning?.blocked ? "核对记录" : "记录体重", href: "/dashboard/measurements?date=" + today + (morning?.blocked ? "&intent=edit" : "&entry=daytime") },
    });
  }
  if (yesterday >= createdOn) {
    const meal = catalog.meals.find(day => day.date === yesterday);
    if (!meal?.complete) {
      const mealStatus = meal?.status === "incomplete" ? "incomplete" : "unconfirmed";
      pending.push({
        id: assistantReminderId("meals", yesterday), category: "meals", date: yesterday,
        title: !meal ? "没有饮食记录" : mealStatus === "incomplete" ? "饮食未记全" : "饮食未确认",
        ...(meal ? { mealStatus, mealConfirmation: meal.confirmation } : {}),
        detail: meal?.count ? "已记 " + meal.count + " 餐" : "",
        action: { label: meal ? "查看餐次" : "补记饮食", href: "/dashboard/meals?date=" + yesterday + (meal ? "&intent=edit" : "&entry=1") },
        dismissible: true,
      });
    }
    const energy = catalog.energy.find(day => day.date === yesterday);
    if (!energy?.hasTotal) {
      pending.push({
        id: assistantReminderId("energy", yesterday), category: "energy", date: yesterday, dismissible: true,
        title: "全天消耗未记录", detail: device ? energyDeviceStatusLabel(device) : "",
        action: { label: device ? "查看同步" : "补记消耗", href: device ? "/dashboard/sources" : "/dashboard/energy?date=" + yesterday + "&entry=1" },
      });
    }
  }
  return { generatedAt: now.toISOString(), localDate: today, timezone: zone, pending };
}
export const assistantTools: AssistantAction[] = [
  { label: "使用说明", href: "/dashboard/tutorial" },
  { label: "AI 接入", href: "/dashboard/ai" },
  { label: "导出 Excel", href: "/dashboard/export" },
];
