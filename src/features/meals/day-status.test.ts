import assert from "node:assert/strict";
import { after,before,test } from "node:test";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import {eq} from "drizzle-orm";
import * as schema from "../../db/schema";
import {readMealSnapshot,submitMealOperation,decideMealOperation} from "./records";
import {initializeHistoricalMealDays,setMealDayStatus} from "./day-status";
import {dailyTotals,type MealAction,type MealDayInput} from "./model";
import {overviewDays} from "../dashboard/model";
import {emptyEnergy} from "../activities/model";
const pg=new PGlite(),db=drizzle(pg,{schema});
before(async()=>{await migrate(db,{migrationsFolder:"./drizzle"});});after(async()=>{await pg.close();});
async function owner(){const id=randomUUID();await db.insert(schema.user).values({id,name:"虚构日记用户",email:id+"@example.test"});return id;}
const action=(date="2026-10-24",caloriesKcal:string|null="600"):MealAction=>({kind:"save_meal",date,mealType:"午餐",items:[{kind:"food",name:"虚构餐"+randomUUID(),nutrition:{caloriesKcal,proteinG:null,carbsG:"0",fatG:null},sourceKind:"estimated"}]});
async function save(userId:string,actions:MealAction[]){const op=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions});assert.equal(op.canConfirm,true,JSON.stringify(op.rows));await decideMealOperation(db,userId,op.id,op.revision,"confirm");return op;}
async function mark(userId:string,status:"complete"|"incomplete",date="2026-10-24"){const day=dailyTotals((await readMealSnapshot(db,userId)).meals).find(d=>d.date===date)!.day;const request={...day,status,operationId:randomUUID()};const {source,...input}=request;void source;await setMealDayStatus(db,userId,input);return input;}
async function state(userId:string,date="2026-10-24"){return dailyTotals((await readMealSnapshot(db,userId)).meals).find(d=>d.date===date)!.day;}
const rejects=(work:Promise<unknown>,code:string)=>assert.rejects(work,e=>e instanceof Error&&"code"in e&&e.code===code);
test("新餐日待确认；历史截止日前的新补录也不再自动记完",async()=>{
 const id=await owner();await save(id,[action(),action("2026-10-01")]);
 assert.equal((await state(id)).status,"unconfirmed");assert.equal((await state(id,"2026-10-01")).status,"unconfirmed");
});
test("已记完可计差额，未记全保留摄入但排除；明确0保持",async()=>{
 const id=await owner();await save(id,[action("2026-10-24","0")]);await mark(id,"complete");
 const energy={...emptyEnergy(),days:[{id:randomUUID(),version:1,deletedAt:null,date:"2026-10-24",entryMode:"total" as const,totalKcal:"200",restingKcal:null,activeKcal:null,timezone:"Asia/Shanghai",sourceSystem:null,sourceRecordId:null,sourceOccurredAt:null,sourceUnit:"kcal" as const,syncStatus:"confirmed" as const}]};
 let result=overviewDays((await readMealSnapshot(db,id)).meals,[],["2026-10-24"],false,energy)[0];assert.equal(result.energyBalance,-200);
 await mark(id,"incomplete");result=overviewDays((await readMealSnapshot(db,id)).meals,[],["2026-10-24"],false,energy)[0];assert.equal(result.energyBalance,null);assert.equal(result.nutrition?.values.caloriesKcal,"0.0000");
});
test("确认绑定当前餐次，新增餐次需重新确认；重复保存不作废后来的确认",async()=>{
 const id=await owner(),op=await save(id,[action()]);const input=await mark(id,"complete");assert.equal((await state(id)).status,"complete");
 await decideMealOperation(db,id,op.id,op.revision,"confirm");assert.equal((await state(id)).status,"complete");
 await setMealDayStatus(db,id,input);assert.equal((await state(id)).status,"complete");
 await save(id,[action()]);assert.equal((await state(id)).status,"unconfirmed");
 await setMealDayStatus(db,id,input);assert.equal((await state(id)).status,"unconfirmed","旧确认幂等返回不能确认后来新增的餐");
});
test("改日同时作废原日和目标日确认，删除恢复后也需再确认",async()=>{
 const id=await owner();await save(id,[action(),action("2026-10-23")]);await mark(id,"complete");await mark(id,"complete","2026-10-23");
 const meal=(await readMealSnapshot(db,id)).meals.find(m=>m.date==="2026-10-24")!;
 await save(id,[{...action("2026-10-23"),id:meal.id,version:meal.version} as MealAction]);
 assert.equal((await state(id,"2026-10-23")).status,"unconfirmed");const [old]=await db.select().from(schema.mealDay).where(eq(schema.mealDay.date,"2026-10-24"));assert.equal(old.status,"unconfirmed");
 await mark(id,"complete","2026-10-23");const moved=(await readMealSnapshot(db,id)).meals.find(m=>m.id===meal.id)!;
 await save(id,[{kind:"delete_meal",id:moved.id,version:moved.version}]);assert.equal((await state(id,"2026-10-23")).status,"unconfirmed");
 const deleted=(await readMealSnapshot(db,id)).meals.find(m=>m.id===meal.id)!;await mark(id,"complete","2026-10-23");
 await save(id,[{kind:"restore_meal",id:deleted.id,version:deleted.version}]);assert.equal((await state(id,"2026-10-23")).status,"unconfirmed");
});
test("跨账号、过期版本、同请求异内容、空日和非法日期均拒绝",async()=>{
 const id=await owner(),other=await owner();await save(id,[action()]);const day=await state(id),input:MealDayInput={operationId:randomUUID(),date:day.date,version:day.version,contentDigest:day.contentDigest,status:"complete"};
 await rejects(setMealDayStatus(db,other,input),"empty_day");await rejects(setMealDayStatus(db,id,{...input,version:0}),"version_conflict");
 await setMealDayStatus(db,id,input);await rejects(setMealDayStatus(db,id,{...input,status:"incomplete"}),"request_conflict");
 await rejects(setMealDayStatus(db,id,{...input,operationId:randomUUID(),date:"2026-02-30"}),"invalid_input");
 await rejects(setMealDayStatus(db,id,{...input,operationId:randomUUID(),date:"2026-10-20"}),"empty_day");
});
test("日状态审计失败整笔餐次写入回滚",async()=>{
 const id=await owner();await pg.exec("ALTER TABLE meal_day_events ADD CONSTRAINT day_test_failure CHECK(user_id <> '"+id+"')");
 try{await assert.rejects(save(id,[action()]));assert.equal((await readMealSnapshot(db,id)).meals.length,0);assert.equal((await db.select().from(schema.mealDay).where(eq(schema.mealDay.userId,id))).length,0);}
 finally{await pg.exec("ALTER TABLE meal_day_events DROP CONSTRAINT day_test_failure");}
});

test("历史初始化只处理指定账号、截止内有效餐；重复执行不覆盖确认与后来修改",async()=>{
 const id=await owner(),other=await owner();
 await save(id,[action("2026-10-22"),action("2026-10-23"),action("2026-10-24")]);
 await save(other,[action("2026-10-22")]);
 await mark(id,"incomplete","2026-10-23");
 assert.deepEqual((await initializeHistoricalMealDays(db,id)).dates,["2026-10-22"]);
 assert.equal((await state(id,"2026-10-22")).status,"complete");
 assert.equal((await state(id,"2026-10-23")).status,"incomplete");
 assert.equal((await state(id,"2026-10-24")).status,"unconfirmed");
 assert.equal((await state(other,"2026-10-22")).status,"unconfirmed");
 await save(id,[action("2026-10-22")]);
 assert.deepEqual((await initializeHistoricalMealDays(db,id)).dates,[]);
 assert.equal((await state(id,"2026-10-22")).status,"unconfirmed");
});
