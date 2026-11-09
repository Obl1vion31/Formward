import { recordSchemas } from "../records/ai-openapi";
import { measurementOpenApi } from "./ai-openapi";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { listMeasurements, saveReportedMeasurements } from "./records";
import { measurementDisplay } from "./editing";
import { queryAiMeasurements } from "./ai-api";
import { parseAiMeasurementInput, operationDisplay, decideAiMeasurementOperation } from "./ai-operations";
import { submitRecordOperation, getRecordOperation, reviewRecordOperation } from "../records/operations";
import { restoreMeasurement } from "./maintenance";
import { missingMeasurementCells } from "./entry-state";
import { measurementTrend } from "./trend";
import { createAiToken } from "../auth/ai-tokens";
import { containsRetiredBodyEstimate } from "./retirement";

const removed = (error: unknown) => !!error && typeof error === "object" && "status" in error && error.status === 410 && "code" in error && error.code === "feature_removed";
const old = { kind: "estimate_cell", date: "2024-04-04", period: "daytime", metric: "weightKg", operationId: "retired-operation" };
test("旧单项和混合估算请求明确退役，实测请求保持", () => {
  assert.throws(() => parseAiMeasurementInput(old), removed);
  assert.throws(() => parseAiMeasurementInput({ kind: "batch", operationId: "retired-batch", items: [{kind:"save_record",date:"2024-04-04",period:"evening",weightKg:"70"},old] }), removed);
  assert.equal(parseAiMeasurementInput({kind:"save_day",operationId:"actual-operation",date:"2024-04-04",periods:{daytime:{weightKg:"70",fasting:true}}}).kind,"save_day");
  assert.equal(containsRetiredBodyEstimate({notes:"estimate_cell"}),false);
  assert.ok(!JSON.stringify(recordSchemas).includes("estimate_cell"));
  assert.ok(!JSON.stringify(measurementOpenApi.components.schemas).includes("estimate_cell"));
});

test("迁移前隐藏估计，迁移按类型归档且保留实测、原始导入和审计；不能恢复估计", async () => {
  const pg=new PGlite(),db=drizzle(pg,{schema});
  try {
    await migrate(db,{migrationsFolder:"./drizzle"});
    const userId="fictional-body-retirement",other="fictional-body-retirement-other";
    await db.insert(schema.user).values([{id:userId,name:"虚构用户",email:userId+"@example.test"},{id:other,name:"另一虚构用户",email:other+"@example.test"}]);
    const actor={userId,actorId:userId};
    await saveReportedMeasurements(db,{...actor,requestKey:"7".repeat(64),entryChannel:"manual",deviceLabel:"虚构秤",records:[{recordDate:"2024-04-03",period:"daytime",weightKg:"70.00",bodyFatPercent:"20.00",fasting:true}]});
    const [actual]=await listMeasurements(db,userId);
    await db.update(schema.measurementImport).set({initializationMetadata:{legacy:true,sourceSnapshot:[{id:actual.id,weightKg:actual.weightKg}]}}).where(eq(schema.measurementImport.id,actual.importId!));
    const [source]=await db.select().from(schema.measurementImport).where(eq(schema.measurementImport.id,actual.importId!));
    await pg.exec("ALTER TABLE measurements DROP CONSTRAINT measurements_observed_active; CREATE UNIQUE INDEX measurements_active_estimate_idx ON measurements(user_id,record_date,period) WHERE record_kind='estimated' AND deleted_at IS NULL");
    for (const [id,owner,date] of [["legacy-estimate",userId,"2024-04-04"],["other-estimate",other,"2024-04-05"]]) {
      await db.insert(schema.measurement).values({...actual,id,userId:owner,recordDate:date,sourceLocalTime:date+" 08:00:00",occurredAt:null,recordKind:"estimated",sourceType:"estimate",weightKg:"88.88",bodyFatPercent:"33.33",estimation:{method:"legacy",weightKg:{fictional:true}},deduplicationKey:id,createdBy:owner});
    }
    const audit={id:"fictional-prior-estimate-audit",userId,measurementId:"legacy-estimate",action:"estimate",actorType:"user",actorId:userId,snapshot:{fictional:true,original:"unchanged"}};
    await db.insert(schema.measurementEvent).values(audit);
    assert.deepEqual((await listMeasurements(db,userId)).map(row=>row.id),[actual.id]);
    assert.equal(missingMeasurementCells([actual],"2024-04-04").length,4);
    const legacy=await db.select().from(schema.measurement);
    assert.equal(measurementTrend(legacy,"weightKg",true).points.length,1);
    assert.equal(measurementTrend(legacy,"bodyFatPercent",true).points.length,1);
    const queried=JSON.stringify(await queryAiMeasurements(db,userId,new URLSearchParams(),"Asia/Shanghai"));
    assert.ok(!/88\.88|33\.33|estimateExplanation|estimation|recordKind/.test(queried));
    const sql=await readFile("drizzle/0035_retire_body_estimates.sql","utf8");
    await pg.exec(sql);
    assert.deepEqual((await listMeasurements(db,userId))[0],actual);
    const archived=await db.select().from(schema.measurement).where(eq(schema.measurement.recordKind,"estimated"));
    assert.equal(archived.length,2);assert.ok(archived.every(row=>row.deletedAt));
    assert.throws(()=>measurementDisplay(archived[0]),/不能展示为实测/);
    assert.deepEqual((await db.select().from(schema.measurementImport).where(eq(schema.measurementImport.id,actual.importId!)))[0],source);
    assert.deepEqual((await db.select().from(schema.measurementEvent).where(eq(schema.measurementEvent.id,audit.id)))[0].snapshot,audit.snapshot);
    assert.equal((await pg.query<{count:number}>("SELECT count(*)::int AS count FROM measurement_events WHERE action='retire'")).rows[0].count,2);
    await pg.exec(sql.split("--> statement-breakpoint")[0]);
    assert.equal((await pg.query<{count:number}>("SELECT count(*)::int AS count FROM measurement_events WHERE action='retire'")).rows[0].count,2);
    await assert.rejects(restoreMeasurement(db,{...actor,id:"legacy-estimate"}),/功能已移除/);
    await assert.rejects(restoreMeasurement(db,{userId:other,actorId:other,id:"legacy-estimate"}),/不存在或不属于/);
    await assert.rejects(db.update(schema.measurement).set({deletedAt:null}).where(eq(schema.measurement.id,"legacy-estimate")));
    assert.ok(!("estimation" in measurementDisplay(actual)));
  } finally { await pg.close(); }
});

