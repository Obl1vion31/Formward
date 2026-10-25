import assert from "node:assert/strict";
import {after,before,test} from "node:test";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import * as schema from "../../db/schema";
import {submitEnergyOperation,decideEnergyOperation,readEnergySnapshot} from "./records";
import {energyDays,type EnergyAction,type ActivityRecord} from "./model";
const pg=new PGlite(),db=drizzle(pg,{schema}),date="2024-08-01";
before(async()=>{await migrate(db,{migrationsFolder:"drizzle"});});after(async()=>{await pg.close();});
async function owner(){const id=randomUUID();await db.insert(schema.user).values({id,name:"虚构包含关系",email:id+"@example.test"});return {userId:id,origin:"manual" as const};}
type Actor=Awaited<ReturnType<typeof owner>>;
const total=(value="600"):EnergyAction=>({kind:"save_energy_day",date,entryMode:"total",totalKcal:value});
const run=(caloriesKcal:string|null="300",inclusion?:"included"|"additional"):EnergyAction=>({kind:"save_activity",date,name:"虚构运动",caloriesKcal,...(inclusion?{inclusion}:{})});
async function save(actor:Actor,actions:EnergyAction[]){const op=await submitEnergyOperation(db,actor,{operationId:randomUUID(),actions});assert.equal(op.canConfirm,true,JSON.stringify(op.rows));await decideEnergyOperation(db,actor.userId,op.id,op.revision,"confirm");return readEnergySnapshot(db,actor.userId);}
async function read(actor:Actor){return energyDays(await readEnergySnapshot(db,actor.userId),[],[date])[0];}
const update=(row:ActivityRecord,patch:object={}):EnergyAction=>({kind:"save_activity",id:row.id,version:row.version,date:row.date,name:row.name,caloriesKcal:row.caloriesKcal,...patch});
test("300和700均不按大小推断；已包含不加，额外增加才叠加且基准值不变",async()=>{
 for(const kcal of ["300","700"])for(const inclusion of ["included","additional"] as const){
  const actor=await owner();await save(actor,[total()]);
  const missing=await submitEnergyOperation(db,actor,{operationId:randomUUID(),actions:[run(kcal)]});assert.equal(missing.canConfirm,false);assert.equal(missing.rows[0].coverageQuestions?.length,1);
  const state=await save(actor,[run(kcal,inclusion)]),day=await read(actor);
  assert.equal(Number(day.totalKcal),600+(inclusion==="additional"?Number(kcal):0));assert.equal(Number(state.days[0].totalKcal),600);
  assert.equal(state.activities[0].inclusion,inclusion);
 }
});
test("先运动后总数、同批两种顺序及分项活动合计采用相同规则",async()=>{
 const actor=await owner();const state=await save(actor,[run("300")]);
 const op=await submitEnergyOperation(db,actor,{operationId:randomUUID(),actions:[total()]});assert.equal(op.canConfirm,false);assert.equal(op.rows[0].coverageQuestions?.length,1);
 await save(actor,[total(),update(state.activities[0],{inclusion:"included"})]);assert.equal(Number((await read(actor)).totalKcal),600);
 for(const reversed of [false,true]){
  const owner2=await owner(),actions=[total(),run("300","additional")];await save(owner2,reversed?actions.reverse():actions);assert.equal(Number((await read(owner2)).totalKcal),900);
 }
 const owner3=await owner();await save(owner3,[{kind:"save_energy_day",date,entryMode:"components",activityMode:"total",restingKcal:"1800",activeKcal:"400"},run("200","additional")]);
 assert.equal(Number((await read(owner3)).totalKcal),2400);assert.equal(Number((await read(owner3)).activeKcal),600);
});
test("纯运动累计不询问；未知额外不补0，已包含未知可保留，明确0正常参与",async()=>{
 const actor=await owner();await save(actor,[{kind:"save_energy_day",date,entryMode:"components",activityMode:"activities",restingKcal:"1800"},run("400")]);assert.equal(Number((await read(actor)).totalKcal),2200);
 for(const inclusion of ["included","additional"] as const){const a=await owner();await save(a,[total(),run(null,inclusion)]);assert.equal((await read(a)).totalKcal===null,inclusion==="additional");}
 const a=await owner();await save(a,[total("0"),run("0","additional")]);assert.equal(Number((await read(a)).totalKcal),0);
});
test("总数变化须重新核对，来源备注不重问；旧无关系明细不自动多加",async()=>{
 const actor=await owner();let state=await save(actor,[total(),run("300","included")]),record=state.days[0];
 state=await save(actor,[{kind:"save_energy_day",id:record.id,version:record.version,date,sourceSystem:"虚构来源",notes:"只改说明"}]);assert.equal(Number((await read(actor)).totalKcal),600);record=state.days[0];
 const op=await submitEnergyOperation(db,actor,{operationId:randomUUID(),actions:[{kind:"save_energy_day",id:record.id,version:record.version,date,totalKcal:"700"}]});assert.equal(op.canConfirm,false);
 state=await save(actor,[{kind:"save_energy_day",id:record.id,version:record.version,date,totalKcal:"700"},update(state.activities[0],{inclusion:"additional"})]);assert.equal(Number((await read(actor)).totalKcal),1000);
 const old=await owner();await save(old,[run("300")]);const s=await readEnergySnapshot(db,old.userId);
 await db.insert(schema.energyDay).values({id:randomUUID(),userId:old.userId,date,entryMode:"total",totalKcal:"600",timezone:"Asia/Shanghai"});
 assert.equal(Number((await read(old)).totalKcal),600);assert.equal(s.activities[0].inclusion,null);
});
test("删除恢复不重复加；总数变化后恢复必须明确关系，跨账号与幂等保护保持",async()=>{
 const actor=await owner();let state=await save(actor,[total(),run("300","additional")]),activity=state.activities[0];
 state=await save(actor,[{kind:"delete_activity",id:activity.id,version:activity.version}]);assert.equal(Number((await read(actor)).totalKcal),600);
 activity=state.activities[0];const day=state.days[0];state=await save(actor,[{kind:"save_energy_day",id:day.id,version:day.version,date,totalKcal:"800"}]);
 const missing=await submitEnergyOperation(db,actor,{operationId:randomUUID(),actions:[{kind:"restore_activity",id:activity.id,version:activity.version}]});assert.equal(missing.canConfirm,false);
 state=await save(actor,[{kind:"restore_activity",id:activity.id,version:activity.version,inclusion:"included"}]);assert.equal(Number((await read(actor)).totalKcal),800);
 const other=await owner(),foreign=await submitEnergyOperation(db,other,{operationId:randomUUID(),actions:[update(state.activities[0],{inclusion:"additional"})]});assert.equal(foreign.canConfirm,false);
 const input={operationId:randomUUID(),actions:[run("1","additional")]},op=await submitEnergyOperation(db,actor,input);await decideEnergyOperation(db,actor.userId,op.id,op.revision,"confirm");await decideEnergyOperation(db,actor.userId,op.id,op.revision,"confirm");assert.equal(Number((await read(actor)).totalKcal),801);
 assert.equal((await submitEnergyOperation(db,actor,input)).id,op.id);
 await assert.rejects(submitEnergyOperation(db,actor,{...input,actions:[run("1","included")]}));
});
