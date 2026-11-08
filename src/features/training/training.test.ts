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
import { exercisesSchema, trainingInputSchema, trainingEntry, type TrainingSnapshot, type TrainingSession } from "./model";

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
  const userId = await owner(), input = startInput(), second = startInput();
  const results = await Promise.all([mutateTraining(db, userId, input), mutateTraining(db, userId, second)]);
  assert.equal(results[0].entityId, results[1].entityId);
  assert.equal((await readTraining(db, userId)).sessions.length, 1);
  assert.equal((await mutateTraining(db, userId, input)).entityId, input.id);
  await assert.rejects(mutateTraining(db, userId, { ...input, date: "2026-11-09" }), /同一请求/);
  await mutateTraining(db,userId,change("discard",results[0].entityId,1));
  assert.equal((await mutateTraining(db,userId,second)).snapshot.sessions.length,0);
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
  const later=await mutateTraining(db,a,{kind:"schedule",operationId:randomUUID(),id:randomUUID(),templateId,date:"2026-11-09"}),p=later.snapshot.plans.find(p=>p.date==="2026-11-09")!;
  const cancelled=await mutateTraining(db,a,{kind:"unschedule",operationId:randomUUID(),id:p.id,version:p.version});
  assert.equal(cancelled.snapshot.sessions[0].status,"completed");assert.equal(cancelled.snapshot.plans.some(row=>row.id===p.id),false);
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

test('时长和距离完整保存回看，模板目标不自动计为完成', async () => {
  const userId = await owner(), templateId = randomUUID();
  await mutateTraining(db, userId, { kind: 'template', operationId: randomUUID(), id: templateId, template: { name: '混合训练演示', exercises: [{ name: '平板支撑', recordingType: 'duration', sets: 1, reps: null, durationSeconds: 30 }, { name: '跑步机跑步', recordingType: 'cardio', sets: 1, reps: null, distanceMeters: 2000 }] } });
  let result = await mutateTraining(db, userId, { ...startInput(), templateId }), session = result.snapshot.sessions[0];
  assert.equal(session.exercises[0].sets[0].completed, false); assert.equal(session.exercises[0].sets[0].durationSeconds, null);
  session.exercises[0].sets[0] = { ...session.exercises[0].sets[0], durationSeconds: 35, completed: true };
  session.exercises[1].sets[0] = { ...session.exercises[1].sets[0], durationSeconds: 900, distanceMeters: 2100, completed: true };
  result = await mutateTraining(db, userId, { kind: 'save', id: session.id, version: session.version, operationId: randomUUID(), name: session.name, exercises: session.exercises }); session = result.snapshot.sessions[0];
  const finished = await mutateTraining(db, userId, change('finish', session.id, session.version));
  assert.equal(finished.snapshot.sessions[0].exercises[0].sets[0].durationSeconds, 35); assert.equal(finished.snapshot.sessions[0].exercises[1].sets[0].distanceMeters, 2100); assert.equal(finished.snapshot.templates[0].exercises[0].durationSeconds, 30);
});

async function completedFixture(userId: string, withPlan = false) {
  const templateId = randomUUID(), planId = randomUUID();
  if (withPlan) {
    await mutateTraining(db, userId, { kind: 'template', operationId: randomUUID(), id: templateId, template: { name: '虚构胸部训练', exercises: [{ name: '虚构卧推', sets: 1, reps: 12 }] } });
    await mutateTraining(db, userId, { kind: 'schedule', operationId: randomUUID(), id: planId, templateId, date: '2026-11-08' });
  }
  let result = await mutateTraining(db, userId, { ...startInput(), ...(withPlan ? { planId } : {}) });
  let session = result.snapshot.sessions.find(s => s.status === 'active')!;
  result = await mutateTraining(db, userId, { kind: 'save', operationId: randomUUID(), id: session.id, version: session.version, name: session.name, exercises: exercises() });
  session = result.snapshot.sessions.find(s => s.id === session.id)!;
  result = await mutateTraining(db, userId, change('finish', session.id, session.version));
  return { result, session: result.snapshot.sessions.find(s => s.id === session.id)!, planId, templateId };
}
const deletion = (session: TrainingSession) => ({ kind: 'delete_completed' as const, operationId: randomUUID(), id: session.id, version: session.version });

