import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { previewMeasurementTsv } from "../imports/measurements";
import { saveImportedMeasurements } from "./records";
import { fillMissingMeasurementSources } from "./sources";

test("旧 schema 升级保留时间、冻结依据、指纹与审计，合并设备且主表为 31 列；旧／新文件重导不冲突或复活", async () => {
  const pg = new PGlite(), db = drizzle(pg, { schema });
  try {
    for (const file of (await readdir("drizzle")).filter(file => /^000[0-5]_.*\.sql$/.test(file)).sort()) await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    await pg.exec("INSERT INTO users(id,name,email) VALUES ('fictional-owner','虚构用户','upgrade@example.test'), ('fictional-other','另一虚构用户','upgrade-other@example.test')");
    await pg.query("INSERT INTO measurement_imports(id,user_id,file_digest,source_label,capture_channel,inserted_count,skipped_count,created_by,initialization_metadata) VALUES ('frozen-batch','fictional-owner','frozen-digest','虚构冻结批次','development_backend',0,0,'fictional-owner',$1)", [JSON.stringify({ mode: "historical-initialization-v1", range: { start: "2024-04-01", end: "2024-04-04" }, report: { fictional: true } })]);
    const oldKey = createHash("sha256").update(JSON.stringify(["local-time-export-v1", "2024-04-04 08:00:00", "Asia/Shanghai", 480, "70.00", "23.00", "20.00"])).digest("hex");
    for (const [id, owner, device, app, kind, deleted] of [
      ["paired", "fictional-owner", "虚构秤", "虚构应用", "observed", false],
      ["device-only", "fictional-owner", "虚构另一秤", null, "observed", false],
      ["app-only", "fictional-owner", null, "虚构另一应用", "observed", false],
      ["missing", "fictional-owner", null, null, "observed", false],
      ["deleted", "fictional-owner", null, null, "observed", true],
      ["estimate", "fictional-owner", null, null, "estimated", false],
      ["other", "fictional-other", null, null, "observed", false],
    ] as const) {
      const time = id === "paired" ? "2024-04-04 08:00:00" : id === "deleted" ? "2024-04-04 09:00:00" : "2024-04-04 20:00:00";
      await pg.query(`INSERT INTO measurements(id,user_id,source_local_time,local_date,occurred_at,timezone,utc_offset_minutes,time_precision,analysis_date,period,assignment_method,assignment_rule_version,fasting,fasting_source,weight_kg,bmi,body_fat_percent,source_type,record_kind,entry_channel,device_name,companion_app,estimation,source_system,source_record_id,original_values,deduplication_key,created_by,deleted_at)
        VALUES ($1,$2,$3,'2024-04-04',$4,'Asia/Shanghai',480,$5,'2024-04-04',$6,'clock','fictional-v1',true,'user_confirmed',$7,23,20,'import',$8,'development_backend',$9,$10,$11,'fictional-external',$12,$13,$14,$2,$15)`,
      [id, owner, time, kind === "estimated" ? null : "2024-04-04T00:00:00Z", kind === "estimated" ? "day_period" : "second", id === "paired" || id === "deleted" ? "daytime" : "evening", id === "deleted" ? "71.00" : "70.00", kind, device, app,
        kind === "estimated" ? JSON.stringify({ method: "historical-initialization-v1", weightKg: { fictionalEvidence: true } }) : null, id, JSON.stringify({ sourceLocalTime: time, weightKg: "70.00", bmi: "23.00", bodyFatPercent: "20.00" }), id === "paired" ? oldKey : id, deleted ? "2024-04-05T00:00:00Z" : null]);
    }
    await pg.exec("INSERT INTO measurement_events(id,user_id,measurement_id,action,actor_type,actor_id,snapshot) VALUES ('old-event','fictional-owner','paired','import','user','fictional-owner','{\"bmi\":\"23.00\",\"fictional\":true}')");
    await pg.exec("INSERT INTO measurement_days(id,user_id,analysis_date,reminder_skipped_at,created_by) VALUES ('day','fictional-owner','2024-04-04','2024-04-04T12:00:00Z','fictional-owner')");
    const before = (await pg.query<Record<string, unknown>>("SELECT * FROM measurements ORDER BY id")).rows;
    const oldEvent = (await pg.query("SELECT * FROM measurement_events WHERE id='old-event'")).rows[0];
    const frozen = (await pg.query("SELECT * FROM measurement_imports")).rows;
    const days = (await pg.query("SELECT * FROM measurement_days")).rows;
    await pg.exec(await readFile("drizzle/0006_living_tarantula.sql", "utf8"));
    const columns = (await pg.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name='measurements'")).rows.map(row => row.column_name);
    assert.equal(columns.length, 31);
    for (const field of ["bmi", "device_name", "companion_app"]) assert.ok(!columns.includes(field));
    assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.id, "paired")))[0].deviceLabel, "虚构秤-虚构应用");
    assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.id, "device-only")))[0].deviceLabel, "虚构另一秤");
    assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.id, "app-only")))[0].deviceLabel, "虚构另一应用");
    for (const old of before) {
      const current = (await pg.query<Record<string, unknown>>("SELECT * FROM measurements WHERE id=$1", [old.id])).rows[0];
      for (const [field, value] of Object.entries(old)) if (!["bmi", "device_name", "companion_app"].includes(field)) assert.deepEqual(current[field], value, `${old.id}:${field}`);
    }
    assert.deepEqual((await pg.query("SELECT * FROM measurement_events WHERE id='old-event'")).rows[0], oldEvent);
    assert.deepEqual((await pg.query("SELECT * FROM measurement_imports")).rows, frozen);
    assert.deepEqual((await pg.query("SELECT * FROM measurement_days")).rows, days);
    assert.equal((await pg.query("SELECT * FROM measurement_events WHERE snapshot->>'reason'='schema_device_label_merge'")).rows.length, 3);
    await fillMissingMeasurementSources(db, { userId: "fictional-owner", actorId: "fictional-owner" }, "虚构已确认秤-应用");
    assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.id, "other")))[0].deviceLabel, null);
    assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.id, "estimate")))[0].deviceLabel, null);
    for (const contents of [
      "测量时间\t体重(kg)\tBMI\t体脂率(%)\n2024-04-04 08:00:00\t70\tignored\t20\n2024-04-04 09:00:00\t70\t99\t20",
      "测量时间\t体重(kg)\t体脂率(%)\n2024-04-04 09:00:00\t70\t20\n2024-04-04 08:00:00\t70\t20",
    ]) {
      const preview = previewMeasurementTsv(contents, "Asia/Shanghai", true);
      const result = await saveImportedMeasurements(db, { userId: "fictional-owner", actorId: "fictional-owner", sourceLabel: "fictional.tsv", captureChannel: "file", ...preview });
      assert.equal(result.inserted, 0); assert.equal(result.skipped, 2);
    }
    const deleted = (await db.select().from(schema.measurement).where(eq(schema.measurement.id, "deleted")))[0];
    assert.ok(deleted.deletedAt); assert.equal(deleted.weightKg, "71.00");
    assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.id, "paired")))[0].deduplicationKey, oldKey);
    const fatOnly = previewMeasurementTsv("测量时间\t体重(kg)\t体脂率(%)\n2024-04-05 20:00:00\t\t20", "Asia/Shanghai");
    assert.equal(fatOnly.records[0].weightKg, null);
    assert.equal((await saveImportedMeasurements(db, { userId: "fictional-other", actorId: "fictional-other", sourceLabel: "fictional.tsv", captureChannel: "file", ...fatOnly })).inserted, 1);
  } finally { await pg.close(); }
});
