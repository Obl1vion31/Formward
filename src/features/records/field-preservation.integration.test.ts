import assert from "node:assert/strict";
import {test,before,after} from "node:test";
import {writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import {eq} from "drizzle-orm";
import type {Database} from "../../db/client";
import * as s from "../../db/schema";
import {createAiToken,authenticateAi} from "../auth/ai-tokens";
import {submitRecordOperation,reviewRecordOperation,loadRecordReview} from "./operations";
import {updateAiPreview} from "./ai-previews";
import type {RecordAction} from "./model";
import {assertOnlyFieldsChanged,preservationResult} from "./field-preservation.test-support";
import {savedMealDraft} from "../meals/ai-changes";
import {readMealSnapshot} from "../meals/records";
const pg=new PGlite(),connection=drizzle(pg,{schema:s}),db=connection as unknown as Database;
const reports:unknown[]=[];
before(async()=>{await migrate(connection,{migrationsFolder:"drizzle"});});after(async()=>{await pg.close();if(process.env.FORMWARD_FIELD_REPORT)await writeFile(process.env.FORMWARD_FIELD_REPORT,JSON.stringify(reports,null,2),{mode:0o600});});
const tables=[s.food,s.meal,s.mealItem,s.measurement,s.energyDay,s.activity,s.trainingTemplate,s.trainingPlan,s.trainingSession] as const;
async function facts(userId:string){return Promise.all(tables.map(async table=>(await db.select().from(table).where(eq(table.userId,userId))).sort((a,b)=>String(a.id).localeCompare(String(b.id)))));}
const template={name:"模板A",exercises:[{name:"俯卧撑",catalogId:"push-up",recordingType:"reps" as const,sets:3,reps:10,weightKg:null}]};
const cases=[
 {id:"meal-note",kind:"save_meal",field:"notes",value:"新备注",draft:["notes"],table:1,persist:["notes","updatedAt","version","source","createdBy"]},
 {id:"meal-photo",kind:"save_meal",field:"addImageIds",value:"photo",draft:["imageIds.1"],table:1,persist:["updatedAt","version","source","createdBy"]},
 {id:"meal-append",kind:"save_meal",field:"addFoods",value:[{name:"鸡蛋",quantity:"1",unit:"个",caloriesKcal:"75",proteinG:"6",carbsG:"0",fatG:"5",sourceKind:"estimated",basis:"虚构单个总营养"}],draft:["items.1"],table:1,persist:["updatedAt","version","source","createdBy"]},
 {id:"schedule-date",kind:"schedule_training",field:"date",value:"2026-11-16",draft:["date"],table:7,persist:["date","updatedAt","version","createdBy"]},
 {id:"food-basis",kind:"save_food",field:"basis",value:"用户提供的营养标签",draft:["basis"],table:0,persist:["basis","updatedAt","version","source","createdBy"]},
 {id:"body-source",kind:"save_record",field:"deviceLabel",value:"OKOK",draft:["deviceLabel"],table:3,persist:["deviceLabel","updatedAt"]},
 {id:"energy-note",kind:"save_energy_day",field:"notes",value:"核对备注",draft:["notes"],table:4,persist:["notes","updatedAt","version","source","createdBy"]},
 {id:"energy-value",kind:"save_energy_day",field:"totalKcal",value:"2123",draft:["totalKcal"],table:4,persist:["totalKcal","updatedAt","version","source","createdBy"]},
 {id:"template-title",kind:"save_training_template",field:"template",value:{...template,name:"模板B"},draft:["template.name"],table:6,persist:["content.name","updatedAt","version","createdBy"]},
] as const;
for(const c of cases)for(const existing of [false,true])test(`字段保留矩阵：${c.id} · ${existing?"正式记录修改预览":"待审草稿"}`,async()=>{
 const userId=randomUUID();await db.insert(s.user).values({id:userId,name:"虚构字段验收",email:userId+"@example.test"});const token=await createAiToken(db,userId,"字段验收","write"),identity=await authenticateAi(db,"Bearer "+token.rawToken);
 const imageIds=[randomUUID(),randomUUID()];for(const [n,id]of imageIds.entries())await db.insert(s.mealImage).values({id,userId,pathname:"meal-formal-v2/"+userId+"/"+id,sha256:String(n+1).repeat(64),mimeType:"image/png",byteSize:68,fileName:"隔离照片.png",source:"manual",createdBy:userId});
 let templateId:string|undefined;if(c.kind==="schedule_training"){const seed=await submitRecordOperation(db,identity,{operationId:randomUUID(),items:[{key:"template",kind:"save_training_template",template}]});await reviewRecordOperation(db,userId,seed.id,{kind:"confirm",revision:seed.revision});templateId=(await db.select().from(s.trainingTemplate).where(eq(s.trainingTemplate.userId,userId)))[0].id;}
 const base:Record<string,RecordAction>={meal:{kind:"save_meal",date:"2026-11-15",mealType:"早餐",imageIds:[imageIds[0]],notes:"保留备注",timezone:"Asia/Shanghai",items:[{kind:"food",name:"米饭",quantity:"100",unit:"g",nutritionBasis:"consumed_total",nutrition:{caloriesKcal:"123.4567",proteinG:"0",carbsG:null,fatG:"1.2345"},sourceKind:"estimated",basis:"隔离原营养"}]},food:{kind:"save_food",name:"库麦片",baseQuantity:"100",unit:"g",nutrition:{caloriesKcal:"333.3333",proteinG:"0",carbsG:null,fatG:"5.1234"},sourceKind:"label",basis:"原标签"},body:{kind:"save_record",date:"2026-11-15",period:"daytime",weightKg:"67.00",bodyFatPercent:null,deviceLabel:"原设备",fasting:true,timezone:"Asia/Shanghai"},energy:{kind:"save_energy_day",date:"2026-11-15",entryMode:"total",totalKcal:"2100",steps:0,sourceSystem:"原来源",notes:"保留备注",timezone:"Asia/Shanghai"},training:{kind:"save_training_template",template}};
 base.plan={kind:"schedule_training",date:"2026-11-15",templateId};
 const key=Object.keys(base).find(key=>base[key].kind===c.kind)!;let action=base[key];
 // A different business item and another owner are always present and must stay untouched.
 const other=await submitRecordOperation(db,identity,{operationId:randomUUID(),items:[{key:"untouched",kind:"save_energy_day",date:"2026-11-14",entryMode:"total",totalKcal:"2300",sourceSystem:"其他日期"}]});await reviewRecordOperation(db,userId,other.id,{kind:"confirm",revision:other.revision});
 if(existing){const seed=await submitRecordOperation(db,identity,{operationId:randomUUID(),items:[{key:"target",...action}]});assert.ok(seed.canConfirm);await reviewRecordOperation(db,userId,seed.id,{kind:"confirm",revision:seed.revision});const current=await facts(userId),row=current[c.table].find(value=>!("date" in value)||value.date==="2026-11-15") as Record<string,unknown>;
  if(c.kind==="save_record")action={...action,recordId:String(row.id),version:(row.updatedAt as Date).toISOString()} as RecordAction;
  else if(c.kind==="save_meal")action=savedMealDraft((await readMealSnapshot(db,userId)).meals[0]);
  else action={...action,id:String(row.id),version:Number(row.version)} as RecordAction;
 }
 if(c.kind==="save_training_template"||c.kind==="schedule_training"){
  let [existingTemplate]=await db.select().from(s.trainingTemplate).where(eq(s.trainingTemplate.userId,userId));if(!existingTemplate){const created=await submitRecordOperation(db,identity,{operationId:randomUUID(),items:[{key:"completed-template",kind:"save_training_template",template:{...template,name:"已完成模板"}}]});await reviewRecordOperation(db,userId,created.id,{kind:"confirm",revision:created.revision});[existingTemplate]=await db.select().from(s.trainingTemplate).where(eq(s.trainingTemplate.userId,userId));}
  const planId=randomUUID();await db.insert(s.trainingPlan).values({id:planId,userId,templateId:existingTemplate.id,date:"2026-11-14",content:existingTemplate.content,status:"completed",createdBy:userId});await db.insert(s.trainingSession).values({id:randomUUID(),userId,date:"2026-11-14",timezone:"Asia/Shanghai",name:"已完成实练",planId,status:"completed",elapsedSeconds:1200,exercises:[],startedAt:new Date("2026-11-14T01:00:00Z"),endedAt:new Date("2026-11-14T01:20:00Z"),createdBy:userId});
 }
 const beforeFacts=await facts(userId),initial=await submitRecordOperation(db,identity,{operationId:randomUUID(),items:[{key:"target",...action},{key:"other",kind:"save_record",date:"2026-11-13",period:"evening",weightKg:"68.20",deviceLabel:"保留设备",fasting:false}]});
 const before=initial.rows.map(row=>({key:row.key,action:row.action})),payload=(await db.select().from(s.recordOperation).where(eq(s.recordOperation.id,initial.id)))[0].payload;
 const request={operationId:randomUUID(),id:initial.id,revision:initial.revision,changes:[{key:"target",kind:c.kind,[c.field]:c.id==="meal-photo"?[imageIds[1]]:c.value}]};
 const check=(stage:string,b:unknown,a:unknown,allowed:string[])=>{const result=preservationResult(b,a,allowed);reports.push({scenario:c.id,existing,stage,request,...result,passed:result.unexpected.length===0});assertOnlyFieldsChanged(b,a,allowed);};
 const changed=await updateAiPreview(db,identity,request);assert.equal(changed.id,initial.id);check("preview",before,changed.rows.map(row=>({key:row.key,action:row.action})),c.draft.map(path=>`0.action.${path}`));
 assert.deepEqual(await facts(userId),beforeFacts,"确认前正式健康数据不能变化");assert.deepEqual((await db.select().from(s.recordOperation).where(eq(s.recordOperation.id,initial.id)))[0].payload,payload);
 const repeat=await updateAiPreview(db,identity,request);assert.equal(repeat.revision,changed.revision);assert.deepEqual(repeat.rows,changed.rows);check("idempotent",changed.rows.map(row=>({key:row.key,action:row.action})),repeat.rows.map(row=>({key:row.key,action:row.action})),[]);
 const snapshot=await loadRecordReview(db,userId,initial.id);await assert.rejects(updateAiPreview(db,identity,{...request,operationId:randomUUID(),revision:snapshot.revision,changes:[{key:"wrong-target",kind:c.kind,[c.field]:c.id==="meal-photo"?[imageIds[1]]:c.value}]}));assert.deepEqual((await loadRecordReview(db,userId,initial.id)).rows,snapshot.rows);check("failed_unchanged",snapshot.rows.map(row=>({key:row.key,action:row.action})),(await loadRecordReview(db,userId,initial.id)).rows.map(row=>({key:row.key,action:row.action})),[]);assert.deepEqual(await facts(userId),beforeFacts);
 // Cancel unrelated pending row, then confirm through the real reviewer in the isolated DB.
 const selected=await reviewRecordOperation(db,userId,changed.id,{kind:"exclude",keys:["other"],revision:changed.revision});await reviewRecordOperation(db,userId,selected.id,{kind:"confirm",revision:selected.revision});const after=await facts(userId);
 for(let i=0;i<tables.length;i++)if(c.kind==="save_meal"&&i===2){if(!existing){assert.equal(after[i].length,beforeFacts[i].length+(c.id==="meal-append"?2:1));}else if(c.id==="meal-append"){const old=beforeFacts[i] as {id:string}[],next=after[i] as {id:string}[];for(const row of old)assert.deepEqual(next.find(item=>item.id===row.id),row);assert.equal(next.length,old.length+1);}else assert.deepEqual(after[i],beforeFacts[i]);continue;}else if(i!==c.table)assert.deepEqual(after[i],beforeFacts[i],`未涉及事实表${i}应保持`);
 if(existing){const target=(beforeFacts[c.table] as {id:string}[]).findIndex(row=>row.id===(action as {id?:string;recordId?:string}).id||row.id===(action as {recordId?:string}).recordId);assert.ok(target>=0);check("confirmed",beforeFacts[c.table],after[c.table],c.persist.map(field=>`${target}.${field}`));}
 else {for(const row of beforeFacts[c.table] as {id:string}[])assert.deepEqual((after[c.table] as {id:string}[]).find(item=>item.id===row.id),row);assert.equal(after[c.table].length,beforeFacts[c.table].length+1);}
 if(c.kind==="save_meal")assert.deepEqual((await readMealSnapshot(db,userId)).meals.find(meal=>meal.date==="2026-11-15")?.imageIds,c.id==="meal-photo"?imageIds:[imageIds[0]]);
});
