import assert from "node:assert/strict";
import {test} from "node:test";
import {numericDraftValue} from "../../components/form-draft";
import {energyDraftSignature,exerciseHasInput} from "../activities/energy-editor-state";
import type {EnergyAction} from "../activities/model";
test("语义比较不舍入且未知与0不同",()=>{
 assert.equal(numericDraftValue("70"),numericDraftValue("070.00"));
 assert.notEqual(numericDraftValue("17.51"),numericDraftValue("17.5"));
 assert.notEqual(numericDraftValue(null),numericDraftValue("0"));
});
test("空运动草稿不制造未保存提示，输入清空恢复，0是有效输入",()=>{
 const day={kind:"save_energy_day" as const,date:"2026-11-03",entryMode:"components" as const,activityMode:"activities" as const};
 const blank={name:"",calorieMode:"total",completed:true};
 assert.equal(exerciseHasInput(blank),false);
 assert.equal(energyDraftSignature(day,[blank]),energyDraftSignature(day,[]));
 assert.equal(exerciseHasInput({...blank,caloriesKcal:"0"}),true);
 assert.equal(energyDraftSignature(day,[{...blank,name:"",caloriesKcal:null}]),energyDraftSignature(day,[]));
});

test("只改单项运动包含关系仍是草稿修改",()=>{
 const activity={kind:"save_activity" as const,date:"2026-11-03",name:"虚构运动",caloriesKcal:"200",inclusion:"included" as const};
 assert.notEqual(energyDraftSignature(activity,[]),energyDraftSignature({...activity,inclusion:"additional"},[]));
});

test("新消耗只查看方式或静息公式、迟到的自动预览不会生成草稿",()=>{
 const blank:Extract<EnergyAction,{kind:"save_energy_day"}>={kind:"save_energy_day",date:"2026-11-17",timezone:"Asia/Shanghai",entryMode:"total",activityMode:"total",restingInputMethod:"estimate",calculation:{kind:"daily",method:"auto"}};
 const signature=energyDraftSignature(blank,[]);
 for(const method of ["auto","cunningham","mifflin-st-jeor"] as const){
  const preview={...blank,entryMode:"components" as const,restingKcal:"1738.028",restingSourceSystem:"系统估算 · cunningham",calculation:{kind:"resting" as const,method,basisKey:"late-measurement-version"}};
  assert.equal(energyDraftSignature(preview,[]),signature);
  assert.equal(energyDraftSignature({...preview,date:"2026-11-16"},[]),signature);
 }
 assert.equal(energyDraftSignature({...blank,restingInputMethod:"manual",calculation:null,entryMode:"components"},[]),signature);
 assert.equal(energyDraftSignature({...blank,restingInputMethod:"device",calculation:null,entryMode:"components"},[]),signature);
});

test("新消耗的手填、明确0、来源、活动档位及运动受保护，清空可恢复空白",()=>{
 const blank:Extract<EnergyAction,{kind:"save_energy_day"}>={kind:"save_energy_day",date:"2026-11-17",timezone:"Asia/Shanghai",entryMode:"components",activityMode:"total",restingInputMethod:"estimate",restingKcal:"1738.028",restingSourceSystem:"系统估算 · cunningham",calculation:{kind:"resting",method:"auto"}};
 const signature=energyDraftSignature(blank,[]);
 for(const change of [{activeKcal:"0"},{activeKcal:"100"},{restingKcal:"1800",restingInputMethod:"manual" as const,calculation:null},{steps:0},{steps:900},{notes:"待保存备注"},{restingSourceSystem:"本人填写来源"},{activeSourceSystem:"运动手表"},{entryMode:"total" as const,totalKcal:"2259.4364",calculation:{kind:"daily" as const,method:"auto" as const,activityLevel:"sedentary" as const}}]){
  assert.notEqual(energyDraftSignature({...blank,...change},[]),signature);
 }
 assert.notEqual(energyDraftSignature(blank,[{name:"虚构散步",caloriesKcal:"0"}]),signature);
 assert.equal(energyDraftSignature({...blank,activeKcal:null,steps:null,notes:" ",activeSourceSystem:""},[]),signature);
 assert.equal(energyDraftSignature({...blank,activeKcal:"100.00"},[]),energyDraftSignature({...blank,activeKcal:"100"},[]));
});

test("已有消耗的静息、公式和清空仍按完整内容保护",()=>{
 const saved:Extract<EnergyAction,{kind:"save_energy_day"}>={kind:"save_energy_day",id:"saved-energy",version:1,date:"2026-11-17",entryMode:"components",activityMode:"total",restingInputMethod:"estimate",restingKcal:"1738.028",calculation:{kind:"resting",method:"auto"}};
 const signature=energyDraftSignature(saved,[]);
 assert.notEqual(energyDraftSignature({...saved,restingKcal:"1662.375",calculation:{kind:"resting",method:"mifflin-st-jeor"}},[]),signature);
 assert.notEqual(energyDraftSignature({...saved,restingKcal:null},[]),signature);
});
