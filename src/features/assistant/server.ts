import type { Database } from "../../db/client";
import { readMealSnapshot } from "../meals/records";
import { readEnergySnapshot } from "../activities/records";
import { listMeasurements } from "../measurements/records";
import { measurementDisplay } from "../measurements/editing";
import { localMeasurementDate } from "../measurements/entry-state";
import { addCalendarDays } from "../measurements/calendar";
import { reminderCatalog } from "../dashboard/daily-reminders";
import { assistantContext, assistantTimezone } from "./model";

export async function readAssistantContext(db: Database, user: { id: string; createdAt: Date }, timezone: string, now = new Date()) {
  const zone = assistantTimezone(timezone), today = localMeasurementDate(now, zone), dates = [addCalendarDays(today, -1), today];
  // 单连接隔离数据库也可运行；只读取两日，不读取食材库、图片或退役资料。
  const meals = await readMealSnapshot(db, user.id, dates);
  const energy = await readEnergySnapshot(db, user.id, dates);
  const records = await listMeasurements(db, user.id, dates);
  return assistantContext(reminderCatalog(meals.meals, records.map(measurementDisplay), energy), now, zone, user.createdAt.toISOString());
}
