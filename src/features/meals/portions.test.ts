import assert from "node:assert/strict";
import {after,before,test} from "node:test";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import * as schema from "../../db/schema";
import {submitMealOperation,decideMealOperation,readMealSnapshot} from "./records";
import {previewFoodMaintenance,applyFoodMaintenance} from "./food-maintenance";
import {emptyNutrition,type MealAction,type ItemDraft} from "./model";
const pg=new PGlite(),db=drizzle(pg,{schema});
before(async()=>{await migrate(db,{migrationsFolder:"drizzle"});});after(async()=>{await pg.close();});
async function owner(){const id=randomUUID();await db.insert(schema.user).values({id,name:"虚构份数用户",email:id+"@example.test"});return id;}
const n=(caloriesKcal:string|null)=>({...emptyNutrition(),caloriesKcal,proteinG:"0"});
const free=(quantity:string,nutritionBasis:"per_portion"|"consumed_total"="per_portion"):ItemDraft=>({kind:"food",name:"虚构鸡蛋",quantity,unit:"个",nutritionBasis,...(nutritionBasis==="per_portion"?{perPortionNutrition:n("90")}:{nutrition:n("90")}),sourceKind:"estimated"});
const meal=(item:ItemDraft):MealAction=>({kind:"save_meal",date:"2024-08-01",mealType:"午餐",items:[item]});
async function save(id:string,actions:MealAction[]){const op=await submitMealOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions});assert.equal(op.canConfirm,true,JSON.stringify(op.rows));await decideMealOperation(db,id,op.id,op.revision,"confirm");return (await readMealSnapshot(db,id));}
test("任意小数份数按每份营养换算，未知和零独立保存",async()=>{
 for(const [quantity,total] of [["1.5",135],["2.75",247.5],["0.3333",29.997],["1",90]] as const){
  const id=await owner(),state=await save(id,[meal(free(quantity))]),item=state.meals[0].items[0];
  assert.equal(Number(item.nutrition.caloriesKcal),total);assert.equal(item.nutrition.proteinG,"0.0000");assert.equal(item.nutrition.fatG,null);
  assert.equal(item.perPortionNutrition?.caloriesKcal,"90");assert.equal(item.nutritionBasis,"per_portion");
 }
});
test("旧接口是本次总量，编辑旧份数不重新乘；主动切换后才按份计算",async()=>{
 const id=await owner();let state=await save(id,[meal({...free("2","consumed_total"),nutritionBasis:undefined})]),record=state.meals[0];
 assert.equal(Number(record.totals.values.caloriesKcal),90);
 state=await save(id,[{...meal({...free("3","consumed_total"),originalItemId:record.items[0].id}),id:record.id,version:record.version} as MealAction]);record=state.meals[0];
 assert.equal(Number(record.totals.values.caloriesKcal),90);
 state=await save(id,[{...meal({...free("3"),originalItemId:record.items[0].id}),id:record.id,version:record.version} as MealAction]);
 assert.equal(Number(state.meals[0].totals.values.caloriesKcal),270);
});
test("包装按可靠规格换算，规格改变和旧g记录都不改历史营养",async()=>{
 const id=await owner();let state=await save(id,[{kind:"save_food",name:"虚构袋装食品",baseQuantity:"100",unit:"g",servingQuantity:"50",servingUnit:"包",nutrition:n("200"),sourceKind:"reference"}]);
 const food=state.foods[0],item:ItemDraft={kind:"food",name:food.name,foodId:food.id,foodVersion:food.version,quantity:"0.5",unit:"包",sourceKind:"reference"};
 state=await save(id,[meal(item),{...meal({...item,quantity:"25",unit:"g"}),mealType:"晚餐"} as MealAction]);
 for(const record of state.meals)assert.equal(Number(record.totals.values.caloriesKcal),50);
 const {deletedAt,...foodDraft}=food;void deletedAt;
 state=await save(id,[{kind:"save_food",...foodDraft,servingQuantity:"60",nutrition:n("300")}]);
 const current=state.meals.find(row=>row.mealType==="午餐")!,saved=current.items[0];
 const edited=await save(id,[{kind:"save_meal",id:current.id,version:current.version,date:current.date,mealType:current.mealType,items:[{...item,originalItemId:saved.id,quantity:"1"}]}]);
 assert.equal(Number(edited.meals.find(row=>row.id===current.id)!.totals.values.caloriesKcal),100);
 assert.equal(Number(edited.meals.find(row=>row.mealType==="晚餐")!.totals.values.caloriesKcal),50);
});
test("混用每份和总量、没有份数、超界及跨账号引用不产生事实",async()=>{
 const id=await owner();
 for(const item of [{...free("2"),nutrition:n("90")},{...free("2"),quantity:null},{...free("1000000"),perPortionNutrition:n("1000000")}]){
  const op=await submitMealOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions:[meal(item)]});assert.equal(op.canConfirm,false);
 }
 const other=await owner(),state=await save(other,[{kind:"save_food",name:"虚构其他账号食品",baseQuantity:"1",unit:"包",nutrition:n("50"),sourceKind:"estimated"}]),food=state.foods[0];
 const op=await submitMealOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions:[meal({kind:"food",name:food.name,foodId:food.id,foodVersion:1,quantity:"1",unit:"包",sourceKind:"estimated"})]});
 assert.equal(op.canConfirm,false);assert.equal((await readMealSnapshot(db,id)).meals.length,0);
});

test("仅补可靠包装规格不改旧餐和原营养，重复请求幂等，无效规格拒绝",async()=>{
 const id=await owner();let state=await save(id,[{kind:"save_food",name:"虚构有标签食品",baseQuantity:"100",unit:"g",nutrition:n("200"),sourceKind:"reference",preparation:"标签每包50g",basis:"虚构成分表"}]);
 const f=state.foods[0];state=await save(id,[meal({kind:"food",name:f.name,foodId:f.id,foodVersion:f.version,quantity:"25",unit:"g",sourceKind:"reference"}),{...meal(free("1.5")),mealType:"晚餐"} as MealAction]);
 const original=state.meals,request={operationId:randomUUID(),updateMealDescriptions:false,changes:[{id:f.id,version:f.version,preparation:f.preparation??"",basis:f.basis??"",servingQuantity:"50",servingUnit:"包"}]};
 const preview=await previewFoodMaintenance(db,id,request);assert.equal(preview.affectedMeals,0);
 const result=await applyFoodMaintenance(db,id,request,preview.digest);state=await readMealSnapshot(db,id);
 assert.deepEqual(state.meals,original);assert.deepEqual(state.foods[0].nutrition,f.nutrition);assert.equal(state.foods[0].baseQuantity,f.baseQuantity);assert.equal(state.foods[0].unit,"g");
 assert.equal(state.foods[0].servingQuantity,"50.0000");assert.equal(state.foods[0].servingUnit,"包");assert.equal(state.foods[0].version,f.version+1);
 assert.deepEqual(await applyFoodMaintenance(db,id,request,preview.digest),{id:result.id,repeated:true});
 for(const change of [{servingQuantity:null,servingUnit:"包"},{servingQuantity:"50",servingUnit:"g"}])await assert.rejects(previewFoodMaintenance(db,id,{...request,operationId:randomUUID(),changes:[{...request.changes[0],version:f.version+1,...change}]}));
});
