import assert from "node:assert/strict";
import {test} from "node:test";
import {macroComposition,emptyNutrition,sumNutrition,type Totals} from "./model";
const totals=(values:Partial<Totals["values"]>,incomplete:Partial<Totals["incomplete"]>={}):Totals=>({values:{...emptyNutrition(),...values},incomplete:{caloriesKcal:false,proteinG:false,carbsG:false,fatG:false,...incomplete}});
test("供能环图按原始4/4/9归一，不拿标签热量分摊作宏量热量",()=>{
 const input=totals({caloriesKcal:"999",proteinG:"20.1234",carbsG:"30.5678",fatG:"10.4321"});
 const before=JSON.stringify(input),result=macroComposition(input);
 assert.equal(result.kind,"known");
 const weighted=[20.1234*4,30.5678*4,10.4321*9],sum=weighted.reduce((a,b)=>a+b,0);
 result.segments.forEach((s,i)=>assert.ok(Math.abs(s.ratio-weighted[i]/sum)<1e-12));
 assert.equal(JSON.stringify(input),before);
 assert.ok(Math.abs(result.segments.reduce((a,b)=>a+b.ratio,0)-1)<1e-12);
});
test("热量未知但宏量已知仍可展示；单项未知或部分汇总不可伪装完整环",()=>{
 assert.equal(macroComposition(totals({proteinG:"1",carbsG:"0",fatG:"0"})).kind,"known");
 assert.equal(macroComposition(totals({proteinG:"1",carbsG:null,fatG:"0"})).kind,"unknown");
 assert.equal(macroComposition(totals({proteinG:"1",carbsG:"0",fatG:"0"},{proteinG:true})).kind,"unknown");
 assert.equal(macroComposition(null).kind,"unknown");
});
test("明确0为零供能态，与未知区分；日合计后再计算占比",()=>{
 assert.equal(macroComposition(totals({proteinG:"0",carbsG:"0",fatG:"0"})).kind,"zero");
 const result=macroComposition(sumNutrition([{caloriesKcal:"10.1234",proteinG:"0.1234",carbsG:"1.2",fatG:"0"},{caloriesKcal:"0",proteinG:"0.1234",carbsG:"0",fatG:"0"}]));
 assert.equal(result.kind,"known");assert.ok(Math.abs(result.segments[0].ratio-.2468/(.2468+1.2))<1e-12);
});
