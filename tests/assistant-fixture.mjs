import { randomUUID, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import { provisionAccount } from "../src/features/auth/provision.ts";
import { seedDetailHierarchy } from "./detail-hierarchy-fixture.mjs";
import { saveImportedMeasurements } from "../src/features/measurements/records.ts";
import { addCalendarDays } from "../src/features/measurements/calendar.ts";
import { readMealSnapshot } from "../src/features/meals/records.ts";
import { dailyTotals } from "../src/features/meals/model.ts";
import { setMealDayStatus } from "../src/features/meals/day-status.ts";

/** 仅由隔离浏览器环境调用，所有账号、数值和测量均为虚构。 */
export async function seedAssistantFixture(db, today) {
  const account = { email: "assistant@example.test", password: "formward-assistant-demo" };
  const owner = await provisionAccount(db, { ...account, name: "虚构助手演示" });
  await db.delete(schema.personalProfile).where(eq(schema.personalProfile.userId, owner.id));
  await db.update(schema.user).set({ createdAt: new Date(addCalendarDays(today, -40) + "T00:00:00Z") }).where(eq(schema.user.id, owner.id));
  await seedDetailHierarchy(db, owner.id, today, { stressOffset: -37 });
  for (const day of dailyTotals((await readMealSnapshot(db, owner.id)).meals).filter(day => day.date < addCalendarDays(today, -1))) await setMealDayStatus(db, owner.id, { operationId: randomUUID(), date: day.date, status: "complete", version: day.day.version, contentDigest: day.day.contentDigest });
  const actor = { userId: owner.id, actorId: owner.id };
  const rows = Array.from({ length: 21 }, (_, i) => i + 1).filter(offset => ![2, 4, 6, 9, 11, 14, 16].includes(offset)).flatMap((offset, index) => {
    const date = addCalendarDays(today, -offset);
    return ["daytime", "evening"].map((period, k) => ({ sourceLocalTime: `${date} ${k ? "20:12" : "07:25"}:00`, weightKg: (70.14 + offset * .037 + (k ? .51 : 0)).toFixed(2), bodyFatPercent: (20.8 + offset * .014 + (k ? .12 : 0)).toFixed(2), fasting: !k, fastingSource: k ? "evening_rule" : "user_confirmed", timezone: "Asia/Shanghai", sourceRow: index * 2 + k + 2 }));
  });
  rows.push(...[{ offset: 4, weightKg: "70.29", bodyFatPercent: null }, { offset: 6, weightKg: null, bodyFatPercent: "20.91" }].map(({ offset, ...values }, index) => ({ ...values, sourceLocalTime: `${addCalendarDays(today, -offset)} 07:25:00`, fasting: true, fastingSource: "user_confirmed", timezone: "Asia/Shanghai", sourceRow: 80 + index })));
  await saveImportedMeasurements(db, { ...actor, fileDigest: createHash("sha256").update(randomUUID()).digest("hex"), sourceLabel: "虚构称重样本", captureChannel: "file", records: rows });
  await resetAssistantPending(db, owner.id, today);
  const other = await provisionAccount(db, { email: "assistant-empty@example.test", password: "formward-assistant-empty", name: "虚构空账号" });
  await db.delete(schema.personalProfile).where(eq(schema.personalProfile.userId, other.id));
  return { account, userId: owner.id, other: { id: other.id, email: "assistant-empty@example.test", password: "formward-assistant-empty" }, today, observed: addCalendarDays(today, -3), anotherObserved: addCalendarDays(today, -5), partialWeight: addCalendarDays(today, -4), partialFat: addCalendarDays(today, -6) };
}
export async function resetAssistantPending(db, userId, today) {
  const date = addCalendarDays(today, -1), day = dailyTotals((await readMealSnapshot(db, userId, [date])).meals)[0].day;
  await setMealDayStatus(db, userId, { operationId: randomUUID(), date, status: "incomplete", version: day.version, contentDigest: day.contentDigest });
}
