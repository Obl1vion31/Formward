import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {test} from "node:test";
import {PGlite} from "@electric-sql/pglite";

test("0023只建状态结构，不初始化任何账号或更改既有事实",async()=>{
 const pg=new PGlite();try{
  for(const file of(await readdir("drizzle")).filter(f=>/^\d{4}_.*\.sql$/.test(f)&&f<"0023").sort())await pg.exec(await readFile("drizzle/"+file,"utf8"));
  await pg.exec("INSERT INTO users(id,name,email) VALUES ('day-a','虚构甲','day-a@example.test'),('day-b','虚构乙','day-b@example.test')");
  for(const [id,user,date,deleted] of [["a","day-a","2026-10-22",false],["b","day-a","2026-10-22",false],["c","day-a","2026-10-24",false],["d","day-a","2026-10-21",true],["e","day-b","2026-10-23",false]]){
   await pg.query("INSERT INTO meals(id,user_id,local_date,meal_type,source,deleted_at) VALUES($1,$2,$3,'午餐','manual',$4)",[id,user,date,deleted?new Date():null]);
  }
  const before=(await pg.query("SELECT * FROM meals ORDER BY id")).rows,migration=await readFile("drizzle/0023_amused_master_mold.sql","utf8");await pg.exec(migration);
  assert.deepEqual((await pg.query("SELECT * FROM meals ORDER BY id")).rows,before);
  assert.equal((await pg.query("SELECT * FROM meal_days")).rows.length,0);
  assert.equal((await pg.query("SELECT * FROM meal_day_events")).rows.length,0);
 }finally{await pg.close();}
});
