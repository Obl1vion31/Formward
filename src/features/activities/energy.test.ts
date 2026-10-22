import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createAiToken, authenticateAi, revokeAiToken } from "../auth/ai-tokens";
import { energyDays, emptyEnergy, restingEstimate, type EnergyProfile, type ActivityRecord, type EnergyDayRecord } from "./model";
import { submitEnergyOperation, decideEnergyOperation, readEnergySnapshot, planEnergyActions, reviseEnergyOperation } from "./records";
import { submitRecordOperation, reviewRecordOperation, getRecordOperation } from "../records/operations";
import type { MeasurementDisplay } from "../measurements/entry-state";

const pg = new PGlite(), db = drizzle(pg, { schema });
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
const date = "2024-08-01";
const source = { timezone: "Asia/Shanghai", sourceSystem: "虚构手表", sourceRecordId: null, sourceOccurredAt: null, sourceUnit: "kcal" as const, syncStatus: "confirmed" as const };
const day = (patch: Partial<EnergyDayRecord> = {}): EnergyDayRecord => ({ id: randomUUID(), version: 1, deletedAt: null, date, restingKcal: "2000", activeKcal: null, totalKcal: null, ...source, ...patch });
const activity = (patch: Partial<ActivityRecord> = {}): ActivityRecord => ({ id: randomUUID(), version: 1, deletedAt: null, date, name: "虚构跑步", durationMinutes: "60", caloriesKcal: "800", completed: true, ...source, ...patch });
const profile = (patch: Partial<EnergyProfile> = {}): EnergyProfile => ({ id: randomUUID(), version: 1, deletedAt: null, effectiveFrom: "2024-01-01", heightCm: "175", birthDate: "1994-08-01", sex: "male", ...patch });
const weight = (recordDate = date, patch: Partial<MeasurementDisplay> = {}): MeasurementDisplay => ({ id: randomUUID(), recordDate, period: "daytime", weightKg: "70", bodyFatPercent: null, fasting: true, sourceLocalTime: recordDate + " 08:00:00", recordKind: "observed", timezone: "Asia/Shanghai", sourceType: "manual", sourceSystem: null, sourceRecordId: null, entryChannel: "manual", deviceLabel: "虚构秤", estimation: null, timePrecision: "minute", updatedAt: recordDate, ...patch });
async function owner() {
  const userId = randomUUID(); await db.insert(schema.user).values({ id: userId, email: `${userId}@example.test`, name: "虚构消耗用户" });
  const token = await createAiToken(db, userId, "虚构消耗令牌", "write"), identity = await authenticateAi(db, `Bearer ${token.rawToken}`);
  return { userId, token, identity };
}

