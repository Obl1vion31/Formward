import assert from"node:assert/strict";import{randomUUID}from"node:crypto";
import{addCalendarDays}from"../src/features/measurements/calendar.ts";import{setMealDayStatus}from"../src/features/meals/day-status.ts";import{dailyTotals}from"../src/features/meals/model.ts";
import{submitMealOperation,decideMealOperation,readMealSnapshot}from"../src/features/meals/records.ts";import{submitEnergyOperation,decideEnergyOperation}from"../src/features/activities/records.ts";
/** 只接收调用方创建的独立虚构账号，不读取环境、不连接真实账号。 */
export async function seedDetailHierarchy(db,userId,today){
 const date=n=>addCalendarDays(today,n),food=(name,nutrition)=>({kind:"food",name,quantity:"1",unit:"份",sourceKind:"reference",nutritionBasis:"consumed_total",nutrition});
 const meals=[4,3,2,1].flatMap(i=>[
  {kind:"save_meal",date:date(-i),mealType:"早餐",items:[food("燕麦、鸡蛋与牛奶 · 虚构",{caloriesKcal:String(480+i*13+.1234),proteinG:"22.5432",carbsG:"55.1",fatG:i===2?null:"13.2"})]},
  {kind:"save_meal",date:date(-i),mealType:"晚餐",items:[food("香草鸡胸肉、时蔬与杂粮饭 · 虚构",{caloriesKcal:String(1350+i*11),proteinG:"64.5",carbsG:"154.2",fatG:"42.1"})]}
 ]);
 meals.push(
  {kind:"save_meal",date:today,mealType:"午餐",items:[food("汤面（面条）、牛肉丸、午餐肉及豆腐、汤底及油脂、番茄牛腩（炖菜中的牛肉）、炖土豆 · 虚构",{caloriesKcal:"1190",proteinG:"62",carbsG:"95",fatG:"63"})]},
  {kind:"save_meal",date:date(-5),mealType:"加餐",items:[food("气泡水 · 虚构零值",{caloriesKcal:"0",proteinG:"0",carbsG:"0",fatG:"0"})]},
  {kind:"save_meal",date:date(-6),mealType:"早餐",items:[food("营养未齐 · 虚构",{caloriesKcal:null,proteinG:"20",carbsG:null,fatG:null})]},
  {kind:"save_meal",date:date(-7),mealType:"午餐",items:[food("长数值排版 · 虚构",{caloriesKcal:"99999",proteinG:"9876.5",carbsG:"12000.1",fatG:"4321.2"})]}
 );
 const mp=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:meals});assert.equal(mp.canConfirm,true);await decideMealOperation(db,userId,mp.id,mp.revision,"confirm");
 const energy=[4,3,2,1].map(i=>({kind:"save_energy_day",date:date(-i),entryMode:i===2?"total":"components",activityMode:"total",...(i===2?{totalKcal:"2200",restingKcal:null,activeKcal:null}:{restingKcal:i===4?null:"2058",activeKcal:i===3?"0":i===1?"1357":"300"}),restingSourceSystem:"虚构手表",activeSourceSystem:"虚构手表",timezone:"Asia/Shanghai"}));
 energy.push({kind:"save_activity",date:date(-1),name:"羽毛球 · 虚构",calorieMode:"components",exerciseActiveKcal:"741",exerciseRestingKcal:"110",inclusion:"included",durationMinutes:"60",completed:true,sourceSystem:"虚构手表",timezone:"Asia/Shanghai"},{kind:"save_energy_day",date:date(-7),entryMode:"components",activityMode:"total",restingKcal:"49999",activeKcal:"49999"});
 for(const[offset,mode,relation]of[[-8,"total","additional"],[-9,"activities",undefined],[-10,"activities",undefined]]){
  energy.push({kind:"save_energy_day",date:date(offset),entryMode:"components",activityMode:mode,restingKcal:"2058",activeKcal:mode==="total"?"1357":null});
  energy.push({kind:"save_activity",date:date(offset),name:"骑行 · 虚构",calorieMode:"components",exerciseActiveKcal:offset===-10?null:"741",exerciseRestingKcal:"110",...(relation?{inclusion:relation}:{}),durationMinutes:"60",completed:true,sourceSystem:"虚构手表",timezone:"Asia/Shanghai"});
 }
 const ep=await submitEnergyOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:energy});assert.equal(ep.canConfirm,true);await decideEnergyOperation(db,userId,ep.id,ep.revision,"confirm");
 const day=dailyTotals((await readMealSnapshot(db,userId)).meals).find(d=>d.date===date(-1)).day;await setMealDayStatus(db,userId,{operationId:randomUUID(),date:date(-1),status:"complete",version:day.version,contentDigest:day.contentDigest});
 return {today,yesterday:date(-1)};
}