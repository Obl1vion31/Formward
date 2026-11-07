import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,before,test} from "node:test";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import * as schema from "../../db/schema";
import {emptyNutrition,type MealDraft,type MealInput} from "../meals/model";
import {submitMealOperation,decideMealOperation,readMealSnapshot} from "../meals/records";
import {submitEnergyOperation,decideEnergyOperation,readEnergySnapshot} from "../activities/records";
import {mealWebIssue,energyWebIssue,sameMealAmounts,sameEnergyAmounts} from "./web-entry";
import {checkWebMeals,checkWebEnergy} from "./web-entry-server";

const pg=new PGlite(),db=drizzle(pg,{schema});
before(async()=>{await migrate(db,{migrationsFolder:"./drizzle"});});
after(async()=>{await pg.close();});
const meal=(nutrition=emptyNutrition()):MealDraft=>({date:"2026-10-30",mealType:"午餐",items:[{name:"虚构食物",kind:"food",unit:"份",quantity:"1",sourceKind:"reference",nutritionBasis:"consumed_total",nutrition}]});
const owner=async()=>{const id=randomUUID();await db.insert(schema.user).values({id,email:id+"@example.test",name:"虚构填写验收"});return id;};
test("网页允许营养未知或全零，仍拒绝空餐、非法数量和日期",()=>{
 assert.equal(mealWebIssue(meal(),emptyNutrition()),null);
 const zero={caloriesKcal:"0",proteinG:"0",carbsG:"0",fatG:"0"};
 assert.equal(mealWebIssue(meal(zero),zero),null);
 assert.ok(mealWebIssue({...meal(),items:[]},emptyNutrition()));
 assert.ok(mealWebIssue({...meal(),items:[{...meal().items[0],name:" "}]},emptyNutrition()));
 const partial={...emptyNutrition(),proteinG:"20"};
 assert.equal(mealWebIssue(meal(partial),partial),null);
 const large={caloriesKcal:"700000",proteinG:null,carbsG:null,fatG:null};
 assert.equal(mealWebIssue({...meal(large),items:[meal(large).items[0],meal(large).items[0]]},{...large,caloriesKcal:"1400000.0000"}),null);
 assert.ok(mealWebIssue({...meal(partial),items:[{...meal(partial).items[0],quantity:"0"}]},partial));
 assert.ok(mealWebIssue({...meal(partial),date:"2026-02-30"},partial));
});
test("消耗只检查采用模式，分项未知与活动零不误判",()=>{
 assert.ok(energyWebIssue({kind:"save_energy_day",date:"2026-10-30",entryMode:"components",restingKcal:null,activeKcal:"0"},"0"));
 assert.equal(energyWebIssue({kind:"save_energy_day",date:"2026-10-30",restingKcal:"2058",activeKcal:"0"},"0"),null);
 assert.equal(energyWebIssue({kind:"save_energy_day",date:"2026-10-30",activityMode:"activities"},"300"),null);
 assert.ok(energyWebIssue({kind:"save_energy_day",date:"2026-10-30",entryMode:"total",totalKcal:null,restingKcal:"2058"},"300"));
 assert.equal(energyWebIssue({kind:"save_energy_day",date:"2026-10-30",entryMode:"total",totalKcal:"2000",restingKcal:"invalid"},"0"),null);
});
test("网页后台允许未知和零营养，消耗保留原正值门槛",async()=>{
 const id=await owner(),input:MealInput={operationId:randomUUID(),actions:[{kind:"save_meal",...meal()}]};
 await checkWebMeals(db,id,input);
 const operation=await submitMealOperation(db,{userId:id,origin:"manual"},input);
 await decideMealOperation(db,id,operation.id,operation.revision,"confirm",true);
 assert.equal((await readMealSnapshot(db,id)).meals.length,1);
 const energy={operationId:randomUUID(),actions:[{kind:"save_energy_day" as const,date:"2026-10-30",restingKcal:"0",activeKcal:"0"}]};
 await assert.rejects(checkWebEnergy(db,id,energy));
 const op=await submitEnergyOperation(db,{userId:id,origin:"manual"},energy);await decideEnergyOperation(db,id,op.id,op.revision,"confirm");
 assert.equal((await readEnergySnapshot(db,id)).days.length,1);
});
test("服务器核对本人旧记录，备注修改保留原未知与四位精度",async()=>{
 const id=await owner(),input={operationId:randomUUID(),actions:[{kind:"save_meal" as const,...meal({caloriesKcal:"0.0000",proteinG:null,carbsG:null,fatG:null})}]};
 const op=await submitMealOperation(db,{userId:id,origin:"manual"},input);await decideMealOperation(db,id,op.id,op.revision,"confirm",true);
 const current=(await readMealSnapshot(db,id)).meals[0];
 const draft:MealDraft={id:current.id,version:current.version,date:current.date,mealType:current.mealType,notes:"只改备注",items:current.items.map(i=>({originalItemId:i.id,kind:i.kind,name:i.name,quantity:i.quantity,unit:i.unit,sourceKind:i.sourceKind,nutritionBasis:i.nutritionBasis,nutrition:i.nutrition}))};
 const edited={operationId:randomUUID(),actions:[{kind:"save_meal" as const,...draft}]};
 await checkWebMeals(db,id,edited);
 const editedOp=await submitMealOperation(db,{userId:id,origin:"manual"},edited);await decideMealOperation(db,id,editedOp.id,editedOp.revision,"confirm",true);
 const preserved=(await readMealSnapshot(db,id)).meals[0];assert.equal(preserved.notes,"只改备注");assert.equal(preserved.items[0].nutrition.caloriesKcal,"0.0000");
 await assert.rejects(checkWebMeals(db,await owner(),{operationId:randomUUID(),actions:[{kind:"save_meal",...draft}]}));
 assert.equal(sameMealAmounts(draft,{...draft,notes:"另一个备注"}),true);
 assert.equal(sameMealAmounts(draft,{...draft,items:[{...draft.items[0],quantity:"2"}]}),false);
 const e={operationId:randomUUID(),actions:[{kind:"save_energy_day" as const,date:"2026-10-30",entryMode:"components" as const,activityMode:"total" as const,restingKcal:"0.0000",activeKcal:"0"}]};
 const ep=await submitEnergyOperation(db,{userId:id,origin:"manual"},e);await decideEnergyOperation(db,id,ep.id,ep.revision,"confirm");
 const day=(await readEnergySnapshot(db,id)).days[0];
 const energyEdit={operationId:randomUUID(),actions:[{kind:"save_energy_day" as const,id:day.id,version:day.version,date:day.date,entryMode:"components" as const,activityMode:"total" as const,restingKcal:day.restingKcal,activeKcal:day.activeKcal,notes:"保留原精度"}]};
 await checkWebEnergy(db,id,energyEdit);const savedEdit=await submitEnergyOperation(db,{userId:id,origin:"manual"},energyEdit);await decideEnergyOperation(db,id,savedEdit.id,savedEdit.revision,"confirm");
 assert.equal(sameEnergyAmounts(day,{...day,notes:"不同备注"} as typeof day),true);
 assert.equal((await readEnergySnapshot(db,id)).days[0].restingKcal,"0.0000");
});

