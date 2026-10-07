import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { previewMeasurementTsv } from "../imports/measurements";
import { applyMeasurementMaintenance, previewMeasurementMaintenance, restoreMeasurement } from "./maintenance";
import { listMeasurements, saveImportedMeasurements, validateImportedMeasurement } from "./records";

const pg = new PGlite();
const db = drizzle(pg, { schema });
const userId = "fictional-maintenance-user";
const otherId = "fictional-maintenance-other";
const contents = "测量时间\t体重(kg)\tBMI\t体脂率(%)\n2025-07-10 11:00:00\t76.00\t24.00\t25.00\n2025-07-10 20:00:00\t75.00\t24.00\t25.00\n2025-07-11 00:30:00\t75.50\t24.00\t25.00\n2025-07-11 20:00:00\t75.40\t24.00\t25.00";
let originalDigest = "";
let deletedId = "";
let keptId = "";

before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.user).values([{ id: userId, name: "虚构用户", email: "maintenance@example.test" }, { id: otherId, name: "另一用户", email: "maintenance-other@example.test" }]);
  const preview = previewMeasurementTsv(contents, "Asia/Shanghai", true);
  for (const id of [userId, otherId]) {
    await saveImportedMeasurements(db, { userId: id, actorId: id, fileDigest: preview.fileDigest, sourceLabel: "fictional.tsv", captureChannel: "file", records: preview.records });
    // 模拟旧版真实数据；正常导入现在会应用晚间非空腹规则。
    await db.update(schema.measurement).set({ fasting: null, fastingSource: null }).where(and(eq(schema.measurement.userId, id), eq(schema.measurement.period, "evening")));
  }
});
after(async () => { await pg.close(); });

const events = () => db.select().from(schema.measurementEvent).where(eq(schema.measurementEvent.userId, userId));

test("晚间及凌晨统一非空腹，白天仍须明确确认，不接受伪造来源或无效状态", () => {
  for (const time of ["2025-07-10 18:00:00", "2025-07-11 05:59:59"]) {
    const record = validateImportedMeasurement({ sourceLocalTime: time, weightKg: "75.00", bodyFatPercent: null, sourceRow: 2, fasting: true, fastingSource: "user_confirmed" });
    assert.equal(record.fasting, false);
    assert.equal(record.fastingSource, "evening_rule");
  }
  assert.throws(() => validateImportedMeasurement({ sourceLocalTime: "2025-07-10 11:00:00", weightKg: "75.00", bodyFatPercent: null, sourceRow: 2, fasting: false, fastingSource: "evening_rule" }));
  assert.equal(previewMeasurementTsv(contents).records[0].fasting, null);
  const record = previewMeasurementTsv(contents).records[1];
  assert.throws(() => validateImportedMeasurement({ ...record, fasting: "false" as unknown as boolean }));
  assert.throws(() => validateImportedMeasurement({ ...record, fastingSource: "fabricated" as "user_confirmed" }));
});

test("维护预览只读，找到较早的真实发生时间并保留两个候选", async () => {
  const preview = await previewMeasurementMaintenance(db, userId);
  assert.equal(preview.activeCount, 4);
  assert.equal(preview.eveningIds.length, 3);
  assert.equal(preview.duplicates.length, 1);
  const rows = await listMeasurements(db, userId);
  originalDigest = preview.digest;
  deletedId = preview.duplicates[0].deleteIds[0];
  keptId = preview.duplicates[0].keepId;
  assert.equal(rows.find((row) => row.id === keptId)?.sourceLocalTime, "2025-07-10 20:00:00");
  assert.equal(rows.find((row) => row.id === deletedId)?.sourceLocalTime, "2025-07-11 00:30:00");
  assert.equal(rows.filter((row) => row.fasting === null).length, 3);
  assert.equal((await events()).length, 4);
});

test("无效、跨账号及预览后发生变化的请求不写入", async () => {
  await assert.rejects(previewMeasurementMaintenance(db, ""));
  await assert.rejects(applyMeasurementMaintenance(db, { userId, actorId: otherId, digest: originalDigest }));
  await assert.rejects(applyMeasurementMaintenance(db, { userId, actorId: userId, digest: "invalid" }));
  await assert.rejects(applyMeasurementMaintenance(db, { userId: otherId, actorId: otherId, digest: originalDigest }));
  const first = (await listMeasurements(db, userId)).find((row) => row.period === "daytime")!;
  await db.update(schema.measurement).set({ weightKg: "76.10" }).where(eq(schema.measurement.id, first.id));
  await assert.rejects(applyMeasurementMaintenance(db, { userId, actorId: userId, digest: originalDigest }), /重新预览/);
  assert.equal((await events()).length, 4);
  assert.equal((await listMeasurements(db, userId)).length, 4);
  originalDigest = (await previewMeasurementMaintenance(db, userId)).digest;
});

