import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
test("消耗迁移保留30张旧表字段值，仅增加5张表和可空关联", async () => {
  const pg = new PGlite();
  try {
    const files = (await readdir("drizzle")).filter(file => /^\d{4}_.*\.sql$/.test(file)).sort();
    for (const file of files.filter(file => file < "0019")) await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    await pg.exec("INSERT INTO users(id,name,email) VALUES ('energy-migration-owner','虚构用户','energy-migration@example.test'); INSERT INTO foods(id,user_id,name,identity_key,base_quantity,unit,calories_kcal,source_kind) VALUES ('energy-migration-food','energy-migration-owner','虚构食品','fictional',100,'g',123.4,'reference'); INSERT INTO record_operations(id,user_id,operation_id,request_digest,payload,draft) VALUES ('energy-migration-operation','energy-migration-owner','fictional-migration','fictional','{}','[]')");
    const tables = (await pg.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(row => row.table_name);
    assert.equal(tables.length, 30);
    const prior = new Map<string, Record<string, unknown>[]>();
    for (const table of tables) prior.set(table, (await pg.query<Record<string, unknown>>(`SELECT * FROM "${table}"`)).rows);
    await pg.exec(await readFile("drizzle/0019_needy_stephen_strange.sql", "utf8"));
    for (const table of tables) {
      const after = (await pg.query<Record<string, unknown>>(`SELECT * FROM "${table}"`)).rows;
      if (table === "record_operations") for (const row of after) { assert.equal(row.energy_operation_id, null); assert.equal(row.energy_revision, null); delete row.energy_operation_id; delete row.energy_revision; }
      assert.deepEqual(after, prior.get(table), table);
    }
    assert.equal((await pg.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows.length, 35);
    const oldDays = (await pg.query("SELECT * FROM energy_days")).rows;
    await pg.exec(await readFile("drizzle/0020_strange_meteorite.sql", "utf8"));
    assert.equal((await pg.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows.length, 36);
    assert.deepEqual((await pg.query("SELECT * FROM energy_defaults")).rows, []);
    assert.deepEqual((await pg.query("SELECT id,user_id,local_date,resting_kcal,active_kcal,total_kcal FROM energy_days")).rows, oldDays);
    await assert.rejects(pg.exec("INSERT INTO energy_days(id,user_id,local_date,timezone,resting_kcal) VALUES ('bad','energy-migration-owner','2024-08-01','Asia/Shanghai',-1)"));
  } finally { await pg.close(); }
});
