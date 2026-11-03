import assert from "node:assert/strict";
import {test} from "node:test";
import {numericDraftValue} from "../../components/form-draft";
import {energyDraftSignature,exerciseHasInput} from "../activities/energy-editor-state";
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