test("按用户口径原样相加，活动合计覆盖明细，全天总量覆盖所有分项", () => {
  const state = { ...emptyEnergy(), days: [day()], activities: [activity()] };
  assert.equal(Number(energyDays(state, [], [date])[0].totalKcal), 2800);
  state.days[0].activeKcal = "900";
  assert.equal(Number(energyDays(state, [], [date])[0].totalKcal), 2900);
  state.days[0].totalKcal = "2500";
  assert.equal(Number(energyDays(state, [], [date])[0].totalKcal), 2500);
  assert.equal(state.activities[0].caloriesKcal, "800");
});
test("未知与零分开，只有总量可用，未完成与已删除活动不统计", () => {
  assert.equal(energyDays(emptyEnergy(), [], [date])[0].totalKcal, null);
  assert.equal(energyDays({ ...emptyEnergy(), days: [day()] }, [], [date])[0].totalKcal, null);
  assert.equal(Number(energyDays({ ...emptyEnergy(), days: [day({ activeKcal: "0" })] }, [], [date])[0].totalKcal), 2000);
  const result = energyDays({ ...emptyEnergy(), days: [day({ restingKcal: null, totalKcal: "3200" })] }, [], [date])[0];
  assert.equal(Number(result.totalKcal), 3200); assert.equal(result.restingKcal, null); assert.equal(result.activeKcal, null);
  const unknown = { ...emptyEnergy(), days: [day()], activities: [activity({ caloriesKcal: null }), activity({ completed: false }), activity({ deletedAt: new Date().toISOString() })] };
  assert.equal(energyDays(unknown, [], [date])[0].activeKcal, null);
});
test("公式按日期年龄及性别计算，录入静息优先，资料从生效日开始", () => {
  const male = restingEstimate(date, [profile()], [weight()])!, female = restingEstimate(date, [profile({ sex: "female" })], [weight()])!;
  assert.equal(Number(male.value), 1648.75); assert.equal(Number(female.value), 1482.75); assert.equal(male.basis.age, 30);
  assert.equal(restingEstimate("2023-12-31", [profile()], [weight("2023-12-31")]), null);
  assert.equal(energyDays({ ...emptyEnergy(), profiles: [profile()], days: [day({ activeKcal: "0" })] }, [weight()], [date])[0].restingBasis, null);
});
test("体重回退复用已有估计及30日内晨重，多候选、过期与未来记录不擅用", () => {
  assert.equal(restingEstimate(date, [profile()], [weight(date, { recordKind: "estimated" })])?.basis.weightEstimated, true);
  assert.equal(restingEstimate(date, [profile()], [weight("2024-07-02")])?.basis.carried, true);
  assert.equal(restingEstimate(date, [profile()], [weight("2024-07-01")]), null);
  assert.equal(restingEstimate(date, [profile()], [weight("2024-08-02")]), null);
  assert.equal(restingEstimate(date, [profile()], [weight(), weight(), weight("2024-07-31")]), null);
  assert.equal(restingEstimate(date, [profile()], [weight(date, { period: "evening", fasting: false })]), null);
});
test("预览不写事实，重复保存幂等，清空覆盖后回到明细合计", async () => {
  const { userId } = await owner(), actor = { userId, origin: "manual" as const };
  const raw = { operationId: randomUUID(), actions: [{ kind: "save_energy_day", date, restingKcal: "2000", activeKcal: "900", totalKcal: "3000" }, { kind: "save_activity", date, name: "虚构跑步", caloriesKcal: "800" }] };
  const operation = await submitEnergyOperation(db, actor, raw);
  assert.equal((await readEnergySnapshot(db, userId)).days.length, 0);
  assert.equal((await submitEnergyOperation(db, actor, raw)).id, operation.id);
  await decideEnergyOperation(db, userId, operation.id, operation.revision, "confirm");
  await decideEnergyOperation(db, userId, operation.id, operation.revision, "confirm");
  const state = await readEnergySnapshot(db, userId); assert.equal(state.activities.length, 1);
  const saved = state.days[0];
  const clear = await submitEnergyOperation(db, actor, { operationId: randomUUID(), actions: [{ kind: "save_energy_day", id: saved.id, version: saved.version, date, activeKcal: null, totalKcal: null }] });
  await decideEnergyOperation(db, userId, clear.id, clear.revision, "confirm");
  assert.equal(Number(energyDays(await readEnergySnapshot(db, userId), [], [date])[0].totalKcal), 2800);
});
test("无效数字、重复日期、跨账号、版本和来源编号保护", async () => {
  const a = await owner(), b = await owner();
  await assert.rejects(submitEnergyOperation(db, { userId: a.userId, origin: "manual" }, { operationId: randomUUID(), actions: [{ kind: "save_energy_day", date, restingKcal: "-1" }] }));
  const bad = planEnergyActions([{ kind: "save_activity", date, name: "虚构", sourceRecordId: "source-id" }], emptyEnergy()); assert.ok(bad[0].error);
  const op = await submitEnergyOperation(db, { userId: a.userId, origin: "manual" }, { operationId: randomUUID(), actions: [{ kind: "save_energy_day", date, restingKcal: "2000", activeKcal: "0" }] });
  await assert.rejects(decideEnergyOperation(db, b.userId, op.id, op.revision, "confirm"));
  await decideEnergyOperation(db, a.userId, op.id, op.revision, "confirm");
  const saved = (await readEnergySnapshot(db, a.userId)).days[0];
  assert.ok(planEnergyActions([{ kind: "save_energy_day", date }], await readEnergySnapshot(db, a.userId))[0].error);
  assert.ok(planEnergyActions([{ kind: "save_energy_day", id: saved.id, version: 99, date }], await readEnergySnapshot(db, a.userId))[0].error);
  assert.ok(planEnergyActions([{ kind: "save_energy_day", id: saved.id, version: 1, date }], await readEnergySnapshot(db, b.userId))[0].error);
});
test("软删除恢复与审计保持，删除活动后不把缺项补零", async () => {
  const { userId } = await owner(), actor = { userId, origin: "manual" as const };
  const save = await submitEnergyOperation(db, actor, { operationId: randomUUID(), actions: [{ kind: "save_activity", date, name: "虚构活动", caloriesKcal: "800" }] });
  await decideEnergyOperation(db, userId, save.id, save.revision, "confirm");
  let record = (await readEnergySnapshot(db, userId)).activities[0];
  const remove = await submitEnergyOperation(db, actor, { operationId: randomUUID(), actions: [{ kind: "delete_activity", id: record.id, version: record.version }] });
  await decideEnergyOperation(db, userId, remove.id, remove.revision, "confirm");
  assert.equal(energyDays(await readEnergySnapshot(db, userId), [], [date])[0].activeKcal, null);
  record = (await readEnergySnapshot(db, userId)).activities[0];
  const restore = await submitEnergyOperation(db, actor, { operationId: randomUUID(), actions: [{ kind: "restore_activity", id: record.id, version: record.version }] });
  await decideEnergyOperation(db, userId, restore.id, restore.revision, "confirm");
  assert.equal((await readEnergySnapshot(db, userId)).activities[0].deletedAt, null);
  assert.equal((await db.select().from(schema.energyEvent).where(eq(schema.energyEvent.userId, userId))).length, 3);
});
test("AI混合审核支持身体、饮食与消耗统一确认，撤销和回滚生效", async () => {
  const { userId, identity, token } = await owner();
  const raw = { operationId: randomUUID(), items: [{ key: "energy", kind: "save_energy_day", date, restingKcal: "2000", activeKcal: "800" }, { key: "body", kind: "save_record", date, period: "daytime", weightKg: "70", fasting: true, deviceLabel: "虚构秤" }, { key: "meal", kind: "save_meal", date, mealType: "午餐", items: [{ kind: "food", name: "虚构食品", sourceKind: "estimated", nutrition: { caloriesKcal: "100", proteinG: null, carbsG: null, fatG: null } }] }] };
  const operation = await submitRecordOperation(db, identity, raw);
  assert.equal(operation.rows.length, 3); assert.ok(operation.canConfirm); assert.equal((await readEnergySnapshot(db, userId)).days.length, 0);
  const saved = await reviewRecordOperation(db, userId, operation.id, { kind: "confirm", revision: operation.revision });
  assert.equal(saved.saved, 3); assert.equal((await getRecordOperation(db, identity, operation.id)).status, "confirmed");
  const pending = await submitRecordOperation(db, identity, { operationId: randomUUID(), items: [{ key: "activity", kind: "save_activity", date, name: "虚构运动", caloriesKcal: "300" }] });
  await revokeAiToken(db, userId, token.token.id);
  await assert.rejects(reviewRecordOperation(db, userId, pending.id, { kind: "confirm", revision: pending.revision }));
});


