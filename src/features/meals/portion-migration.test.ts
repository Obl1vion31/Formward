import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {test} from "node:test";
import {PGlite} from "@electric-sql/pglite";
test("0024只加兼容列；旧营养、份数、运动、来源、版本和时间完整保留",async()=>{
 const pg=new PGlite();try{
  for(const file of (await readdir("drizzle")).filter(file=>/^\d{4}_.*\.sql$/.test(file)&&file<"0024").sort())await pg.exec(await readFile("drizzle/"+file,"utf8"));
  await pg.exec("INSERT INTO users(id,name,email) VALUES('portion-migration','虚构迁移用户','portion-migration@example.test')");
  await pg.exec("INSERT INTO foods(id,user_id,name,identity_key,base_quantity,unit,source_kind,calories_kcal) VALUES('food','portion-migration','虚构食品','fictional',100,'g','estimated',200)");
  await pg.exec("INSERT INTO meals(id,user_id,local_date,meal_type,source) VALUES('meal','portion-migration','2024-08-01','午餐','manual')");
  await pg.exec("INSERT INTO meal_items(id,user_id,meal_id,position,kind,name,quantity,unit,source_kind,calories_kcal,protein_g) VALUES('item','portion-migration','meal',0,'food','虚构旧总量',2,'份','estimated',90,0)");
  await pg.exec("INSERT INTO activities(id,user_id,local_date,name,timezone,calories_kcal) VALUES('activity','portion-migration','2024-08-01','虚构旧活动','Asia/Shanghai',300)");
  const names=["foods","meals","meal_items","activities"],before=new Map<string,Record<string,unknown>[]>();
  for(const name of names)before.set(name,(await pg.query<Record<string,unknown>>("SELECT * FROM "+name+" ORDER BY id")).rows);
  await pg.exec(await readFile("drizzle/0024_tan_starjammers.sql","utf8"));
  for(const name of names){const rows=(await pg.query<Record<string,unknown>>("SELECT * FROM "+name+" ORDER BY id")).rows,old=before.get(name)!;assert.deepEqual(rows.map(row=>Object.fromEntries(Object.keys(old[0]).map(key=>[key,row[key]]))),old);}
  const item=(await pg.query<Record<string,unknown>>("SELECT * FROM meal_items")).rows[0];assert.equal(item.nutrition_basis,"consumed_total");assert.equal(item.per_portion_nutrition,null);
  assert.equal((await pg.query<Record<string,unknown>>("SELECT inclusion FROM activities")).rows[0].inclusion,null);
  await assert.rejects(pg.exec("UPDATE foods SET serving_unit='包'"));
  await assert.rejects(pg.exec("UPDATE foods SET serving_unit='g',serving_quantity=50"));
  await assert.rejects(pg.exec("UPDATE activities SET inclusion_basis='unpaired'"));
  await assert.rejects(pg.exec("UPDATE meal_items SET nutrition_basis='per_portion'"));
  await pg.exec("UPDATE foods SET serving_unit='包',serving_quantity=50");
  assert.equal((await pg.query<Record<string,unknown>>("SELECT calories_kcal::text AS n FROM meal_items")).rows[0].n,"90.0000");
 }finally{await pg.close();}
});
