import assert from "node:assert/strict";
import {test} from "node:test";
import {emptyNutrition,formatNutrition,sumNutrition} from "../meals/model";
import {formatRecordNumber,signedRecordNumber,formatIntegerNumber,signedIntegerNumber,formatUnitNumber,formatNutritionNumber} from "../../components/number-format";
test("健康读数统一两位、未知和0分开、负零不误导",()=>{
 for(const v of [null,undefined,"","invalid"])assert.equal(formatRecordNumber(v),"—");
 assert.equal(formatRecordNumber("741.0000"),"741.00");assert.equal(formatRecordNumber(0),"0.00");assert.equal(formatRecordNumber(-.0001),"0.00");
 assert.equal(formatRecordNumber("1.005"),"1.01");assert.equal(signedRecordNumber(".2"),"+0.20");assert.equal(signedRecordNumber("-.2"),"-0.20");
 const raw="400.1234";formatRecordNumber(raw);assert.equal(raw,"400.1234");
});

test("热量和消耗显示整数，身体两位，换算先求和再展示",()=>{
 assert.equal(formatIntegerNumber("741.0000"),"741");assert.equal(formatIntegerNumber(0),"0");assert.equal(formatIntegerNumber(null),"—");
 assert.equal(formatIntegerNumber("40.5900"),"41");assert.equal(formatIntegerNumber(100.4+100.4),"201");
 assert.equal(signedIntegerNumber(-.1),"0");assert.equal(signedIntegerNumber(-1025),"-1025");assert.equal(signedIntegerNumber(741),"+741");
 assert.equal(formatUnitNumber("67.8","kg"),"67.80");assert.equal(formatUnitNumber("16.3","%"),"16.30");assert.equal(formatUnitNumber("741.1234","kcal"),"741");
 const raw="741.1234";formatIntegerNumber(raw);assert.equal(raw,"741.1234");
});

test("宏量营养最多两位、去尾0，未知与明确0保持区别",()=>{
 for(const value of [null,undefined,"","invalid"])assert.equal(formatNutritionNumber(value),"—");
 for(const [value,expected] of [["17.5","17.5"],["4.25","4.25"],["1.1","1.1"],["0","0"],["0.0000","0"],["17.5000","17.5"],["4.2578","4.26"],["1.0050","1.01"]]) {
  assert.equal(formatNutritionNumber(value),expected);
  assert.equal(formatUnitNumber(value,"g"),expected);
 }
 assert.equal(formatNutritionNumber(-0.0001),"0");
 assert.equal(formatUnitNumber(null,"g"),"—");
 const raw="4.2578";formatNutritionNumber(raw);assert.equal(raw,"4.2578");
});

test("餐次营养分开格式化热量与宏量，先合计原精度再展示",()=>{
 for(const [metric,value,expected] of [["proteinG","17.5","17.5"],["carbsG","4.25","4.25"],["fatG","1.1","1.1"],["proteinG","4.2578","4.26"],["caloriesKcal","100.4","100"]] as const)assert.equal(formatNutrition(value,metric),expected);
 for(const metric of ["caloriesKcal","proteinG","carbsG","fatG"] as const){assert.equal(formatNutrition(null,metric),"—");assert.equal(formatNutrition("0.0000",metric),"0");}
 const totals=sumNutrition([{...emptyNutrition(),caloriesKcal:"100.4",proteinG:"0.0049"},{...emptyNutrition(),caloriesKcal:"100.4",proteinG:"0.0049"}]);
 assert.equal(totals.values.caloriesKcal,"200.8000");
 assert.equal(formatNutrition(totals.values.caloriesKcal,"caloriesKcal"),"201");
 assert.equal(totals.values.proteinG,"0.0098");
 assert.equal(formatNutrition(totals.values.proteinG,"proteinG"),"0.01");
});
