import assert from "node:assert/strict";
import { test } from "node:test";
import { overview } from "./model";
import { prepareMealActions } from "../meals/records";
import { emptyNutrition } from "../meals/model";
test("今日总览只统计当天有效摄入，缺少消耗保持未知",()=>{
 const rows=prepareMealActions({operationId:"fictional-overview",actions:[{kind:"save_meal",date:"2024-08-01",mealType:"午餐",items:[{kind:"misc",name:"杂",sourceKind:"estimated",nutrition:{...emptyNutrition(),caloriesKcal:"200"}}]}]},{foods:[],meals:[]},"manual");
 const m=rows[0].meal!,today=overview([m],[],"2024-08-01"),empty=overview([m],[],"2024-08-02");assert.equal(today.mealCount,1);assert.equal(today.nutrition.values.caloriesKcal,"200.0000");assert.equal(today.nutrition.incomplete.proteinG,true);assert.equal(empty.mealCount,0);assert.equal(empty.nutrition.values.caloriesKcal,null);assert.equal(today.energyBalance,null);assert.equal(today.body[0].current,null);
 assert.equal(overview([{...m,deletedAt:"2024-08-02"}],[],"2024-08-01").mealCount,0);
});
