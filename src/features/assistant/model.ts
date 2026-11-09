import { addCalendarDays } from "../measurements/calendar";
import { localMeasurementDate } from "../measurements/entry-state";
import type { ReminderCatalog } from "../dashboard/daily-reminders";

export type AssistantAction = { label: string; href: string };
export type AssistantItem = { id: string; category: "meals" | "energy" | "body" | "ai" | "training"; date: string; title: string; detail: string; action: AssistantAction; dismissible?: boolean; expiresAt?: string };
export type AssistantContext = { generatedAt: string; localDate: string; timezone: string; pending: AssistantItem[]; suggestions: AssistantItem[] };
export const assistantRoutes = ["/dashboard", "/dashboard/meals", "/dashboard/training", "/dashboard/energy", "/dashboard/measurements", "/dashboard/ai", "/dashboard/export", "/dashboard/sources"];
export const assistantAvailable = (pathname: string) => assistantRoutes.includes(pathname);
export function assistantTimezone(value: string | null): string {
  if (!value || value.length > 100) throw new Error("请选择有效的设备时区。");
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; }
  catch { throw new Error("请选择有效的设备时区。"); }
}
export function assistantContext(catalog: ReminderCatalog, now: Date, timezone: string, createdAt: string): AssistantContext {
  const zone = assistantTimezone(timezone), today = localMeasurementDate(now, zone), yesterday = addCalendarDays(today, -1);
  const createdOn = localMeasurementDate(new Date(createdAt), zone), pending: AssistantItem[] = [], suggestions: AssistantItem[] = [];
  if (yesterday >= createdOn) {
    const meal = catalog.meals.find(day => day.date === yesterday);
    if (!meal?.complete) pending.push({
      id: `meals:${yesterday}`, category: "meals", date: yesterday, title: "昨天的饮食是不是还没记全？",
      detail: !meal ? "还没有饮食记录，可以补记，也可以忽略这一天。" : meal.source === "record_change" ? "餐次有修改，尚未重新确认是否记全。" : meal.status === "incomplete" ? "这一天标记为未记全。" : "已有餐次，尚未确认是否记全。",
      action: { label: meal ? "查看并确认" : "补记饮食", href: `/dashboard/meals?date=${yesterday}&${meal ? "intent=edit" : "entry=1"}` }, dismissible: true,
    });
    const energy = catalog.energy.find(day => day.date === yesterday);
    if (!energy?.hasTotal) suggestions.push({ id: `energy:${yesterday}`, category: "energy", date: yesterday, title: "补记消耗", detail: energy ? "可以补充全天读数，未知值保持为空。" : "有设备读数时可以补记。", action: { label: "补记消耗", href: `/dashboard/energy?date=${yesterday}&entry=1` } });
  }
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(now));
  for (const period of ["daytime", "evening"] as const) {
    if (hour < (period === "daytime" ? 6 : 18)) continue;
    const slot = catalog.body.find(row => row.date === today && row.period === period);
    if (!slot?.recorded && !slot?.blocked) suggestions.push({ id: `body:${today}:${period}`, category: "body", date: today, title: period === "daytime" ? "晨间测量" : "晚间测量", detail: "测量过再补记，不需要每天测满两次。", action: { label: "记录测量", href: `/dashboard/measurements?date=${today}&entry=${period}` } });
  }
  return { generatedAt: now.toISOString(), localDate: today, timezone: zone, pending, suggestions };
}
export function assistantQuickActions(today: string): AssistantAction[] {
  return [
    { label: "记录饮食", href: `/dashboard/meals?date=${today}&entry=1` },
    { label: "记录测量", href: `/dashboard/measurements?date=${today}&entry=daytime` },
    { label: "记录消耗", href: `/dashboard/energy?date=${today}&entry=1` },
  ];
}
export const assistantTools: AssistantAction[] = [
  { label: "使用说明", href: "/dashboard/tutorial" },
  { label: "AI 接入", href: "/dashboard/ai" },
  { label: "导出 Excel", href: "/dashboard/export" },
];
