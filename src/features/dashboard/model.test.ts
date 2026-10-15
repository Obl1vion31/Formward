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

import { overviewDays } from "./model";
import { linkedDate } from "../measurements/calendar";
import type { MeasurementDisplay } from "../measurements/entry-state";
const observed=(date:string,patch:Partial<MeasurementDisplay>={}):MeasurementDisplay=>({id:date,recordDate:date,period:"daytime",weightKg:"70.00",bodyFatPercent:"20.00",fasting:true,sourceLocalTime:date+" 08:00:00",recordKind:"observed",timezone:"Asia/Shanghai",sourceType:"manual",sourceSystem:null,sourceRecordId:null,entryChannel:"manual",deviceLabel:"虚构秤",estimation:null,timePrecision:"minute",updatedAt:date,...patch});
test("总览按真实日期聚合，跨闰日的摄入与次晨测量不挪位，缺失与零分开",()=>{
 const meal=prepareMealActions({operationId:"fictional-history",actions:[{kind:"save_meal",date:"2024-02-28",mealType:"午餐",items:[{kind:"food",name:"虚构食物",sourceKind:"reference",nutrition:{...emptyNutrition(),caloriesKcal:"0"}}]}]},{foods:[],meals:[]},"manual")[0].meal!;
 const days=overviewDays([meal],[observed("2024-02-29")],["2024-02-28","2024-02-29","2024-03-01"]);
 assert.equal(days[0].nutrition?.values.caloriesKcal,"0.0000");assert.equal(days[0].body.weightKg,null);assert.equal(days[1].body.weightKg?.recordDate,"2024-02-29");assert.equal(days[1].nutrition,null);assert.equal(days[2].body.weightKg,null);
 assert.equal(overviewDays([{...meal,deletedAt:"2024-03-01"}],[],["2024-02-28"])[0].nutrition,null);
});
test("总览实测与已存估计按指标区分，多候选不擅选，晚间不混入空腹",()=>{
 const rows=[observed("2024-03-01",{bodyFatPercent:null}),observed("2024-03-01",{id:"estimate",recordKind:"estimated",weightKg:null,bodyFatPercent:"20.50"}),observed("2024-03-02",{id:"candidate-a"}),observed("2024-03-02",{id:"candidate-b"}),observed("2024-03-03",{period:"evening",fasting:false})];
 const days=["2024-03-01","2024-03-02","2024-03-03"],real=overviewDays([],rows,days),estimates=overviewDays([],rows,days,true);
 assert.equal(real[0].body.bodyFatPercent,null);assert.equal(estimates[0].body.bodyFatPercent?.recordKind,"estimated");assert.equal(estimates[0].body.weightKg?.recordKind,"observed");assert.equal(real[1].body.weightKg,null);assert.equal(real[1].ambiguous.weightKg,true);assert.equal(real[2].body.weightKg,null);
 assert.equal(rows.length,5);
});
test("详情链接校验真实日历日期，数组及异常输入不打开错误日期",()=>{
 assert.equal(linkedDate("2024-02-29"),"2024-02-29");for(const date of ["2023-02-29","2024-13-01","today",["2024-03-01"],undefined])assert.equal(linkedDate(date),null);
});
