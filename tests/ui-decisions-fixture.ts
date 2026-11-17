import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import type {Database} from "../src/db/client";
import {submitMealOperation,decideMealOperation} from "../src/features/meals/records";
import {mutateTraining} from "../src/features/training/records";

/** 只由已建立隔离数据库的浏览器执行器调用，不读取环境或正式账号。 */
export async function seedUiDecisionsFixture(db:Database,userId:string,today:string){
 const operation=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[
  {kind:"save_food",name:"纯牛奶 · 虚构",brand:"验收样本",preparation:"原味",baseQuantity:"100",unit:"mL",sourceKind:"reference",basis:"每100毫升包装营养标签。",nutrition:{caloriesKcal:"60",proteinG:"3",carbsG:"5",fatG:"3"}},
  {kind:"save_food",name:"燕麦片 · 虚构",brand:"验收样本",preparation:"干燕麦片",baseQuantity:"100",unit:"g",sourceKind:"reference",basis:"每100克包装营养标签。",nutrition:{caloriesKcal:"380",proteinG:"12",carbsG:"65",fatG:"8"}}
 ]});
 assert.equal(operation.canConfirm,true);await decideMealOperation(db,userId,operation.id,operation.revision,"confirm");
 const templateId=randomUUID();
 await mutateTraining(db,userId,{kind:"template",operationId:randomUUID(),id:templateId,template:{name:"全身力量 · 虚构",exercises:[{name:"俯卧撑",sets:3,reps:10},{name:"深蹲",sets:3,reps:12}]}});
 await mutateTraining(db,userId,{kind:"schedule",operationId:randomUUID(),id:randomUUID(),date:today,templateId});
}
