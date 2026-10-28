import assert from "node:assert/strict";
import {test} from "node:test";
import {activityAccumulationMessage,activityAccumulationPreview} from "./energy-aggregate";
import {type ActivityRecord,type EnergyDayRecord} from "./model";

const date="2026-10-28";
const provenance={timezone:"Asia/Shanghai",sourceSystem:null,sourceRecordId:null,sourceOccurredAt:null,sourceUnit:"kcal" as const,syncStatus:"confirmed" as const};
const day:EnergyDayRecord={...provenance,id:"day",date,version:1,deletedAt:null,entryMode:"components",activityMode:"total",restingKcal:"2058",activeKcal:"215",totalKcal:null};
const exercise=(patch:Partial<ActivityRecord>={}):ActivityRecord=>({...provenance,id:"exercise",date,version:1,deletedAt:null,name:"羽毛球",caloriesKcal:"851",calorieMode:"components",exerciseActiveKcal:"741",exerciseRestingKcal:"110",durationMinutes:null,completed:true,...patch});
test("手填215切到无运动累计预览为0与2058，原手填事实不改写",()=>{
 const preview=activityAccumulationPreview(day,[]);
 assert.equal(Number(preview.activeKcal),0);assert.equal(Number(preview.totalKcal),2058);
 assert.equal(day.activeKcal,"215");assert.equal(day.activityMode,"total");
 const text=activityAccumulationMessage(day.activeKcal,"2273",preview);
 assert.match(text,/当前活动合计：215/);assert.match(text,/没有运动明细/);assert.match(text,/2273 → 2058/);assert.match(text,/点击顶部“保存”/);
 const ai=activityAccumulationMessage(day.activeKcal,"2273",preview,true);assert.match(ai,/应用修改返回后.*统一确认保存/);assert.doesNotMatch(ai,/点击顶部/);
});
test("分项运动仅累计纯运动，明细中的期间静息不重复加入全天静息",()=>{
 const row=exercise(),preview=activityAccumulationPreview(day,[row]);
 assert.equal(Number(preview.activeKcal),741);assert.equal(Number(preview.totalKcal),2799);
 const text=activityAccumulationMessage("1357","3415",preview);
 assert.match(text,/羽毛球：741 千卡/);assert.match(text,/3415 → 2799/);
 assert.equal(row.exerciseRestingKcal,"110");
});
test("累计只采用当前日期的有效运动，忽略旧未计入、待删除及空白新增行",()=>{
 const preview=activityAccumulationPreview(day,[exercise(),exercise({id:"incomplete",completed:false}),exercise({id:"removed",deletedAt:"2026-10-29T00:00:00Z"}),exercise({id:"blank",name:"  "}),exercise({id:"other-day",date:"2026-10-27"})]);
 assert.equal(preview.activities.length,1);assert.equal(Number(preview.activeKcal),741);
});
test("未知运动仍未知，明确0参与累计，手填0在确认文案中保持0",()=>{
 const unknown=activityAccumulationPreview(day,[exercise(),exercise({id:"unknown",exerciseActiveKcal:null})]);
 assert.equal(unknown.activeKcal,null);assert.equal(unknown.totalKcal,null);
 const text=activityAccumulationMessage("0","2058",unknown);
 assert.match(text,/当前活动合计：0 千卡/);assert.match(text,/热量未知/);assert.match(text,/相加后的活动合计：未知/);
 const zero=activityAccumulationPreview(day,[exercise({exerciseActiveKcal:"0",exerciseRestingKcal:null})]);
 assert.equal(Number(zero.activeKcal),0);assert.equal(Number(zero.totalKcal),2058);
});
test("累计保留原精度且不受旧包含关系影响",()=>{
 const preview=activityAccumulationPreview({...day,restingKcal:"2058.1234"},[exercise({calorieMode:"total",caloriesKcal:"741.1234",inclusion:"included",inclusionBasis:"old"}),exercise({id:"extra",calorieMode:"total",caloriesKcal:"0.1234",inclusion:"additional",inclusionBasis:"old"})]);
 assert.equal(Number(preview.activeKcal),741.2468);assert.equal(Number(preview.totalKcal),2799.3702);
});
