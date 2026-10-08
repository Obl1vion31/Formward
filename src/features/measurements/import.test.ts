import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { previewMeasurementTsv } from "../imports/measurements";
import { getMeasurement, listMeasurements, saveImportedMeasurements } from "./records";
import { buildMeasurementDays } from "./days";

const pg = new PGlite();
const db = drizzle(pg, { schema });
const header = "测量时间\t体重(kg)\tBMI\t体脂率(%)";
const contents = `${header}\n2025-05-10 11:20:00\t75.23\t24.11\t25.25\n2025-05-11 00:30:00\t75.80\t24.29\t25.60`;
const userId = "fictional-measurement-user";
const otherId = "fictional-other-user";

before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.user).values([
    { id: userId, name: "虚构用户", email: "measurement@example.test" },
    { id: otherId, name: "另一个虚构用户", email: "other-measurement@example.test" },
  ]);
});
after(async () => { await pg.close(); });

async function write(text = contents, owner = userId) {
  const preview = previewMeasurementTsv(text, "Asia/Shanghai", true);
  return saveImportedMeasurements(db, {
    userId: owner, actorId: owner, fileDigest: preview.fileDigest,
    sourceLabel: "fictional.tsv", captureChannel: "file", records: preview.records,
  });
}

test("导入保留真实时间、当地归属与原始指标，白天空腹须确认，晚间按规则写入", async () => {
  const result = await write();
  assert.equal(result.inserted, 2);
  const rows = await listMeasurements(db, userId);
  const evening = rows.find((row) => row.period === "evening")!;
  const daytime = rows.find((row) => row.period === "daytime")!;
  assert.equal(evening.sourceLocalTime, "2025-05-11 00:30:00");
  assert.equal(evening.sourceLocalTime.slice(0, 10), "2025-05-11");
  assert.equal(evening.recordDate, "2025-05-10");
  assert.equal(evening.occurredAt?.toISOString(), "2025-05-10T16:30:00.000Z");
  assert.equal(evening.timezone, "Asia/Shanghai");
  assert.equal(evening.utcOffsetMinutes, 480);
  assert.equal(evening.fasting, false);
  assert.equal(evening.fastingSource, "evening_rule");
  assert.equal(daytime.fasting, true);
  assert.equal(daytime.fastingSource, "user_confirmed");
  assert.equal(evening.originalValues.weightKg, "75.80");
  assert.equal((await db.select().from(schema.measurementEvent)).length, 2);
  assert.equal(buildMeasurementDays(rows)[0].weightDifferenceKg, 0.57);
});

test("无效日期、单位数值、表头和未经确认的空腹条件拒绝写入", async () => {
  const count = (await listMeasurements(db, userId)).length;
  for (const text of [
    "错误表头", `${header}\n2025-02-29 12:00:00\t75.00\t24.00\t25.00`,
    `${header}\n2025-05-10 12:00:00\t0\t24.00\t25.00`,
    `${header}\n2025-05-10 12:00:00\t75.00\t24.00\t100.01`,
    `${header}\n2025-05-10 12:00:00\t75kg\t24.00\t25.00`,
  ]) await assert.rejects(async () => write(text));
  const preview = previewMeasurementTsv(contents);
  await assert.rejects(saveImportedMeasurements(db, {
    userId, actorId: userId, fileDigest: preview.fileDigest, sourceLabel: "invalid.tsv", captureChannel: "file",
    records: [{ ...preview.records[0], fasting: true, fastingSource: null }],
  }));
  assert.equal((await listMeasurements(db, userId)).length, count);
  const missing = previewMeasurementTsv(`${header}\n2025-05-10 12:00:00\t75.00\t\t`).records[0];
  assert.equal(Object.hasOwn(missing, "bmi"), false);
  assert.equal(missing.bodyFatPercent, null);
  assert.equal(missing.fasting, null);
});

test("重复与并发重试幂等，重新排序的导出不重复，也不覆盖原记录", async () => {
  const repeated = await Promise.all([write(), write()]);
  assert.ok(repeated.every((result) => result.inserted === 0 && result.repeated));
  const reversed = [header, ...contents.split("\n").slice(1).reverse()].join("\n");
  assert.equal((await write(reversed)).inserted, 0);
  assert.equal((await listMeasurements(db, userId)).length, 2);
  assert.equal((await db.select().from(schema.measurementEvent)).length, 2);
});

test("来源冲突导致整个导入回滚，不留下前面的新记录或批次", async () => {
  const beforeBatches = (await db.select().from(schema.measurementImport)).length;
  const text = `${header}\n2025-05-12 12:00:00\t74.00\t23.75\t24.75\n2025-05-11 00:30:00\t76.00\t24.35\t25.70`;
  await assert.rejects(write(text));
  assert.equal((await listMeasurements(db, userId)).length, 2);
  assert.equal((await db.select().from(schema.measurementImport)).length, beforeBatches);
  await assert.rejects(write(`${contents}\n2025-05-10 11:20:00\t76.00\t24.35\t25.70`));
});

test("跨账号读不到记录，操作者不能伪装其他账号，相同样本可分别归属", async () => {
  const first = (await listMeasurements(db, userId))[0];
  assert.deepEqual(await listMeasurements(db, otherId), []);
  assert.equal(await getMeasurement(db, otherId, first.id), null);
  const preview = previewMeasurementTsv(contents, "Asia/Shanghai", true);
  await assert.rejects(saveImportedMeasurements(db, {
    userId: otherId, actorId: userId, fileDigest: preview.fileDigest,
    sourceLabel: "fictional.tsv", captureChannel: "file", records: preview.records,
  }));
  assert.equal((await write(contents, otherId)).inserted, 2);
  assert.equal((await listMeasurements(db, userId)).length, 2);
  assert.equal((await listMeasurements(db, otherId)).length, 2);
  await assert.rejects(listMeasurements(db, ""));
});

test("软删除的记录不出现在读取中，重导不会复活", async () => {
  const row = (await listMeasurements(db, otherId))[0];
  await db.update(schema.measurement).set({ deletedAt: new Date() }).where(eq(schema.measurement.id, row.id));
  assert.equal(await getMeasurement(db, otherId, row.id), null);
  assert.equal((await write(contents, otherId)).inserted, 0);
  assert.equal((await listMeasurements(db, otherId)).length, 1);
});

test("缺失测量不补零，同一晚多条记录不擅自选择或合并", () => {
  const rows = previewMeasurementTsv(contents).records.map((row, index) => ({ ...row, id: String(index) }));
  const incomplete = buildMeasurementDays([rows[0]])[0];
  assert.equal(incomplete.eveningRecord, null);
  assert.equal(incomplete.weightDifferenceKg, null);
  const multiple = buildMeasurementDays([...rows, { ...rows[1], id: "another-evening", weightKg: "75.90" }])[0];
  assert.equal(multiple.evening.length, 2);
  assert.equal(multiple.eveningRecord, null);
  assert.equal(multiple.weightDifferenceKg, null);
  assert.equal(multiple.needsSelection, true);
});