test('删除已完成训练永久移除会话，保留完整审计和消耗，重复请求只写一次', async () => {
  const userId = await owner(), { session } = await completedFixture(userId);
  await db.insert(schema.energyDay).values({ id: randomUUID(), userId, date: session.date, timezone: session.timezone, entryMode: 'total', activityMode: 'total', totalKcal: '2400.1250' });
  const energy = await db.select().from(schema.energyDay).where(eq(schema.energyDay.userId, userId)), input = deletion(session);
  const result = await mutateTraining(db, userId, input);
  assert.equal(result.snapshot.sessions.length, 0);
  assert.equal((await db.select().from(schema.trainingSession).where(eq(schema.trainingSession.id, session.id))).length, 0);
  assert.deepEqual(await db.select().from(schema.energyDay).where(eq(schema.energyDay.userId, userId)), energy);
  const event = (await db.select().from(schema.trainingEvent).where(eq(schema.trainingEvent.userId, userId))).find(e => e.operationId === input.operationId)!;
  assert.equal(event.origin, 'manual'); assert.equal(event.actorId, userId);
  const before = event.snapshot.before as { session: { id: string; exercises: unknown } };
  assert.equal(before.session.id, session.id); assert.deepEqual(before.session.exercises, session.exercises);
  assert.equal((await mutateTraining(db, userId, input)).snapshot.sessions.length, 0);
  assert.equal((await db.select().from(schema.trainingEvent).where(eq(schema.trainingEvent.userId, userId))).filter(e => e.action === 'delete_completed').length, 1);
  await assert.rejects(mutateTraining(db, userId, { ...input, id: randomUUID() }), /同一请求/);
});
test('删除计划的最后一场完成记录恢复待练并递增计划版本，模板目标保留', async () => {
  const userId = await owner(), fixture = await completedFixture(userId, true), plan = fixture.result.snapshot.plans[0];
  const result = await mutateTraining(db, userId, deletion(fixture.session));
  assert.equal(result.snapshot.plans[0].status, 'planned'); assert.equal(result.snapshot.plans[0].version, plan.version + 1);
  assert.deepEqual(result.snapshot.templates, fixture.result.snapshot.templates);
  assert.deepEqual(result.snapshot.plans[0].content, plan.content);
  const restarted = await mutateTraining(db, userId, { ...startInput(), planId: plan.id });
  assert.equal(restarted.snapshot.sessions[0].planId, plan.id); assert.equal(restarted.snapshot.sessions[0].exercises[0].sets[0].completed, false);
});
test('同一计划还有完成记录时保持完成，删除最后一场才恢复待练', async () => {
  const userId = await owner(), fixture = await completedFixture(userId, true);
  const [raw] = await db.select().from(schema.trainingSession).where(eq(schema.trainingSession.id, fixture.session.id));
  const secondId = randomUUID(); await db.insert(schema.trainingSession).values({ ...raw, id: secondId });
  let result = await mutateTraining(db, userId, deletion(fixture.session));
  assert.equal(result.snapshot.plans[0].status, 'completed'); assert.equal(result.snapshot.sessions.length, 1);
  result = await mutateTraining(db, userId, deletion(result.snapshot.sessions[0]));
  assert.equal(result.snapshot.plans[0].status, 'planned'); assert.equal(result.snapshot.sessions.length, 0);
});
test('完成训练删除校验归属、版本、完成状态与网页来源，不开放AI删除', async () => {
  const userId = await owner(), other = await owner(), { session } = await completedFixture(userId), input = deletion(session);
  await assert.rejects(mutateTraining(db, other, input), /不存在/);
  await assert.rejects(mutateTraining(db, userId, { ...input, version: session.version + 1 }), /其他页面/);
  await assert.rejects(mutateTraining(db, userId, input, new Date(), 'ai'), /网页确认/);
  assert.equal((await readTraining(db, userId)).sessions.length, 1);
  const active = await mutateTraining(db, userId, startInput()), ongoing = active.snapshot.sessions.find(s => s.status === 'active')!;
  await assert.rejects(mutateTraining(db, userId, deletion(ongoing)), /只能删除已完成/);
  const paused = await mutateTraining(db, userId, change('pause', ongoing.id, ongoing.version));
  await assert.rejects(mutateTraining(db, userId, deletion(paused.snapshot.sessions.find(s => s.id === ongoing.id)!)), /只能删除已完成/);
  assert.equal(trainingInputSchema.safeParse({ ...input, userId: other }).success, false);
  assert.equal(trainingInputSchema.safeParse({ ...input, version: 0 }).success, false);
});
test('删除审计失败会回滚正式会话、计划状态及版本', async () => {
  const userId = await owner(), fixture = await completedFixture(userId, true);
  await pg.exec("CREATE FUNCTION fail_completed_delete_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'delete_completed' THEN RAISE EXCEPTION 'fictional delete audit failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_completed_delete_audit BEFORE INSERT ON training_events FOR EACH ROW EXECUTE FUNCTION fail_completed_delete_audit();");
  try { await assert.rejects(mutateTraining(db, userId, deletion(fixture.session)), (error: unknown) => error instanceof Error && error.cause instanceof Error && error.cause.message.includes('fictional delete audit failure')); }
  finally { await pg.exec('DROP TRIGGER fail_completed_delete_audit ON training_events; DROP FUNCTION fail_completed_delete_audit();'); }
  assert.deepEqual(await readTraining(db, userId), fixture.result.snapshot);
});
test('账号停用或会话撤销后不能删除完成记录', async () => {
  const userId = await owner(), { session } = await completedFixture(userId);
  await assert.rejects(webSessionContext.run({ userId, sessionId: randomUUID(), accessVersion: 0 }, () => mutateTraining(db, userId, deletion(session))), /登录已失效/);
  await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, userId));
  await assert.rejects(mutateTraining(db, userId, deletion(session)), /失效/);
  assert.equal((await db.select().from(schema.trainingSession).where(eq(schema.trainingSession.id, session.id))).length, 1);
});
test('今日入口优先进行中、待练计划、最近完成和自由训练，不以记录数组顺序选完成项', () => {
  const base: TrainingSession = { id: randomUUID(), name: '较早训练', date: '2026-11-08', timezone: 'Asia/Shanghai', status: 'completed', exercises: [], version: 1, elapsedSeconds: 60, startedAt: '2026-11-08T02:00:00Z', resumedAt: null, endedAt: '2026-11-08T02:01:00Z', planId: null };
  const latest = { ...base, id: randomUUID(), name: '最近训练', endedAt: '2026-11-08T03:01:00Z' };
  const snapshot: TrainingSnapshot = { sessions: [base, latest], templates: [], plans: [] };
  let entry = trainingEntry(snapshot, base.date); assert.equal(entry.kind, 'completed'); if (entry.kind === 'completed') assert.equal(entry.session.id, latest.id);
  snapshot.plans.push({ id: randomUUID(), templateId: randomUUID(), date: base.date, status: 'planned', version: 1, content: { name: '待练计划', exercises: [] } });
  assert.equal(trainingEntry(snapshot, base.date).kind, 'plan');
  snapshot.sessions.push({ ...base, id: randomUUID(), date: '2026-11-07', status: 'paused' });
  entry = trainingEntry(snapshot, base.date); assert.equal(entry.kind, 'active');
  assert.equal(trainingEntry({ sessions: [base], templates: [], plans: [] }, '2026-11-09').kind, 'free');
});
