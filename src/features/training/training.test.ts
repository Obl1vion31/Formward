import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import * as schema from "../../db/schema";
import { webSessionContext } from "../auth/account-security";
import { mutateTraining, readTraining } from "./records";
import { exercisesSchema, trainingInputSchema } from "./model";

const pg = new PGlite(), db = drizzle(pg, { schema }) as unknown as Database;
before(async () => { await migrate(drizzle(pg), { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
async function owner() { const id = randomUUID(); await db.insert(schema.user).values({ id, name: "虚构训练用户", email: id + "@example.test" }); return id; }
const startInput = () => ({ kind: "start" as const, id: randomUUID(), operationId: randomUUID(), date: "2026-11-08", timezone: "Asia/Shanghai" });
const change = (kind: "pause" | "resume" | "finish" | "discard", id: string, version: number) => ({ kind, id, version, operationId: randomUUID() });
const exercises = () => [{ id: randomUUID(), name: "虚构卧推", sets: [{ id: randomUUID(), weightKg: null, reps: 12, completed: true }, { id: randomUUID(), weightKg: 0, reps: null, completed: false }] }];
test("训练输入保留未知与0，拒绝无效数值、伪造归属和重复组", () => {
  assert.ok(exercisesSchema.safeParse(exercises()).success);
  const bad = exercises(); bad[0].sets[0].reps = null as unknown as number; assert.equal(exercisesSchema.safeParse(bad).success, false);
  const duplicate = exercises(); duplicate[0].sets[1].id = duplicate[0].sets[0].id; assert.equal(exercisesSchema.safeParse(duplicate).success, false);
  assert.equal(trainingInputSchema.safeParse({ ...startInput(), userId: "spoof" }).success, false);
  assert.equal(trainingInputSchema.safeParse({ ...startInput(), timezone: "not-a-timezone" }).success, false);
  assert.equal(trainingInputSchema.safeParse({ ...startInput(), date: "2026-02-30" }).success, false);
  assert.equal(trainingInputSchema.safeParse({ ...startInput(), date: "2026-99-99" }).success, false);
  assert.equal(exercisesSchema.safeParse([{ ...exercises()[0], sets: [{ id: randomUUID(), weightKg: -1, reps: 1, completed: true }] }]).success, false);
});
test("开始、自动保存、暂停继续、结束与回看不改变全天消耗", async () => {
  const userId = await owner(), input = startInput(), started = new Date("2026-11-08T02:00:00Z");
  await db.insert(schema.energyDay).values({ id: randomUUID(), userId, date: input.date, timezone: input.timezone, entryMode: "total", activityMode: "total", totalKcal: "2400.1250" });
  const before = await db.select().from(schema.energyDay).where(eq(schema.energyDay.userId, userId));
  let result = await mutateTraining(db, userId, input, started), session = result.snapshot.sessions[0];
  result = await mutateTraining(db, userId, { kind: "save", operationId: randomUUID(), id: session.id, version: session.version, name: "胸部训练", exercises: exercises() }); session = result.snapshot.sessions[0];
  result = await mutateTraining(db, userId, change("pause", session.id, session.version), new Date(started.getTime() + 120000)); session = result.snapshot.sessions[0];
  assert.equal(session.elapsedSeconds, 120); assert.equal(session.resumedAt, null);
  result = await mutateTraining(db, userId, change("resume", session.id, session.version), new Date(started.getTime() + 300000)); session = result.snapshot.sessions[0];
  const finish = change("finish", session.id, session.version);
  result = await mutateTraining(db, userId, finish, new Date(started.getTime() + 360000)); session = result.snapshot.sessions[0];
  assert.equal(session.status, "completed"); assert.equal(session.elapsedSeconds, 180); assert.equal(session.exercises[0].sets.length, 1); assert.equal(session.exercises[0].sets[0].weightKg, null);
  assert.deepEqual(await db.select().from(schema.energyDay).where(eq(schema.energyDay.userId, userId)), before);
  assert.equal((await db.select().from(schema.activity).where(eq(schema.activity.userId, userId))).length, 0);
  assert.equal((await mutateTraining(db, userId, finish)).snapshot.sessions.length, 1);
  assert.equal((await mutateTraining(db, userId, change("finish", session.id, session.version))).snapshot.sessions.length, 1);
});
test("开始与请求重试幂等，并发开始只产生一场进行中训练", async () => {
  const userId = await owner(), input = startInput();
  const results = await Promise.all([mutateTraining(db, userId, input), mutateTraining(db, userId, startInput())]);
  assert.equal(results[0].entityId, results[1].entityId);
  assert.equal((await readTraining(db, userId)).sessions.length, 1);
  assert.equal((await mutateTraining(db, userId, input)).entityId, input.id);
  await assert.rejects(mutateTraining(db, userId, { ...input, date: "2026-11-09" }), /同一请求/);
});
test("无完成组不能结束，放弃保留审计且允许重新开始", async () => {
  const userId = await owner(), result = await mutateTraining(db, userId, startInput()), s = result.snapshot.sessions[0];
  await assert.rejects(mutateTraining(db, userId, change("finish", s.id, s.version)), /至少一组/);
  await mutateTraining(db, userId, change("discard", s.id, s.version));
  assert.equal((await readTraining(db, userId)).sessions.length, 0);
  assert.ok((await db.select().from(schema.trainingEvent).where(eq(schema.trainingEvent.userId, userId))).some(e => e.action === "discard"));
  assert.equal((await mutateTraining(db, userId, startInput())).snapshot.sessions.length, 1);
});
test("跨账号读取与引用被隔离，旧版本不能覆盖最新进度", async () => {
  const a = await owner(), b = await owner(), result = await mutateTraining(db, a, startInput()), s = result.snapshot.sessions[0];
  assert.equal((await readTraining(db, b)).sessions.length, 0);
  await assert.rejects(mutateTraining(db, b, change("pause", s.id, s.version)), /不存在/);
  await mutateTraining(db, a, { kind: "save", operationId: randomUUID(), id: s.id, version: s.version, name: "训练甲", exercises: exercises() });
  await assert.rejects(mutateTraining(db, a, { kind: "save", operationId: randomUUID(), id: s.id, version: s.version, name: "训练乙", exercises: [] }), /其他页面/);
  assert.equal((await readTraining(db, a)).sessions[0].name, "训练甲");
});
test("模板排期独立保存快照，完成才标记计划，取消不改训练事实", async () => {
  const a = await owner(), b = await owner(), templateId = randomUUID();
  const content = { name: "虚构模板", exercises: [{ name: "虚构深蹲", sets: 3, reps: 10 }] };
  await mutateTraining(db, a, { kind: "template", operationId: randomUUID(), id: templateId, template: content });
  await assert.rejects(mutateTraining(db, b, { kind: "schedule", operationId: randomUUID(), id: randomUUID(), templateId, date: "2026-11-08" }), /不存在/);
  const planInput = { kind: "schedule", operationId: randomUUID(), id: randomUUID(), templateId, date: "2026-11-08" };
  let result = await mutateTraining(db, a, planInput), plan = result.snapshot.plans[0];
  assert.equal(result.snapshot.sessions.length, 0);
  await db.update(schema.trainingTemplate).set({ content: { ...content, name: "改后的模板" } }).where(eq(schema.trainingTemplate.id, templateId));
  result = await mutateTraining(db, a, { ...startInput(), planId: plan.id }); let s = result.snapshot.sessions[0];
  assert.equal(s.name, content.name); assert.equal(s.exercises[0].sets.length, 3);
  result = await mutateTraining(db, a, { kind: "save", operationId: randomUUID(), id: s.id, version: s.version, name: s.name, exercises: exercises() }); s = result.snapshot.sessions[0];
  result = await mutateTraining(db, a, change("finish", s.id, s.version)); plan = result.snapshot.plans[0];
  assert.equal(plan.status, "completed"); assert.equal(result.snapshot.sessions[0].status, "completed");
});
test("账号停用与会话撤销后拒绝训练写入", async () => {
  const id = await owner(); await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, id));
  await assert.rejects(mutateTraining(db, id, startInput()), /失效/);
  const a = await owner();
  await assert.rejects(webSessionContext.run({ userId: a, sessionId: randomUUID(), accessVersion: 0 }, () => mutateTraining(db, a, startInput())), /登录已失效/);
});
test("0033迁移仅新增训练四表，全部既有表字段和数据保持", async () => {
  const local = new PGlite();
  try {
    for (const file of (await readdir("drizzle")).filter(f => /^\d{4}_.*\.sql$/.test(f) && f < "0033").sort()) await local.exec(await readFile("drizzle/" + file, "utf8"));
    await local.exec("INSERT INTO users(id,name,email) VALUES ('training-old','虚构旧用户','training-old@example.test'); INSERT INTO activities(id,user_id,local_date,timezone,name,calories_kcal) VALUES ('old-act','training-old','2026-11-01','Asia/Shanghai','虚构运动',123.4567)");
    const tables = (await local.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(t => t.table_name);
    const columns = (await local.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
    const rows = new Map(); for (const table of tables) rows.set(table, (await local.query('SELECT * FROM "' + table + '"')).rows);
    await local.exec(await readFile("drizzle/0033_training_sessions.sql", "utf8"));
    for (const table of tables) assert.deepEqual((await local.query('SELECT * FROM "' + table + '"')).rows, rows.get(table), table);
    assert.deepEqual((await local.query<{ table_name: string }>("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows.filter(c => tables.includes(c.table_name)), columns);
    assert.equal((await local.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows.length, tables.length + 4);
  } finally { await local.close(); }
});
