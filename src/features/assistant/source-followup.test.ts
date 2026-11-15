import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { resolveSupplement, mergeSupplements } from "./followup";
import { applyConfirmedSources } from "./source-followup";
import type { Followup } from "./chat-model";

test("来源补充保留原始答案及任务，任意合法简称可映射，其他值保持", () => {
  const task: Followup = { messageId: randomUUID(), question: "来源？", subject: "体重来源", questions: [{ id: "source", prompt: "这次测量来源", binding: { kind: "measurement_source", date: "2026-11-15", period: "daytime" }, optional: true, allowText: true, options: [{ id: "history", label: "历史来源的完整名称" }] }] };
  for (const value of ["okok", "家庭秤A", "手写设备名"]) {
    const supplement = resolveSupplement(task, { messageId: task.messageId, answers: [{ questionId: "source", text: value }] });
    assert.equal(supplement.answers[0].text, value); assert.equal(supplement.taskMessageId, task.messageId);
    const args = { operationId: "unchanged", items: [{ date: "2026-11-15", period: "daytime", weightKg: "67.0000", fasting: true, timezone: "Asia/Singapore" }] };
    const output = applyConfirmedSources("preview_measurements", args, supplement) as typeof args & { items: { deviceLabel: string }[] };
    assert.equal(output.items[0].deviceLabel, value); assert.equal(output.items[0].weightKg, "67.0000"); assert.ok(!Object.hasOwn(args.items[0], "deviceLabel"));
    assert.throws(() => applyConfirmedSources("preview_measurements", { ...args, items: [{ ...args.items[0], deviceLabel: "模型擅自扩写的全称" }] }, supplement), /已回答/);
    assert.throws(() => applyConfirmedSources("preview_measurements", { ...args, items: [{ ...args.items[0], period: "evening" }] }, supplement), /原目标/);
  }
  const chosen = resolveSupplement(task, { messageId: task.messageId, answers: [{ questionId: "source", optionIds: ["history"] }] });
  assert.equal(chosen.answers[0].value, "历史来源的完整名称");
  const empty = resolveSupplement(task, { messageId: task.messageId, answers: [{ questionId: "source", skipped: true }] });
  const output = applyConfirmedSources("preview_measurements", { items: [{ date: "2026-11-15", period: "daytime" }] }, empty) as { items: { deviceLabel: null; sourceUnspecifiedConfirmed: boolean }[] };
  assert.equal(output.items[0].deviceLabel, null); assert.equal(output.items[0].sourceUnspecifiedConfirmed, true);
  assert.throws(() => resolveSupplement(task, { messageId: randomUUID(), answers: [{ questionId: "source", text: "okok" }] }), /任务已变化/);
});

