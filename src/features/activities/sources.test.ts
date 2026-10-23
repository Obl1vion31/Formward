import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { listEnergySources, removeEnergySource } from "./sources";
import { listMeasurementSources } from "../measurements/sources";
import { submitEnergyOperation, decideEnergyOperation, readEnergySnapshot } from "./records";
import type { EnergyAction } from "./model";

const pg = new PGlite(), db = drizzle(pg, { schema });
before(async () => migrate(db, { migrationsFolder: "./drizzle" }));
after(async () => pg.close());
async function owner() {
  const userId = randomUUID();
  await db.insert(schema.user).values({ id: userId, name: "虚构来源用户", email: `${userId}@example.test` });
  return { userId, actorId: userId };
}
async function save(userId: string, actions: EnergyAction[]) {
  const op = await submitEnergyOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions });
  return decideEnergyOperation(db, userId, op.id, op.revision, "confirm");
}
const day = (date: string, label = "虚构 Garmin") => ({ kind: "save_energy_day" as const, date, entryMode: "components" as const, activityMode: "total" as const, restingKcal: "2000", activeKcal: "0", restingSourceSystem: label, activeSourceSystem: label });

test("成功保存后共享消耗来源，预览取消不记忆，身体与其他账号隔离", async () => {
  const actor = await owner(), other = await owner();
  await db.insert(schema.measurementSource).values({ userId: actor.userId, label: "虚构蓝牙秤" });
  const pending = await submitEnergyOperation(db, { userId: actor.userId, origin: "manual" }, { operationId: randomUUID(), actions: [day("2024-08-01")] });
  assert.deepEqual(await listEnergySources(db, actor.userId), []);
  await decideEnergyOperation(db, actor.userId, pending.id, pending.revision, "cancel");
  assert.deepEqual(await listEnergySources(db, actor.userId), []);
  await save(actor.userId, [day("2024-08-01"), { kind: "save_energy_day", date: "2024-08-02", entryMode: "total", totalKcal: "2500", sourceSystem: "虚构总数应用", restingSourceSystem: "未采用来源" }, { kind: "save_activity", date: "2024-08-03", name: "虚构步行", sourceSystem: "虚构 Garmin" }]);
  assert.deepEqual((await listEnergySources(db, actor.userId)).sort(), ["虚构 Garmin", "虚构总数应用"].sort());
  assert.deepEqual(await listMeasurementSources(db, actor.userId), ["虚构蓝牙秤"]);
  assert.deepEqual(await listEnergySources(db, other.userId), []);
});
test("移除幂等且保留历史，旧记录编辑不恢复，明确新使用才恢复", async () => {
  const actor = await owner(); await save(actor.userId, [day("2024-08-01")]);
  const record = (await readEnergySnapshot(db, actor.userId)).days[0];
  assert.deepEqual(await removeEnergySource(db, actor, "虚构 Garmin"), []);
  await removeEnergySource(db, actor, "虚构 Garmin");
  assert.equal((await readEnergySnapshot(db, actor.userId)).days[0].restingSourceSystem, "虚构 Garmin");
  await save(actor.userId, [{ ...day(record.date), id: record.id, version: record.version, notes: "仅改备注" }]);
  assert.deepEqual(await listEnergySources(db, actor.userId), []);
  await save(actor.userId, [day("2024-08-02")]);
  assert.deepEqual(await listEnergySources(db, actor.userId), ["虚构 Garmin"]);
});
test("旧通用来源保留不恢复，删除恢复事实不改变来源建议", async () => {
  const actor = await owner();
  await save(actor.userId, [{ kind: "save_energy_day", date: "2024-08-01", restingKcal: "2000", activeKcal: "0", sourceSystem: "虚构旧来源" }]);
  let record = (await readEnergySnapshot(db, actor.userId)).days[0];
  await removeEnergySource(db, actor, "虚构旧来源");
  await save(actor.userId, [{ ...day(record.date, "虚构旧来源"), id: record.id, version: record.version }]);
  assert.deepEqual(await listEnergySources(db, actor.userId), []);
  record = (await readEnergySnapshot(db, actor.userId)).days[0];
  await save(actor.userId, [{ kind: "delete_energy_day", id: record.id, version: record.version }]);
  record = (await readEnergySnapshot(db, actor.userId)).days[0];
  await save(actor.userId, [{ kind: "restore_energy_day", id: record.id, version: record.version }]);
  assert.deepEqual(await listEnergySources(db, actor.userId), []);
});
test("来源删除校验账号与输入，重复使用不重复，确认失败整体回滚", async () => {
  const actor = await owner(), other = await owner();
  await save(actor.userId, [day("2024-08-01")]);
  await save(other.userId, [day("2024-08-01")]);
  await assert.rejects(removeEnergySource(db, { ...actor, actorId: other.userId }, "虚构 Garmin"), /不一致/);
  for (const invalid of ["", " ", "a".repeat(201), "坏\n来源"]) await assert.rejects(removeEnergySource(db, actor, invalid));
  await removeEnergySource(db, actor, "虚构 Garmin");
  assert.deepEqual(await listEnergySources(db, other.userId), ["虚构 Garmin"]);
  await pg.exec("CREATE FUNCTION reject_energy_source_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fictional failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_energy_source_audit BEFORE INSERT ON energy_events FOR EACH ROW EXECUTE FUNCTION reject_energy_source_audit();");
  try { await assert.rejects(save(actor.userId, [day("2024-08-02", "虚构失败来源")])); }
  finally { await pg.exec("DROP TRIGGER reject_energy_source_audit ON energy_events; DROP FUNCTION reject_energy_source_audit();"); }
  assert.deepEqual(await listEnergySources(db, actor.userId), []);
  assert.equal((await readEnergySnapshot(db, actor.userId)).days.length, 1);
  await save(other.userId, [day("2024-08-02")]);
  assert.equal((await db.select().from(schema.energySource).where(eq(schema.energySource.userId, other.userId))).length, 1);
});