test("已确认的相同网页请求保持幂等，换内容不能绕过新校验",async()=>{
 const id=await owner(),m={operationId:randomUUID(),actions:[{kind:"save_meal" as const,...meal({caloriesKcal:"100",proteinG:null,carbsG:null,fatG:null})}]};
 await checkWebMeals(db,id,m);const op=await submitMealOperation(db,{userId:id,origin:"manual"},m);await decideMealOperation(db,id,op.id,op.revision,"confirm",true);
 await checkWebMeals(db,id,m);
 const changed={...m,actions:[{kind:"save_meal" as const,...meal()}]};
 await checkWebMeals(db,id,changed);
 await assert.rejects(submitMealOperation(db,{userId:id,origin:"manual"},changed),error=>error instanceof Error&&"code" in error&&error.code==="request_conflict");
 const e={operationId:randomUUID(),actions:[{kind:"save_energy_day" as const,date:"2026-10-29",restingKcal:"2058",activeKcal:"0"}]};
 await checkWebEnergy(db,id,e);const ep=await submitEnergyOperation(db,{userId:id,origin:"manual"},e);await decideEnergyOperation(db,id,ep.id,ep.revision,"confirm");
 await checkWebEnergy(db,id,e);
 assert.equal((await readMealSnapshot(db,id)).meals.length,1);
 assert.equal((await readEnergySnapshot(db,id)).days.length,1);
});

test("AI手工修改沿用本批食材换算，不重新限制未修改的旧预览",async()=>{
 const {recordMealPlanner}=await import("./operations");
 const id=await owner(),date="2026-10-30",nutrition={caloriesKcal:"100",proteinG:"20",carbsG:"0",fatG:"0"};
 const food={kind:"save_food" as const,name:"虚构食材",category:"ingredient" as const,baseQuantity:"1",unit:"份",nutrition,sourceKind:"reference" as const};
 const action={kind:"save_meal" as const,date,mealType:"午餐",items:[{kind:"food" as const,name:"虚构食材",sourceKind:"reference" as const,foodRef:"food",quantity:"2",unit:"份"}]};
 const actions=[{key:"food",action:food,originalInput:food,excluded:false,checked:false},{key:"meal",action,originalInput:action,excluded:false,checked:false},{key:"old-unknown",action:{kind:"save_meal" as const,...meal()},originalInput:{kind:"save_meal" as const,...meal()},excluded:false,checked:false}];
 await checkWebMeals(db,id,{operationId:randomUUID(),actions:[action]},recordMealPlanner(actions,"preview"),"meal");
 const empty=actions.map(item=>item.key==="food"?{...item,action:{...food,nutrition:emptyNutrition()}}:item);
 await checkWebMeals(db,id,{operationId:randomUUID(),actions:[action]},recordMealPlanner(empty,"preview"),"meal");
});

test("AI仅限制正在手工修改的消耗，其他旧零值预览不被重新限制",async()=>{
 const id=await owner(),actions=[{kind:"save_energy_day" as const,date:"2026-10-29",restingKcal:"0",activeKcal:"0"},{kind:"save_energy_day" as const,date:"2026-10-30",restingKcal:"2058",activeKcal:"0"}];
 const input={operationId:randomUUID(),actions};await checkWebEnergy(db,id,input,1);await assert.rejects(checkWebEnergy(db,id,input,0));await assert.rejects(checkWebEnergy(db,id,input));assert.equal((await readEnergySnapshot(db,id)).days.length,0);
 const op=await submitEnergyOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_energy_day",date:"2026-10-30",entryMode:"total",totalKcal:"2000"}]});await decideEnergyOperation(db,id,op.id,op.revision,"confirm");
 const old=(await readEnergySnapshot(db,id)).days[0];
 await assert.rejects(checkWebEnergy(db,id,{operationId:randomUUID(),actions:[{kind:"save_energy_day",id:old.id,version:old.version,date:old.date,entryMode:"total",totalKcal:null,restingKcal:"2058"}]}));
});
