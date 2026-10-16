import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {test} from "node:test";
import {PGlite} from "@electric-sql/pglite";
test("合并营养来源迁移保留旧食材，接受reference并继续拒绝未知枚举",async()=>{
 const pg=new PGlite();
 try{
  for(const file of (await readdir("drizzle")).filter(file=>/^00(?:0\d|1[0-5])_.*\.sql$/.test(file)).sort())await pg.exec(await readFile(`drizzle/${file}`,"utf8"));
  await pg.exec("INSERT INTO users(id,name,email) VALUES ('source-owner','虚构来源用户','source@example.test')");
  const insert="INSERT INTO foods(id,user_id,name,identity_key,base_quantity,unit,source_kind,basis) VALUES ($1,'source-owner',$1,$1,100,'g',$2,'虚构依据')";
  for(const source of ["label","composition_table","estimated","unknown"])await pg.query(insert,[source,source]);
  const before=(await pg.query("SELECT * FROM foods ORDER BY id")).rows;
  await pg.exec(await readFile("drizzle/0016_silly_adam_warlock.sql","utf8"));
  assert.deepEqual((await pg.query("SELECT * FROM foods ORDER BY id")).rows,before);
  await pg.query(insert,["reference","reference"]);
  await assert.rejects(pg.query(insert,["invalid","invalid"]));
 }finally{await pg.close();}
});
test("食材分类迁移只加默认分类，保留旧列和值",async()=>{
 const pg=new PGlite();try{
  for(const file of (await readdir("drizzle")).filter(file=>/^00(?:0\d|1[0-6])_.*\.sql$/.test(file)).sort())await pg.exec(await readFile(`drizzle/${file}`,"utf8"));
  await pg.exec("INSERT INTO users(id,name,email) VALUES ('category-owner','虚构分类用户','category@example.test'); INSERT INTO foods(id,user_id,name,identity_key,base_quantity,unit,calories_kcal,source_kind) VALUES ('f','category-owner','虚构食材','f',100,'g',123.4,'estimated')");
  const before=(await pg.query("SELECT * FROM foods")).rows[0];await pg.exec(await readFile("drizzle/0017_dry_pandemic.sql","utf8"));
  const {category,...after}=(await pg.query<Record<string,unknown>>("SELECT * FROM foods")).rows[0];assert.equal(category,"ingredient");assert.deepEqual(after,before);
  await pg.exec("UPDATE foods SET category='meal'");await assert.rejects(pg.exec("UPDATE foods SET category='other'"));
 }finally{await pg.close();}
});
