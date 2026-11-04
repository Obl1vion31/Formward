import assert from "node:assert/strict";
import {test} from "node:test";
import {reminderCatalog} from "./daily-reminders";
import {emptyEnergy,type EnergyDayRecord} from "../activities/model";
test("消耗按采用模式派生全天数，部分不是总量，明确0保留",()=>{
 const day=(patch:Partial<EnergyDayRecord>):EnergyDayRecord=>({id:"day",version:1,deletedAt:null,date:"2026-11-02",entryMode:"components",activityMode:"total",restingKcal:null,activeKcal:"300",totalKcal:null,timezone:"Asia/Shanghai",sourceSystem:null,sourceRecordId:null,sourceOccurredAt:null,sourceUnit:"kcal",syncStatus:"confirmed",...patch});
 const has=(patch:Partial<EnergyDayRecord>)=>reminderCatalog([],[],{...emptyEnergy(),days:[day(patch)]}).energy[0].hasTotal;
 assert.equal(has({}),false);assert.equal(has({restingKcal:"2058",activeKcal:"0"}),true);
 assert.equal(has({entryMode:"total",totalKcal:null,restingKcal:"2058"}),false);
 assert.equal(has({entryMode:"total",totalKcal:"0"}),true);
});
