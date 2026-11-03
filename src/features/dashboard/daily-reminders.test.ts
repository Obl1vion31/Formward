import assert from "node:assert/strict";
import {test} from "node:test";
import {dailyReminders,reminderCatalog,type ReminderCatalog} from "./daily-reminders";
import {emptyEnergy,type EnergyDayRecord} from "../activities/model";
const catalog:ReminderCatalog={body:[],meals:[],energy:[]};
test("全部四类按时段出现，注册前不追讨，凌晨不催今日身体",()=>{
 assert.deepEqual(dailyReminders(catalog,"2026-11-03",5,"2026-11-03"),[]);
 assert.deepEqual(dailyReminders(catalog,"2026-11-03",10,"2026-11-03").map(t=>t.key),["daytime"]);
 assert.deepEqual(dailyReminders(catalog,"2026-11-03",18,"2026-11-01").map(t=>t.key),["energy","meals","daytime","evening"]);
});
test("只有估计不能当实测；体脂未知不持续催；空腹异常不提供无效入口",()=>{
 const c:ReminderCatalog={energy:[{date:"2026-11-02",hasTotal:true}],meals:[{date:"2026-11-02",complete:true}],body:[{date:"2026-11-03",period:"daytime",recorded:true,estimated:false,blocked:false},{date:"2026-11-03",period:"evening",recorded:false,estimated:true,blocked:false}]};
 const items=dailyReminders(c,"2026-11-03",20,"2026-11-01");assert.equal(items.length,1);assert.equal(items[0].label,"今日晚间尚无实测");
 c.body[1].blocked=true;assert.equal(dailyReminders(c,"2026-11-03",20,"2026-11-01").length,0);
});
test("消耗按采用模式派生全天数，部分不是总量，明确0保留",()=>{
 const day=(patch:Partial<EnergyDayRecord>):EnergyDayRecord=>({id:"day",version:1,deletedAt:null,date:"2026-11-02",entryMode:"components",activityMode:"total",restingKcal:null,activeKcal:"300",totalKcal:null,timezone:"Asia/Shanghai",sourceSystem:null,sourceRecordId:null,sourceOccurredAt:null,sourceUnit:"kcal",syncStatus:"confirmed",...patch});
 const has=(patch:Partial<EnergyDayRecord>)=>reminderCatalog([],[],{...emptyEnergy(),days:[day(patch)]}).energy[0].hasTotal;
 assert.equal(has({}),false);assert.equal(has({restingKcal:"2058",activeKcal:"0"}),true);
 assert.equal(has({entryMode:"total",totalKcal:null,restingKcal:"2058"}),false);
 assert.equal(has({entryMode:"total",totalKcal:"0"}),true);
});
