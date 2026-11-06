import assert from 'node:assert/strict';
import {test} from 'node:test';
import {measurementSummaryAt} from './summary';
import type {DailyMeasurement} from './days';
const row=(date:string,weight:string,kind:'observed'|'estimated'='observed'):DailyMeasurement=>({id:date+kind,recordDate:date,sourceLocalTime:date+' 07:00:00',period:'daytime',fasting:true,weightKg:weight,bodyFatPercent:null,recordKind:kind});
test('选日实测统计不借用最近记录冒充昨日，不纳入估算或未来值',()=>{
 const records=[row('2026-11-01','70.50'),row('2026-11-06','70.10'),row('2026-11-05','100','estimated'),row('2026-11-07','80'),row('2026-10-30','90')];
 const result=measurementSummaryAt(records,'weightKg','2026-11-06');assert.equal(result.value,70.1);assert.equal(result.previousChange,null);assert.equal(result.average,70.3);assert.equal(result.change,-.4);assert.equal(result.coverage,2);
 const previous=measurementSummaryAt(records,'weightKg','2026-11-03');assert.equal(previous.value,null);assert.equal(previous.average,80.25);assert.equal(previous.change,-19.5);
});
test('相邻日实测差与体脂缺测分别计算',()=>{
 const records=[row('2026-11-05','70.18'),row('2026-11-06','70.10')];assert.equal(measurementSummaryAt(records,'weightKg','2026-11-06').previousChange,-.08);assert.equal(measurementSummaryAt(records,'bodyFatPercent','2026-11-06').average,null);
});
