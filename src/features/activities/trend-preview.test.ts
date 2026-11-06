import test from 'node:test';
import assert from 'node:assert/strict';
import {blankEnergyDay} from './model';
import {energyTrendPoint} from './trend-preview';
import {metricTrendModel} from '../../components/metric-trend-model';
const date='2026-11-01';

test('消耗小图保留未知和明确零，不猜分项',()=>{
 assert.deepEqual(energyTrendPoint(date),{date,value:null});
 const unknown=energyTrendPoint(date,blankEnergyDay(date));assert.equal(unknown.value,null);assert.equal(unknown.segments,undefined);
 const zero=energyTrendPoint(date,{...blankEnergyDay(date),restingKcal:'0',activeKcal:'0',totalKcal:'0'});
 assert.equal(zero.value,0);assert.deepEqual(zero.segments?.map(s=>s.value),[0,0]);
});
test('已汇总静息和活动直接映射，不重复计入运动',()=>{
 const point=energyTrendPoint(date,{...blankEnergyDay(date),restingKcal:'1800',activeKcal:'350',totalKcal:'2150',totalSource:'sum'});
 assert.equal(point.value,2150);assert.deepEqual(point.segments?.map(s=>[s.series,s.value]),[['resting',1800],['active',350]]);assert.equal(point.totalMarker,null);
});
test('仅有总数使用中性柱，覆盖总数保留金色标记',()=>{
 const point=energyTrendPoint(date,{...blankEnergyDay(date),totalKcal:'2400',totalSource:'override'});
 assert.deepEqual(point.segments?.map(s=>[s.series,s.color,s.value]),[['total-only','var(--data-neutral)',2400]]);assert.equal(point.totalMarker,2400);
 const override=energyTrendPoint(date,{...blankEnergyDay(date),restingKcal:'1800',activeKcal:'350',totalKcal:'2000',totalSource:'override'});
 assert.equal(override.value,2000);assert.equal(override.totalMarker,2000);assert.equal(override.segments?.reduce((sum,s)=>sum+s.value,0),2150);
});
test('部分分项可绘制，但不把已知合计冒充完整总数，坐标容纳全部图形',()=>{
 const partial=energyTrendPoint(date,{...blankEnergyDay(date),restingKcal:'1800'});
 assert.equal(partial.value,null);assert.deepEqual(partial.segments?.map(s=>s.value),[1800]);
 const model=metricTrendModel('energy',[partial]);assert.ok(model.max>=1800);
});
