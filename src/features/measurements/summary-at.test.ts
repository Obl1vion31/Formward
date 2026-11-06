import assert from 'node:assert/strict';
import {test} from 'node:test';
import {measurementSummaryAt,preferredMorningDate} from './summary';
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

test('身体默认日采用当前指标晨间实测，不被体脂单项、晚间、估计或未来记录推移',()=>{
 const records=[row('2026-11-02','70.3'),{...row('2026-11-03','70.2'),period:'evening' as const,fasting:false},row('2026-11-04','70.1','estimated'),{...row('2026-11-05','70'),weightKg:null,bodyFatPercent:'20.8'},row('2026-11-07','69.8')];
 assert.equal(preferredMorningDate(records,'weightKg','2026-11-06'),'2026-11-02');assert.equal(preferredMorningDate(records,'bodyFatPercent','2026-11-06'),'2026-11-05');
});
test('没有该指标有效晨间实测时停在当前日期，空值不当作零',()=>{
 const records=[row('2026-11-05','70','estimated'),{...row('2026-11-06','71'),fasting:false}];
 assert.equal(preferredMorningDate(records,'weightKg','2026-11-06'),'2026-11-06');assert.equal(preferredMorningDate(records,'bodyFatPercent','2026-11-06'),'2026-11-06');
});
