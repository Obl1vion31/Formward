import { randomUUID } from "node:crypto";
import type { Database } from "../src/db/client";
import { provisionAccount } from "../src/features/auth/provision";
import { mutateTraining } from "../src/features/training/records";
import { eq } from "drizzle-orm";
import { energyDay, personalProfile } from "../src/db/schema";
import { addCalendarDays } from "../src/features/measurements/calendar";
export async function seedTrainingFixture(db: Database) {
  const suffix = randomUUID().slice(0, 8), password = "fictional-training-" + randomUUID(), email = "training-" + suffix + "@example.test";
  const user = await provisionAccount(db, { email, password, name: "虚构训练验收" });
  const empty = await provisionAccount(db, { email: "training-empty-" + suffix + "@example.test", password, name: "虚构训练空态" });
  await db.update(personalProfile).set({onboardingStep:"complete"}).where(eq(personalProfile.userId,user.id));
  await db.update(personalProfile).set({onboardingStep:"complete"}).where(eq(personalProfile.userId,empty.id));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const templateId = randomUUID();
  await mutateTraining(db, user.id, { kind: "template", operationId: randomUUID(), id: templateId, template: { name: "胸 · 肩 · 三头", exercises: [{ name: "杠铃卧推", sets: 3, reps: 10 }, { name: "上斜哑铃卧推", sets: 3, reps: 12 }, { name: "哑铃侧平举", sets: 3, reps: 15 }] } });
  await mutateTraining(db, user.id, { kind: "schedule", id: randomUUID(), operationId: randomUUID(), templateId, date: today });
  for (const offset of [2, 4, 6]) {
    const date = addCalendarDays(today, -offset), startedAt = new Date(date + "T02:00:00Z"), sessionId = randomUUID();
    let result = await mutateTraining(db, user.id, { kind: "start", id: sessionId, operationId: randomUUID(), date, timezone: "Asia/Shanghai" }, startedAt);
    result = await mutateTraining(db, user.id, { kind: "save", id: sessionId, operationId: randomUUID(), version: result.snapshot.sessions.find(s => s.id === sessionId)!.version, name: "虚构背部训练", exercises: [{ id: randomUUID(), name: "高位下拉", sets: [{ id: randomUUID(), weightKg: 35, reps: 12, completed: true }] }] });
    await mutateTraining(db, user.id, { kind: "finish", id: sessionId, operationId: randomUUID(), version: result.snapshot.sessions.find(s => s.id === sessionId)!.version }, new Date(startedAt.getTime() + (30 + offset * 5) * 60000));
  }
  await db.insert(energyDay).values({ id: randomUUID(), userId: user.id, date: today, timezone: "Asia/Shanghai", entryMode: "total", activityMode: "total", totalKcal: "2400.1250" });
  return { email, password, userId: user.id, empty: { email: "training-empty-" + suffix + "@example.test", userId: empty.id, password }, today };
}