import {before,after} from "node:test";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import {eq,and} from "drizzle-orm";
import * as schema from "../../db/schema";
import type {Database} from "../../db/client";
import {saveReportedMeasurements,listMeasurements} from "../measurements/records";
import {removeMeasurementSource} from "../measurements/sources";
import {createAiToken,authenticateAi} from "../auth/ai-tokens";
import {sourceFollowupQuestions,confirmedSourceArguments} from "./source-followup";
import {createAiPreview,updateAiPreview} from "../records/ai-previews";
import {reviewRecordOperation} from "../records/operations";
const pg=new PGlite(),connection=drizzle(pg,{schema}),db=connection as unknown as Database;
before(async()=>{await migrate(connection,{migrationsFolder:"drizzle"});});after(async()=>{await pg.close();});
test("历史来源按本人近30天与最近使用排序；移除建议排除，简称贯通预览、保存与审计",async()=>{
 const userId=randomUUID(),other=randomUUID();await db.insert(schema.user).values([userId,other].map(id=>({id,name:"虚构来源验收",email:id+"@example.test"})));
 const labels=[["2026-10-17","旧设备"],["2026-11-08","OKOK历史全称"],["2026-11-10","家庭秤"],["2026-11-11","已移除"],["2026-11-14","近期App"]];
 for(const [date,deviceLabel]of labels)await saveReportedMeasurements(db,{userId,actorId:userId,requestKey:randomUUID().replaceAll("-","").repeat(2),deviceLabel,entryChannel:"manual",records:[{recordDate:date,period:"evening",weightKg:"68",bodyFatPercent:null,fasting:false}]});
 await saveReportedMeasurements(db,{userId:other,actorId:other,requestKey:randomUUID().replaceAll("-","").repeat(2),deviceLabel:"他人的设备",entryChannel:"manual",records:[{recordDate:"2026-11-14",period:"evening",weightKg:"69",bodyFatPercent:null,fasting:false}]});
 await removeMeasurementSource(db,{userId,actorId:userId},"已移除");
 const messageId=randomUUID(),questions=await sourceFollowupQuestions(db,userId,[{id:"source",prompt:"来源",binding:{kind:"measurement_source",date:"2026-11-15",period:"daytime"},options:[],allowText:true,optional:true}]);
 assert.deepEqual(questions[0].options?.map(option=>option.label),["近期App","家庭秤","OKOK历史全称","旧设备"]);
 const supplement=resolveSupplement({messageId,question:"来源？",subject:"当前体重",questions},{messageId,answers:[{questionId:"source",text:"OKOK"}]});
 const token=await createAiToken(db,userId,"来源验收","write"),identity=await authenticateAi(db,"Bearer "+token.rawToken);
 const args=applyConfirmedSources("preview_measurements",{operationId:randomUUID(),items:[{key:"body",kind:"save_record",date:"2026-11-15",period:"daytime",weightKg:"67.00",fasting:true,timezone:"Asia/Shanghai"}]},supplement);
 const preview=await createAiPreview(db,identity,"preview_measurements",args);assert.equal((preview.rows[0].action as {deviceLabel?:string}).deviceLabel,"OKOK");
 const mapped=await confirmedSourceArguments(db,userId,"update_preview",{id:preview.id,revision:preview.revision,operationId:randomUUID(),changes:[{key:"body",kind:"save_record"}]},supplement);
 assert.equal((mapped.changes as {deviceLabel:string}[])[0].deviceLabel,"OKOK");await assert.rejects(confirmedSourceArguments(db,other,"update_preview",mapped,supplement),/不存在/);
 const corrected=await updateAiPreview(db,identity,mapped);await reviewRecordOperation(db,userId,corrected.id,{kind:"confirm",revision:corrected.revision});
 const saved=(await listMeasurements(db,userId)).find(row=>row.recordDate==="2026-11-15")!;assert.equal(saved.deviceLabel,"OKOK");assert.equal(saved.weightKg,"67.00");assert.equal(saved.period,"daytime");assert.equal(saved.fasting,true);
 const [audit]=await db.select().from(schema.measurementEvent).where(and(eq(schema.measurementEvent.userId,userId),eq(schema.measurementEvent.measurementId,saved.id)));
 assert.equal((audit.snapshot as {after:{deviceLabel:string}}).after.deviceLabel,"OKOK");
});

test("多轮补充保留已回答来源，新问题不再只靠聊天文本猜测",()=>{
 const messageId=randomUUID(),task:Followup={messageId,question:"来源",subject:"体重",questions:[{id:"source",prompt:"来源",binding:{kind:"measurement_source",date:"2026-11-15",period:"daytime"},allowText:true}]};
 const first=resolveSupplement(task,{messageId,answers:[{questionId:"source",text:"OKOK"}]}),nextId=randomUUID(),second=resolveSupplement({messageId:nextId,question:"备注",subject:"体重",questions:[{id:"note",prompt:"备注",allowText:true}]},{messageId:nextId,answers:[{questionId:"note",text:"复测"}]});const merged=mergeSupplements(first,second);assert.equal(merged.taskMessageId,messageId);assert.equal(merged.answers[0].value,"OKOK");assert.equal(merged.answers[1].value,"复测");assert.equal(mergeSupplements(null,second).answers.length,1);
});