test("消耗审计失败回滚同批身体、饮食与所有终态", async () => {
  const { userId, identity } = await owner();
  const op = await submitRecordOperation(db, identity, { operationId: randomUUID(), items: [{ key: "body", kind: "save_record", date, period: "daytime", weightKg: "70", fasting: true, deviceLabel: "虚构秤" }, { key: "meal", kind: "save_meal", date, mealType: "虚构午餐", items: [{ kind: "food", name: "虚构", nutrition: { caloriesKcal: "100", proteinG: null, carbsG: null, fatG: null } }] }, { key: "energy", kind: "save_energy_day", date, totalKcal: "2800" }] });
  await pg.exec(`CREATE FUNCTION fail_energy_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id = '${userId}' THEN RAISE EXCEPTION 'fictional failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_energy_audit BEFORE INSERT ON energy_events FOR EACH ROW EXECUTE FUNCTION fail_energy_audit();`);
  try { await assert.rejects(reviewRecordOperation(db, userId, op.id, { kind: "confirm", revision: op.revision })); }
  finally { await pg.exec("DROP TRIGGER fail_energy_audit ON energy_events; DROP FUNCTION fail_energy_audit();"); }
  assert.equal((await readEnergySnapshot(db, userId)).days.length, 0);
  assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.userId, userId))).length, 0);
  assert.equal((await db.select().from(schema.meal).where(eq(schema.meal.userId, userId))).length, 0);
  assert.equal((await getRecordOperation(db, identity, op.id)).status, "pending");
});


