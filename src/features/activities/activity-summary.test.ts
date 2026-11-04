import assert from "node:assert/strict";
import {test} from "node:test";
import {activitySummary} from "./activity-summary";
import {energyBaseline,energyDays,type ActivityRecord,type EnergyDayRecord} from "./model";
const provenance={timezone:"Asia/Shanghai",sourceSystem:"虚构手表",sourceRecordId:null,sourceOccurredAt:null,sourceUnit:"kcal" as const,syncStatus:"confirmed" as const};
const day:EnergyDayRecord={...provenance,id:"day",version:1,deletedAt:null,date:"2026-10-27",entryMode:"components",activityMode:"total",restingKcal:"2058",activeKcal:"1357",totalKcal:null};
const activity:ActivityRecord={...provenance,id:"activity",version:1,deletedAt:null,date:day.date,name:"虚构羽毛球",durationMinutes:"90",completed:true,calorieMode:"components",caloriesKcal:"851",exerciseActiveKcal:"741",exerciseRestingKcal:"110"};
test("运动摘要区分本次851与已包含时不再增加，和正式日汇总一致",()=>{
 const included={...activity,inclusion:"included" as const,inclusionBasis:energyBaseline(day)};
 const reading=activitySummary(included,day);
 assert.equal(reading.totalKcal,"851.0000");assert.equal(reading.countedKcal,"741");
 assert.equal(reading.breakdown,"741 运动 ＋ 110 期间静息");
 assert.match(reading.effect,/已包含在当天活动合计 1357 千卡中，本次不再额外增加/);
 assert.equal(energyDays({days:[day],activities:[included],profiles:[]},[],[day.date])[0].totalKcal,"3415.0000");
 const additional={...included,inclusion:"additional" as const};
 assert.match(activitySummary(additional,day).effect,/额外增加 741/);
 assert.equal(energyDays({days:[day],activities:[additional],profiles:[]},[],[day.date])[0].totalKcal,"4156.0000");
});
test("自动累计、手填零、未知、旧未计入与旧无关系说明准确",()=>{
 const automatic={...day,activityMode:"activities" as const,activeKcal:null};
 assert.match(activitySummary(activity,automatic).effect,/由运动明细累计 741/);
 assert.equal(energyDays({days:[automatic],activities:[activity],profiles:[]},[],[day.date])[0].totalKcal,"2799.0000");
 assert.match(activitySummary(activity,{...day,activeKcal:"0"},{pending:true}).effect,/待核对.*0 千卡/);
 assert.match(activitySummary({...activity,exerciseActiveKcal:null},automatic).effect,/未知/);
 assert.match(activitySummary({...activity,completed:false},day).effect,/历史未计入/);
 assert.match(activitySummary(activity,day).effect,/沿用原记录/);
 const onlyTotal={...day,entryMode:"total" as const,totalKcal:"3415"};
 assert.match(activitySummary(activity,onlyTotal,{relation:"included"}).effect,/当天总消耗 3415/);
 assert.match(activitySummary({...activity,calorieMode:"total",caloriesKcal:"450"},automatic).effect,/累计 450/);
});

test("短状态与完整说明采用同一包含关系，未知和历史状态不丢失",()=>{
 const included={...activity,inclusion:"included" as const,inclusionBasis:energyBaseline(day)};
 assert.equal(activitySummary(included,day).status,"已含在活动合计");
 assert.equal(activitySummary(included,{...day,entryMode:"total",totalKcal:"3415"},{relation:"included"}).status,"已含在全天总数");
 assert.equal(activitySummary({...included,inclusion:"additional"},day).status,"额外增加 741 kcal");
 assert.equal(activitySummary({...included,inclusion:"additional",exerciseActiveKcal:null},day).status,"额外热量未知");
 assert.equal(activitySummary(activity,day,{pending:true}).status,"待核对包含关系");
 assert.equal(activitySummary({...activity,completed:false},day).status,"历史未计入");
 assert.equal(activitySummary(activity,day).status,"沿用原计入方式");
 const automatic={...day,activityMode:"activities" as const,activeKcal:null};
 assert.equal(activitySummary(activity,automatic).status,"按运动明细累计");
 assert.equal(activitySummary({...activity,exerciseActiveKcal:null},automatic).status,"运动热量未知");
 assert.equal(activitySummary(activity,{...day,entryMode:"total",totalKcal:null}).status,"全天总数未填写");
 assert.equal(activitySummary({...included,exerciseActiveKcal:"0"},day).status,"已含在活动合计");
});
