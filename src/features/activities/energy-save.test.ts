import assert from "node:assert/strict";
import {test} from "node:test";
import {verifyRecordVersions,RecordVersionError} from "../../components/record-change-client";
import type {RecordStamp} from "../records/change-state";
import {emptyEnergy,type EnergyAction,type EnergyDayRecord,type ActivityRecord} from "./model";
import {energySaveExpectations,applyEnergyVersions,energyDateMoveIssue,energyChangedKeys} from "./energy-save-state";
import {planEnergyActions} from "./records";

const from="2026-11-07",to="2026-11-06";
const source={timezone:"Asia/Singapore",sourceSystem:"虚构手表",sourceRecordId:null,sourceOccurredAt:null,sourceUnit:"kcal" as const,syncStatus:"confirmed" as const};
const day:EnergyDayRecord={...source,id:"source-day",version:1,deletedAt:null,date:from,entryMode:"components",activityMode:"total",restingKcal:"2000.1234",activeKcal:"0",totalKcal:null};
const activity:ActivityRecord={...source,id:"source-activity",version:2,deletedAt:null,date:from,name:"虚构散步",completed:true,caloriesKcal:"200",durationMinutes:null};
const move:EnergyAction={kind:"save_energy_day",id:day.id,version:1,date:to};
const state={...emptyEnergy(),days:[day]};
const stamp=(patch:Partial<RecordStamp>={}):RecordStamp=>({key:"energyDay:"+from,id:day.id,date:from,title:"消耗",version:"1",href:"/dashboard/energy",...patch});

test("日记录改期按原编号定位原日期，不将目标日期当作版本键",()=>{
 assert.deepEqual(energySaveExpectations([move],state),[{key:"energyDay:"+from,id:day.id,version:"1"}]);
 const current=applyEnergyVersions([move],state,new Map([["energyDay:"+from,stamp({version:"2"})]]));
 assert.equal(current[0].id,day.id);assert.equal(current[0].version,2);assert.equal("date" in current[0]&&current[0].date,to);
 assert.throws(()=>applyEnergyVersions([move],state,new Map([["energyDay:"+from,stamp({id:"replacement"})]])),/其他记录占用/);
 assert.throws(()=>applyEnergyVersions([{kind:"save_energy_day",date:to}],state,new Map([["energyDay:"+to,stamp({date:to})]])),/其他记录占用/);
});

test("空目标版本核对成功，同版本替换、源记录消失和新建占用均不能误采用编号",async t=>{
 let records=[stamp()];
 t.mock.method(globalThis,"fetch",async()=>new Response(JSON.stringify({records}),{status:200,headers:{"content-type":"application/json"}}));
 assert.equal((await verifyRecordVersions(energySaveExpectations([move],state))).get("energyDay:"+from)?.id,day.id);
 records=[stamp({id:"replacement"})];
 await assert.rejects(verifyRecordVersions(energySaveExpectations([move],state)),error=>error instanceof RecordVersionError&&/被替换/.test(error.message));
 records=[];await assert.rejects(verifyRecordVersions(energySaveExpectations([move],state)),/原记录已移动/);
 records=[stamp({key:"energyDay:"+to,date:to})];
 await assert.rejects(verifyRecordVersions(energySaveExpectations([{kind:"save_energy_day",date:to}],state)),/该日期已有记录/);
});

test("网页改期阻止目标日记录或运动；不能漏移原日期明细",()=>{
 assert.equal(energyDateMoveIssue([move],state),null);
 assert.match(energyDateMoveIssue([move],{...state,days:[day,{...day,id:"target",date:to}]})!,/目标日期已有/);
 assert.match(energyDateMoveIssue([move],{...state,activities:[{...activity,date:to,completed:false}]})!,/目标日期已有/);
 const withItems={...state,activities:[activity]};
 assert.match(energyDateMoveIssue([move],withItems)!,/同时移动当天运动/);
 const item:EnergyAction={kind:"save_activity",id:activity.id,version:activity.version,date:to,name:activity.name};
 assert.equal(energyDateMoveIssue([move,item],withItems),null);
 assert.equal(energyDateMoveIssue([move,{kind:"delete_activity",id:activity.id,version:activity.version}],withItems),null);
 assert.equal(energyDateMoveIssue([{kind:"save_energy_day",date:to},item],{...emptyEnergy(),activities:[activity]}),null);
 assert.match(energyDateMoveIssue([{kind:"save_energy_day",date:to},item],{...emptyEnergy(),days:[{...day,id:"target",date:to}],activities:[activity]})!,/目标日期已有/);
});

test("改期通知同时覆盖原日期与新日期；未选择的预览不确认",()=>{
 const rows=planEnergyActions([move],state);
 assert.deepEqual(energyChangedKeys(rows),["energyDay:"+from,"energyDay:"+to]);
 assert.deepEqual(energyChangedKeys([{...rows[0],excluded:true}]),[]);
});
