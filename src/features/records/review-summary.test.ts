import assert from "node:assert/strict";
import { test } from "node:test";
import { recordReceipt, summarizeRecordItems } from "./review-summary";
import type { RecordItem, RecordRow } from "./model";

const meal: RecordItem = {key:"meal",action:{kind:"save_meal",date:"2024-07-03",mealType:"午餐",items:[]},originalInput:{kind:"save_meal",date:"2024-07-03",mealType:"午餐",items:[]},excluded:false,checked:false};
test("提交摘要只取待保存的业务日期，不把取消或已保存项加到待保存内容",()=>{
  const summary=summarizeRecordItems([meal,{...meal,key:"old",persisted:true,action:{kind:"save_meal",date:"2024-07-01",mealType:"晚餐",items:[]}},{...meal,key:"excluded",excluded:true}], "pending");
  assert.deepEqual(summary.dates,["2024-07-03"]);
  assert.equal(summary.summary,"2024-07-03 · 摄入1餐");
  assert.equal(summary.pendingCount,1);
  assert.equal(summary.excludedCount,1);
});
test("保存回执只包含实际已保存行，跨类别直达对应业务日期",()=>{
  const rows:RecordRow[]=[{...meal,persisted:true},{...meal,key:"body",persisted:true,action:{kind:"save_record",date:"2024-07-02",period:"daytime",weightKg:"70"}},{...meal,key:"not-saved",excluded:true}];
  const receipt=recordReceipt(rows);
  assert.deepEqual(receipt.map(row=>[row.date,row.type,row.count,row.href]),[["2024-07-03","摄入",1,"/dashboard/meals?date=2024-07-03"],["2024-07-02","身体",1,"/dashboard/measurements?date=2024-07-02"]]);
});
test("食材摘要不凭提交时间伪造业务日期，回执不跨日汇总营养",()=>{
  const food:RecordItem={...meal,action:{kind:"save_food",name:"虚构食品",baseQuantity:"1",unit:"份",nutrition:{caloriesKcal:null,proteinG:null,carbsG:null,fatG:null},sourceKind:"unknown"}};
  const summary=summarizeRecordItems([food],"pending");
  assert.deepEqual(summary.dates,[]);
  assert.equal(summary.summary,"食材库1项");
});