test("退役默认值与公式不再给未录日期生成消耗", () => {
  const defaults = [{ id: randomUUID(), version: 1, deletedAt: null, restingFrom: date, restingKcal: "2100", zeroActivityFrom: date }];
  const state = { ...emptyEnergy(), defaults, profiles: [profile()] };
  const future = energyDays(state, [weight()], [date])[0];
  assert.equal(future.restingKcal, null); assert.equal(future.activeKcal, null); assert.equal(future.totalKcal, null);
  assert.ok(restingEstimate(date, state.profiles, [weight()]));
});
test("显式模式排除隐藏旧值，分项来源独立保留", async () => {
  const { userId } = await owner(), actor = { userId, origin: "manual" as const };
  const submit = async (actions: unknown[]) => { const op = await submitEnergyOperation(db, actor, { operationId: randomUUID(), actions }); await decideEnergyOperation(db, userId, op.id, op.revision, "confirm"); return readEnergySnapshot(db,userId); };
  let state = await submit([{ kind: "save_energy_day", date, entryMode: "components", activityMode: "total", restingKcal: "1900", restingSourceSystem: "虚构秤", activeSourceSystem: "虚构手表" }]);
  assert.equal(Number(energyDays(state, [], [date])[0].totalKcal), 1900); assert.equal(Number(state.days[0].activeKcal), 0);
  const prior = state.days[0];
  state = await submit([{ kind: "save_energy_day", id: prior.id, version: prior.version, date, entryMode: "total", totalKcal: "2400" }]);
  let reading = energyDays(state, [], [date])[0]; assert.equal(Number(reading.totalKcal), 2400); assert.equal(reading.restingKcal, null); assert.equal(state.days[0].restingKcal, "1900.0000");
  const saved = state.days[0];
  state = await submit([{ kind: "save_energy_day", id: saved.id, version: saved.version, date, entryMode: "components", activityMode: "activities" }, { kind: "save_activity", date, name: "虚构跑步", caloriesKcal: "400" }]);
  reading = energyDays(state, [], [date])[0]; assert.equal(Number(reading.totalKcal), 2300); assert.equal(Number(state.days[0].totalKcal), 2400); assert.equal(state.days[0].restingSourceSystem, "虚构秤"); assert.equal(state.days[0].activeSourceSystem, "虚构手表");
  const invalid = planEnergyActions([{ kind: "save_energy_day", date: "2024-08-02", entryMode: "components", restingKcal: "100", totalKcal: "999" }], emptyEnergy()); assert.ok(invalid[0].error);
});
test("旧默认动作不能新增或恢复，旧预览必须刷新且只能取消退役项", async () => {
  const { userId } = await owner(), actor = { userId, origin: "manual" as const };
  const retired = { kind: "save_energy_defaults" as const, restingFrom: date, restingKcal: "2100", zeroActivityFrom: date };
  await assert.rejects(submitEnergyOperation(db, actor, { operationId: randomUUID(), actions: [retired] }), /停用/);
  await assert.rejects(submitEnergyOperation(db, actor, { operationId: randomUUID(), actions: [{ kind: "restore_energy_defaults", id: randomUUID(), version: 1 }] }), /停用/);
  const op = await submitEnergyOperation(db, actor, { operationId: randomUUID(), actions: [{ kind: "save_energy_day", date, restingKcal: "1900", activeKcal: "200", restingEstimated: true, activeEstimated: true, notes: "虚构初始化" }] });
  await db.update(schema.energyOperation).set({ snapshotDigest: "old-rules" }).where(eq(schema.energyOperation.id, op.id));
  await assert.rejects(decideEnergyOperation(db,userId,op.id,op.revision,"confirm"), /刷新/);
  const refreshed = await reviseEnergyOperation(db,userId,op.id,op.revision,[retired,{ kind: "save_energy_day", date, restingKcal: "1900", activeKcal: "200", restingEstimated: true, activeEstimated: true, notes: "虚构初始化" }],[0]);
  assert.ok(refreshed.rows[0].error); assert.ok(refreshed.canConfirm);
  await decideEnergyOperation(db,userId,op.id,refreshed.revision,"confirm");
  const state = await readEnergySnapshot(db,userId); assert.equal(state.defaults?.length,0); assert.equal(state.days[0].activeEstimated,true); assert.equal(state.days[0].restingEstimated,true); assert.equal(state.days[0].notes,"虚构初始化");
  assert.equal(Number(energyDays(state,[],[date])[0].totalKcal),2100);
});
test("显式未知、空明细、未完成明细与明确零分别处理", () => {
  const explicit = (patch: Partial<EnergyDayRecord>) => ({ ...emptyEnergy(), days: [day({ entryMode: "components", activityMode: "total", ...patch })] });
  assert.equal(energyDays(explicit({ activeKcal: null }), [], [date])[0].totalKcal, null);
  assert.equal(Number(energyDays(explicit({ activeKcal: "0" }), [], [date])[0].totalKcal), 2000);
  assert.equal(Number(energyDays(explicit({ activityMode: "activities" }), [], [date])[0].totalKcal), 2000);
  assert.equal(energyDays({ ...explicit({ activityMode: "activities" }), activities: [activity({ caloriesKcal: null })] }, [], [date])[0].totalKcal, null);
});

test("旧空模式日记录删除恢复不把未知活动改成零", async () => {
  const {userId}=await owner(), id=randomUUID(), actor={userId,origin:"manual" as const};
  await db.insert(schema.energyDay).values({id,userId,date,timezone:"Asia/Shanghai",restingKcal:"1900"});
  let current=(await readEnergySnapshot(db,userId)).days[0];
  for(const kind of ["delete_energy_day","restore_energy_day"] as const){const op=await submitEnergyOperation(db,actor,{operationId:randomUUID(),actions:[{kind,id,version:current.version}]});await decideEnergyOperation(db,userId,op.id,op.revision,"confirm");current=(await readEnergySnapshot(db,userId)).days[0];}
  assert.equal(current.activityMode,null);assert.equal(current.entryMode,null);assert.equal(energyDays(await readEnergySnapshot(db,userId),[],[date])[0].totalKcal,null);
});