test("授权维护只修改本账号，保留早晚反常数值，软删除且保存前后快照", async () => {
  const result = await applyMeasurementMaintenance(db, { userId, actorId: userId, digest: originalDigest });
  assert.deepEqual(result, { eveningUpdated: 3, deleted: 1, repeated: false });
  const rows = await listMeasurements(db, userId);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.id === keptId)?.weightKg, "75.00");
  assert.equal(rows.find((row) => row.period === "daytime")?.weightKg, "76.10");
  assert.ok(rows.filter((row) => row.period === "evening").every((row) => row.fasting === false && row.fastingSource === "evening_rule"));
  const history = await events();
  assert.equal(history.length, 8);
  const deletion = history.find((event) => event.action === "delete")!;
  assert.equal(deletion.actorId, userId);
  assert.equal(deletion.snapshot.retainedId, keptId);
  assert.ok(deletion.snapshot.before && deletion.snapshot.after);
  assert.ok(history.find((event) => event.action === "update")?.snapshot.operationDigest === originalDigest);
  const other = await listMeasurements(db, otherId);
  assert.equal(other.length, 4);
  assert.equal(other.filter((row) => row.fasting === null).length, 3);
});

test("同一请求及新预览重复维护幂等，重导不复活被删除记录", async () => {
  assert.equal((await applyMeasurementMaintenance(db, { userId, actorId: userId, digest: originalDigest })).repeated, true);
  const fresh = await previewMeasurementMaintenance(db, userId);
  assert.equal((await applyMeasurementMaintenance(db, { userId, actorId: userId, digest: fresh.digest })).deleted, 0);
  const preview = previewMeasurementTsv(contents, "Asia/Shanghai", true);
  await saveImportedMeasurements(db, { userId, actorId: userId, fileDigest: preview.fileDigest, sourceLabel: "fictional.tsv", captureChannel: "file", records: preview.records });
  assert.equal((await listMeasurements(db, userId)).length, 3);
  assert.equal((await events()).length, 8);
});

test("恢复校验归属且幂等，保留非空腹规则和原始值，旧维护请求不会再次删掉", async () => {
  await assert.rejects(restoreMeasurement(db, { userId: otherId, actorId: otherId, id: deletedId }));
  await assert.rejects(restoreMeasurement(db, { userId, actorId: otherId, id: deletedId }));
  await assert.rejects(restoreMeasurement(db, { userId, actorId: userId, id: "" }));
  assert.equal((await restoreMeasurement(db, { userId, actorId: userId, id: deletedId })).restored, true);
  assert.equal((await restoreMeasurement(db, { userId, actorId: userId, id: deletedId })).restored, false);
  assert.equal((await listMeasurements(db, userId)).length, 4);
  const restored = (await listMeasurements(db, userId)).find((row) => row.id === deletedId)!;
  assert.equal(restored.fasting, false);
  assert.equal(restored.originalValues.weightKg, "75.50");
  assert.equal((await events()).length, 9);
  await applyMeasurementMaintenance(db, { userId, actorId: userId, digest: originalDigest });
  assert.equal((await listMeasurements(db, userId)).length, 4);
});

test("事务中途失败时条件更新、软删除和事件一起回滚", async () => {
  const preview = await previewMeasurementMaintenance(db, otherId);
  await pg.exec("CREATE FUNCTION reject_maintenance_event() RETURNS trigger AS $$ BEGIN IF NEW.action = 'delete' THEN RAISE EXCEPTION 'fictional event failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_maintenance_event BEFORE INSERT ON measurement_events FOR EACH ROW EXECUTE FUNCTION reject_maintenance_event();");
  try {
    await assert.rejects(applyMeasurementMaintenance(db, { userId: otherId, actorId: otherId, digest: preview.digest }));
    const rows = await listMeasurements(db, otherId);
    assert.equal(rows.length, 4);
    assert.equal(rows.filter((row) => row.fasting === null).length, 3);
    assert.equal((await db.select().from(schema.measurementEvent).where(eq(schema.measurementEvent.userId, otherId))).length, 4);
  } finally {
    await pg.exec("DROP TRIGGER reject_maintenance_event ON measurement_events; DROP FUNCTION reject_maintenance_event();");
  }
});
