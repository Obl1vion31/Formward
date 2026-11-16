import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
test("0041只扩展三表，旧值、版本、账号和身体事实保持，缺省性别不回填",async()=>{
 const pg=new PGlite();try{
  const files=(await readdir("drizzle")).filter(file=>/^\d{4}_.*\.sql$/.test(file)).sort();
  for(const file of files.filter(file=>file<"0041"))await pg.exec(await readFile("drizzle/"+file,"utf8"));
  await pg.exec("INSERT INTO users(id,name,email) VALUES ('calculation-migration','虚构迁移用户','calculation-migration@example.test'); INSERT INTO personal_profiles(user_id,height_cm,birth_date,version) VALUES ('calculation-migration',173.5,'2004-06-03',3); INSERT INTO account_preferences(user_id,show_body_fat,version) VALUES ('calculation-migration',true,4); INSERT INTO energy_days(id,user_id,local_date,timezone,entry_mode,activity_mode,resting_kcal,active_kcal) VALUES ('calculation-migration-day','calculation-migration','2025-06-03','Asia/Shanghai','components','total',2058,0)");
  const tables=(await pg.query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(row=>row.table_name),prior=new Map();
  for(const table of tables)prior.set(table,(await pg.query(`SELECT * FROM "${table}"`)).rows);
  await pg.exec(await readFile("drizzle/0041_energy_calculation.sql","utf8"));
  const added:Record<string,string[]>={personal_profiles:["sex_for_calculation"],account_preferences:["energy_resting_method","energy_formula"],energy_days:["resting_input_method","calculation_snapshot"]};
  for(const table of tables){const rows=(await pg.query<Record<string,unknown>>(`SELECT * FROM "${table}"`)).rows;for(const row of rows){if(table==="personal_profiles")assert.equal(row.sex_for_calculation,null);if(table==="account_preferences"){assert.equal(row.energy_resting_method,"estimate");assert.equal(row.energy_formula,"auto");}for(const column of added[table]??[])delete row[column];}assert.deepEqual(rows,prior.get(table),table);}
  await assert.rejects(pg.exec("UPDATE personal_profiles SET sex_for_calculation='invalid'"));await assert.rejects(pg.exec("UPDATE account_preferences SET energy_formula='invalid'"));await assert.rejects(pg.exec("UPDATE energy_days SET resting_input_method='invalid'"));
  await pg.exec("UPDATE energy_days SET notes='旧版备注' WHERE id='calculation-migration-day'");assert.equal((await pg.query<{active_kcal:string}>("SELECT active_kcal FROM energy_days WHERE id='calculation-migration-day'")).rows[0].active_kcal,"0.0000");
 }finally{await pg.close();}
});
test("消耗来源迁移仅增加建议元数据，按账号去重并保留全部旧表和值", async () => {
  const pg = new PGlite();
  try {
    const files = (await readdir("drizzle")).filter(file => /^\d{4}_.*\.sql$/.test(file)).sort();
    for (const file of files.filter(file => file < "0022")) await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    await pg.exec(`INSERT INTO users(id,name,email) VALUES ('source-owner','虚构甲','source-a@example.test'),('source-other','虚构乙','source-b@example.test');
      INSERT INTO energy_days(id,user_id,local_date,timezone,source_system,resting_source_system,active_source_system,updated_at) VALUES
      ('source-day','source-owner','2024-08-01','Asia/Shanghai','虚构手表','虚构手表',' 虚构应用 ','2024-08-02'),
      ('source-other-day','source-other','2024-08-01','Asia/Shanghai','虚构手表',NULL,NULL,'2024-08-01');
      INSERT INTO activities(id,user_id,local_date,timezone,name,source_system) VALUES ('source-activity','source-owner','2024-08-03','Asia/Shanghai','虚构活动','虚构手表');
      INSERT INTO activities(id,user_id,local_date,timezone,name,source_system,deleted_at) VALUES ('source-deleted','source-owner','2024-08-04','Asia/Shanghai','虚构删除','不应出现',now());
      INSERT INTO measurement_sources(user_id,label) VALUES ('source-owner','仅身体来源');`);
    const tables = (await pg.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(row => row.table_name);
    const prior = new Map<string, Record<string, unknown>[]>();
    for (const table of tables) prior.set(table, (await pg.query<Record<string, unknown>>(`SELECT * FROM "${table}"`)).rows);
    await pg.exec(await readFile("drizzle/0022_daily_marauders.sql", "utf8"));
    for (const table of tables) assert.deepEqual((await pg.query(`SELECT * FROM "${table}"`)).rows, prior.get(table), table);
    assert.deepEqual((await pg.query("SELECT user_id,label FROM energy_sources ORDER BY user_id,label")).rows, [{ user_id: "source-other", label: "虚构手表" }, { user_id: "source-owner", label: "虚构应用" }, { user_id: "source-owner", label: "虚构手表" }]);
    assert.equal((await pg.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows.length, tables.length + 1);
  } finally { await pg.close(); }
});
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

test("显式消耗模式迁移保留36张表的原字段和值，旧行不补零或重解释", async () => {
  const pg = new PGlite();
  try {
    const files = (await readdir("drizzle")).filter(file => /^\d{4}_.*\.sql$/.test(file)).sort();
    for (const file of files.filter(file => file < "0021")) await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    await pg.exec("INSERT INTO users(id,name,email) VALUES ('mode-owner','虚构用户','mode@example.test'); INSERT INTO energy_days(id,user_id,local_date,timezone,resting_kcal,active_kcal,total_kcal,source_system) VALUES ('mode-day','mode-owner','2024-08-01','Asia/Shanghai',1900,NULL,2400,'虚构设备'); INSERT INTO energy_defaults(id,user_id,resting_from,resting_kcal) VALUES ('mode-default','mode-owner','2024-08-01',2100)");
    const tables = (await pg.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(row => row.table_name);
    assert.equal(tables.length, 36);
    const prior = new Map<string, Record<string, unknown>[]>();
    for (const table of tables) prior.set(table, (await pg.query<Record<string, unknown>>(`SELECT * FROM "${table}"`)).rows);
    await pg.exec(await readFile("drizzle/0021_tranquil_leo.sql", "utf8"));
    for (const table of tables) {
      const after = (await pg.query<Record<string, unknown>>(`SELECT * FROM "${table}"`)).rows;
      if (table === "energy_days") for (const row of after) { assert.equal(row.entry_mode, null); assert.equal(row.activity_mode, null); assert.equal(row.resting_estimated, false); for (const field of ["entry_mode", "activity_mode", "resting_source_system", "active_source_system", "resting_estimated"]) delete row[field]; }
      assert.deepEqual(after, prior.get(table), table);
    }
    await assert.rejects(pg.exec("UPDATE energy_days SET entry_mode='invalid' WHERE id='mode-day'"));
  } finally { await pg.close(); }
});