test("旧预览和混合任务整批停止，不能保存其他项或暴露旧估计", async () => {
  const pg=new PGlite(),db=drizzle(pg,{schema});
  try {
    await migrate(db,{migrationsFolder:"./drizzle"});
    const userId="fictional-retired-preview";
    await db.insert(schema.user).values({id:userId,name:"虚构用户",email:userId+"@example.test"});
    const measurementId="fictional-old-body-operation",recordId="fictional-old-mixed-operation";
    const token=await createAiToken(db,userId,"虚构旧接入","write");
    await pg.query("INSERT INTO measurement_operations(id,user_id,operation_id,request_digest,snapshot_digest,payload,preview,expires_at,token_id) VALUES($1,$2,$1,'request','snapshot',$3,$4,now()+interval '1 hour',$5)",[measurementId,userId,JSON.stringify(old),JSON.stringify({date:old.date,kind:old.kind,canConfirm:true,rows:[],message:"legacy"}),token.token.id]);
    const [stored]=await db.select().from(schema.measurementOperation);
    assert.throws(()=>operationDisplay(stored),removed);
    await assert.rejects(decideAiMeasurementOperation(db,userId,measurementId,"confirm"),removed);
    const payload={operationId:recordId,items:[{key:"actual",kind:"save_record",date:old.date,period:"evening",weightKg:"70.00"},{key:"estimate",...old}]};
    await pg.query("INSERT INTO record_operations(id,user_id,operation_id,request_digest,payload,draft) VALUES($1,$2,$1,'request',$3,$4)",[recordId,userId,JSON.stringify(payload),JSON.stringify(payload.items.map(({key,...action})=>({key,action,originalInput:action,excluded:false,checked:false})))]);
    await assert.rejects(submitRecordOperation(db,{userId,permission:"write"} as never,payload),removed);
    await assert.rejects(getRecordOperation(db,{userId,permission:"write"} as never,recordId),removed);
    await assert.rejects(reviewRecordOperation(db,userId,recordId,{kind:"confirm",revision:1}),removed);
    assert.equal((await listMeasurements(db,userId)).length,0);
    const [original]=await db.select().from(schema.recordOperation);
    assert.deepEqual(original.payload,payload);assert.equal(original.status,"pending");
  } finally { await pg.close(); }
});
