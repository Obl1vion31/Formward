import { addCalendarDays } from "../measurements/calendar";
import { localMeasurementDate } from "../measurements/entry-state";
import type { ReminderCatalog } from "../dashboard/daily-reminders";

export type AssistantAction = { label: string; href: string };
export type AssistantItem = { id: string; category: "meals" | "energy" | "body"; date: string; title: string; detail: string; action: AssistantAction };
export type AssistantContext = { generatedAt: string; localDate: string; timezone: string; pending: AssistantItem[]; suggestions: AssistantItem[] };

export const assistantRoutes = ["/dashboard", "/dashboard/meals", "/dashboard/energy", "/dashboard/measurements", "/dashboard/ai", "/dashboard/export"];
export const assistantAvailable = (pathname: string) => assistantRoutes.includes(pathname);

export function assistantTimezone(value: string | null): string {
  if (!value || value.length > 100) throw new Error("请选择有效的设备时区。");
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; }
  catch { throw new Error("请选择有效的设备时区。"); }
}

/** 只推导事项，不保存打卡、不推断个人测量或训练计划。 */
export function assistantContext(catalog: ReminderCatalog, now: Date, timezone: string, createdAt: string): AssistantContext {
  const zone = assistantTimezone(timezone), today = localMeasurementDate(now, zone), yesterday = addCalendarDays(today, -1);
  const createdOn = localMeasurementDate(new Date(createdAt), zone), pending: AssistantItem[] = [], suggestions: AssistantItem[] = [];
  if (yesterday >= createdOn) {
    const meal = catalog.meals.find(day => day.date === yesterday);
    if (meal && !meal.complete) pending.push({
      id: `meals:${yesterday}`, category: "meals", date: yesterday, title: "昨日饮食待核对",
      detail: meal.status === "incomplete" ? "这一天标记为未记全，可以继续补充" : meal.source === "record_change" ? "记录有变化，请重新确认是否已记全" : "已有餐次，尚未确认是否已记全",
      action: { label: meal.status === "incomplete" ? "编辑并补充" : "编辑并确认", href: `/dashboard/meals?date=${yesterday}&intent=edit` },
    });
    if (!meal) suggestions.push({ id: `meals:${yesterday}`, category: "meals", date: yesterday, title: "昨日尚无饮食记录", detail: "如有需要，可以补充已吃的餐次", action: { label: "补录饮食", href: `/dashboard/meals?date=${yesterday}&entry=1` } });
    const energy = catalog.energy.find(day => day.date === yesterday);
    if (!energy?.hasTotal) suggestions.push({ id: `energy:${yesterday}`, category: "energy", date: yesterday, title: energy ? "昨日全天消耗暂不可得" : "昨日尚无消耗记录", detail: energy ? "已有部分记录，可以补充全天读数" : "有设备读数时可以补录，未知值保留为空", action: { label: "补充消耗", href: `/dashboard/energy?date=${yesterday}&entry=1` } });
  }
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(now));
  for (const period of ["daytime", "evening"] as const) {
    if (hour < (period === "daytime" ? 6 : 18)) continue;
    const slot = catalog.body.find(row => row.date === today && row.period === period);
    if (slot?.recorded || slot?.blocked) continue;
    suggestions.push({ id: `body:${today}:${period}`, category: "body", date: today, title: `今日${period === "daytime" ? "晨间" : "晚间"}${slot?.estimated ? "尚无实测" : "尚无身体记录"}`, detail: "若已测量，可以补录；不需要每天测满两次", action: { label: "记录身体", href: `/dashboard/measurements?date=${today}&entry=${period}` } });
  }
  return { generatedAt: now.toISOString(), localDate: today, timezone: zone, pending, suggestions };
}

export function assistantQuickActions(today: string): AssistantAction[] {
  return [
    { label: "记录一餐", href: `/dashboard/meals?date=${today}&entry=1` },
    { label: "记录身体", href: `/dashboard/measurements?date=${today}&entry=daytime` },
    { label: "记录消耗", href: `/dashboard/energy?date=${today}&entry=1` },
  ];
}

export const assistantTools: AssistantAction[] = [
  { label: "查看教程", href: "/dashboard/tutorial" },
  { label: "AI 接入", href: "/dashboard/ai" },
  { label: "导出 Excel", href: "/dashboard/export" },
];
