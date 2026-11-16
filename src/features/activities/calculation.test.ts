import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { Database } from "../../db/client";
import { calculateEnergy, calculationReferences, type CalculationContext, type CalculationMeasurement } from "./calculation-model";
import { loadCalculationContext } from "./calculation";
import { submitEnergyOperation, decideEnergyOperation, readEnergySnapshot, reviseEnergyOperation } from "./records";
import { energyDays, type EnergyAction } from "./model";
import { createAiToken, authenticateAi } from "../auth/ai-tokens";
import { createAiPreview, aiPreviewResponse } from "../records/ai-previews";
import { queryEnergy } from "./ai-api";
import { publicEnergyRecord } from "./public-record";

const date="2025-06-03";
const context:CalculationContext={date,profile:{heightCm:"173.5",birthDate:"2004-06-03",sexForCalculation:"male",version:1},weight:{id:"weight",version:"v1",date,period:"daytime",value:"67.8",source:"虚构秤"},bodyFat:{id:"fat",version:"v2",date,period:"daytime",value:"17",source:"虚构体脂秤"},preferences:{restingMethod:"manual",formula:"auto"}};
function snapshot(input= context, method:"auto"|"cunningham"|"mifflin-st-jeor"="auto",daily=false){const result=calculateEnergy(input,{kind:daily?"daily":"resting",method,...(daily?{activityLevel:"sedentary" as const}:{})});assert.equal(result.ok,true);return result.snapshot;}
const measured=(id:string,day=date,patch:Partial<CalculationMeasurement>={}):CalculationMeasurement=>({id,recordDate:day,period:"daytime",weightKg:"67.8",bodyFatPercent:"17",fasting:true,sourceLocalTime:day+" 08:00:00",recordKind:"observed",updatedAt:day+"T00:00:00Z",...patch});
test("脱敏成人样例保留四位精度，全天系数前不取整",()=>{
 assert.equal(snapshot(context,"mifflin-st-jeor").restingKcal,"1662.3750");
 assert.equal(snapshot().restingKcal,"1738.0280");
 assert.equal(snapshot(context,"auto",true).totalKcal,"2259.4364");
 assert.equal(Math.round(Number(snapshot(context,"auto",true).totalKcal)),2259);
 assert.equal(snapshot({...context,profile:{...context.profile!,sexForCalculation:"female"}},"mifflin-st-jeor").restingKcal,"1496.3750");
});
test("自动选择回退，强制公式缺资料不换用其他公式",()=>{
 assert.equal(snapshot({...context,bodyFat:null}).method,"mifflin-st-jeor");
 assert.equal(snapshot({...context,profile:null}).method,"cunningham");
 assert.equal(calculateEnergy({...context,bodyFat:null},{kind:"resting",method:"cunningham"}).ok,false);
 assert.equal(calculateEnergy({...context,profile:null},{kind:"resting",method:"mifflin-st-jeor"}).ok,false);
 assert.equal(calculateEnergy({...context,weight:null},{kind:"resting",method:"auto"}).ok,false);
 assert.equal(calculateEnergy(context,{kind:"daily",method:"auto"}).ok,false);
 assert.equal(calculateEnergy(context,{kind:"resting",method:"auto",activityLevel:"high"}).ok,false);
});
test("30日窗口包含边界，排除过期、未来、已删、估计；同日晨间优先且每指标独立",()=>{
 const refs=calculationReferences(date,[measured("old","2025-05-03"),measured("boundary","2025-05-04",{bodyFatPercent:"16"}),measured("new",date,{bodyFatPercent:null}),measured("evening",date,{period:"evening",weightKg:"69",bodyFatPercent:null}),measured("future","2025-06-04"),measured("deleted",date,{deletedAt:date}),measured("estimated",date,{recordKind:"estimated"})]);
 assert.equal(refs.weight?.id,"new");assert.equal(refs.bodyFat?.id,"boundary");
 assert.equal(calculationReferences(date,[measured("old","2025-05-03"),measured("future","2025-06-04")]).weight,null);
 const adopted=calculationReferences(date,[measured("superseded",date),measured("latest",date,{weightKg:null,bodyFatPercent:"18",updatedAt:date+"T12:00:00Z"})]);
 assert.equal(adopted.weight,null);assert.equal(adopted.bodyFat?.id,"latest");
 assert.equal(calculationReferences(date,[measured("zero",date,{bodyFatPercent:"0"})]).bodyFat?.value,"0");
});
test("公式按目标日期年龄，选择依据变化需要重新核对",()=>{
 assert.equal(snapshot({...context,date:"2025-06-02"},"mifflin-st-jeor").profile?.age,20);
 const old=snapshot({...context,bodyFat:null});
 assert.equal(calculateEnergy(context,{kind:"resting",method:"auto",basisKey:old.basisKey}).ok,false);
 assert.equal(calculateEnergy({...context,weight:{...context.weight!,version:"new"}},{kind:"resting",method:"auto",basisKey:snapshot().basisKey}).ok,false);
});
const pg=new PGlite(),testDb=drizzle(pg,{schema}),db=testDb as unknown as Database;
before(async()=>{await migrate(testDb,{migrationsFolder:"./drizzle"});});after(async()=>{await pg.close();});
async function owner(withFat=true){
 const userId=randomUUID();await db.insert(schema.user).values({id:userId,name:"虚构计算测试",email:userId+"@example.test"});
 await db.insert(schema.personalProfile).values({userId,heightCm:"173.5",birthDate:"2004-06-03",sexForCalculation:"male"});
 const id=randomUUID();await db.insert(schema.measurement).values({id,userId,sourceLocalTime:date+" 08:00:00",recordDate:date,period:"daytime",assignmentMethod:"reported",assignmentRuleVersion:"test-v1",fasting:true,weightKg:"67.8",bodyFatPercent:withFat?"17":null,sourceType:"manual",deviceLabel:"虚构计算秤",originalValues:{},deduplicationKey:id,createdBy:userId});
 return {userId,measurementId:id};
}
const request=(kind:"resting"|"daily"="resting"):EnergyAction=>({kind:"save_energy_day",date,restingInputMethod:"estimate",activityMode:"total",calculation:{kind,method:"auto",...(kind==="daily"?{activityLevel:"sedentary" as const}:{})}});
async function submit(userId:string,actions:EnergyAction[],operationId=randomUUID()){return submitEnergyOperation(db,{userId,origin:"manual"},{operationId,actions});}
test("服务器生成快照，静息单独已知保持未知活动，快捷只存总数；记忆方式但不记忆档位",async()=>{
 const a=await owner(),input=request();const preview=await submit(a.userId,[input]);assert.equal(preview.canConfirm,true);
 await decideEnergyOperation(db,a.userId,preview.id,preview.revision,"confirm");
 const state=await readEnergySnapshot(db,a.userId),day=energyDays(state,[],[date])[0];assert.equal(day.restingKcal,"1738.0280");assert.equal(day.activeKcal,null);assert.equal(day.totalKcal,null);assert.equal(day.estimated,true);
 const saved=state.days[0],daily=request("daily");assert.equal(daily.kind,"save_energy_day");
 const quick=await submit(a.userId,[{...daily,id:saved.id,version:saved.version}]);await decideEnergyOperation(db,a.userId,quick.id,quick.revision,"confirm");
 const result=(await readEnergySnapshot(db,a.userId)).days[0];assert.equal(result.totalKcal,"2259.4364");assert.equal(result.restingKcal,null);assert.equal(result.activeKcal,null);assert.equal(result.calculationSnapshot?.factor,1.3);
 const preferences=(await loadCalculationContext(db,a.userId,"2025-06-04")).preferences;assert.deepEqual(preferences,{restingMethod:"estimate",formula:"auto"});assert.equal("activityLevel" in preferences,false);
});
test("依据变更拒绝旧预览，刷新后保存；已保存结果不随身体和资料更新",async()=>{
 const a=await owner(),preview=await submit(a.userId,[request("daily")]);
 await db.update(schema.measurement).set({weightKg:"68",updatedAt:new Date(Date.now()+1000)}).where(eq(schema.measurement.id,a.measurementId));
 await assert.rejects(decideEnergyOperation(db,a.userId,preview.id,preview.revision,"confirm"),/依据已改变/);
 const refreshed=await reviseEnergyOperation(db,a.userId,preview.id,preview.revision,[request("daily")]);await decideEnergyOperation(db,a.userId,refreshed.id,refreshed.revision,"confirm");
 const frozen=(await readEnergySnapshot(db,a.userId)).days[0];
 await db.update(schema.measurement).set({weightKg:"75",bodyFatPercent:"20",updatedAt:new Date(Date.now()+2000)}).where(eq(schema.measurement.id,a.measurementId));
 await db.update(schema.personalProfile).set({heightCm:"180",version:2}).where(eq(schema.personalProfile.userId,a.userId));
 const unchanged=(await readEnergySnapshot(db,a.userId)).days[0];assert.deepEqual(unchanged,frozen);
 const note=await submit(a.userId,[{kind:"save_energy_day",id:frozen.id,version:frozen.version,date,notes:"保留原估算"}]);assert.equal(note.canConfirm,true);await decideEnergyOperation(db,a.userId,note.id,note.revision,"confirm");
 assert.deepEqual((await readEnergySnapshot(db,a.userId)).days[0].calculationSnapshot,frozen.calculationSnapshot);
});
test("重复请求不重复写入，内容冲突和跨账号引用拒绝，计算数值不可由客户注入",async()=>{
 const a=await owner(),b=await owner(),operationId=randomUUID(),one=await submit(a.userId,[request()],operationId);
 assert.equal((await submit(a.userId,[request()],operationId)).id,one.id);
 await assert.rejects(submit(a.userId,[request("daily")],operationId),/同一请求编号/);
 await decideEnergyOperation(db,a.userId,one.id,one.revision,"confirm");assert.equal((await readEnergySnapshot(db,a.userId)).days.length,1);
 const saved=(await readEnergySnapshot(db,a.userId)).days[0];
 const foreign=await submit(b.userId,[{...request(),id:saved.id,version:saved.version}]);assert.match(foreign.rows[0].error!,/不属于/);
 const injected=await submit(a.userId,[{...request(),date:"2025-06-04",restingKcal:"999999"} as EnergyAction]);assert.match(injected.rows[0].error!,/服务器计算/);
 await assert.rejects(decideEnergyOperation(db,b.userId,one.id,one.revision,"confirm"),/不存在/);
});
test("AI预览和普通查询复用计算且不泄露原始资料，组合规则及确认仍有效",async()=>{
 const a=await owner(),token=await createAiToken(db,a.userId,"虚构计算令牌","write"),identity=await authenticateAi(db,"Bearer "+token.rawToken);
 const preview=await createAiPreview(db,identity,"preview_energy",{operationId:randomUUID(),days:[{date,calculation:{kind:"daily",method:"auto",activityLevel:"sedentary"}}]});
 assert.equal(preview.canConfirm,true);const response=JSON.stringify(aiPreviewResponse(preview));assert.match(response,/2259.4364/);assert.doesNotMatch(response,/birthDate|sexForCalculation|heightCm|basisKey|2004-06-03/);
 const op=await submit(a.userId,[request("daily")]);await decideEnergyOperation(db,a.userId,op.id,op.revision,"confirm");
 for(const view of ["summary","details",null]){const params=new URLSearchParams({from:date,to:date,...(view?{view}:{})});const result=JSON.stringify(await queryEnergy(db,a.userId,params));assert.match(result,/cunningham/);assert.doesNotMatch(result,/birthDate|sexForCalculation|heightCm|basisKey|2004-06-03/);}
 assert.ok(publicEnergyRecord((await readEnergySnapshot(db,a.userId)).days[0]));
});
test("组合入口直接请求静息估算也不将空运动补成0",async()=>{
 const a=await owner(),token=await createAiToken(db,a.userId,"虚构组合计算","write"),identity=await authenticateAi(db,"Bearer "+token.rawToken);
 const preview=await createAiPreview(db,identity,"preview_record_bundle",{operationId:randomUUID(),items:[{key:"energy",kind:"save_energy_day",date,calculation:{kind:"resting",method:"auto"}},{key:"food",kind:"save_food",name:"虚构食材",unit:"g",baseQuantity:"100",sourceKind:"unknown",nutrition:{caloriesKcal:null,proteinG:null,carbsG:null,fatG:null}}]});
 const day=preview.rows.find(row=>row.energy)?.energy?.day;assert.equal(day?.restingKcal,"1738.0280");assert.equal(day?.activeKcal,null);assert.equal(day?.totalKcal,null);
});
test("缺计算资料无副作用，设备方式不采用客户伪造值，活动0保留",async()=>{
 const a=await owner(false);await db.update(schema.personalProfile).set({sexForCalculation:null}).where(eq(schema.personalProfile.userId,a.userId));
 const missing=await submit(a.userId,[request()]);assert.equal(missing.canConfirm,false);assert.match(missing.rows[0].error!,/性别/);assert.equal((await readEnergySnapshot(db,a.userId)).days.length,0);
 const device=await submit(a.userId,[{kind:"save_energy_day",date,restingInputMethod:"device",restingKcal:"2058"}]);assert.equal(device.canConfirm,false);
 const manual=await submit(a.userId,[{kind:"save_energy_day",date,entryMode:"components",activityMode:"total",restingInputMethod:"manual",restingKcal:"2058",activeKcal:"0"}]);await decideEnergyOperation(db,a.userId,manual.id,manual.revision,"confirm");assert.equal(energyDays(await readEnergySnapshot(db,a.userId),[],[date])[0].totalKcal,"2058.0000");
});
test("AI计算额外要求身体查询权限，预览后撤销权限也阻止确认",async()=>{
 const a=await owner(),clientId=randomUUID(),connectionId=randomUUID(),consentId=randomUUID(),scopes=["energy:read","energy:write"];
 await db.insert(schema.oauthClient).values({id:clientId,clientId,redirectUris:["https://example.test/callback"]});
 await db.insert(schema.oauthConnection).values({id:connectionId,userId:a.userId,clientId,scopes,authorizedAt:new Date(),expiresAt:new Date(Date.now()+3600000)});
 await db.insert(schema.oauthConsent).values({id:consentId,userId:a.userId,clientId,referenceId:connectionId,scopes,createdAt:new Date(),updatedAt:new Date()});
 const identity={userId:a.userId,oauthConnectionId:connectionId,permission:"write" as const};
 await assert.rejects(createAiPreview(db,identity,"preview_energy",{operationId:randomUUID(),days:[{date,calculation:{kind:"resting",method:"auto"}}]}),/授权不包含/);
 assert.equal((await readEnergySnapshot(db,a.userId)).days.length,0);
 const permitted=[...scopes,"measurements:read"];await db.update(schema.oauthConnection).set({scopes:permitted}).where(eq(schema.oauthConnection.id,connectionId));await db.update(schema.oauthConsent).set({scopes:permitted}).where(eq(schema.oauthConsent.id,consentId));
 const op=await submitEnergyOperation(db,{userId:a.userId,origin:"ai",identity},{operationId:randomUUID(),actions:[request()]});assert.equal(op.canConfirm,true);
 await db.update(schema.oauthConsent).set({scopes}).where(eq(schema.oauthConsent.id,consentId));await assert.rejects(decideEnergyOperation(db,a.userId,op.id,op.revision,"confirm"),/授权不包含/);
});
test("活动估算与运动明细计入互斥，保留明细不重复相加",async()=>{
 const a=await owner(),activity:EnergyAction={kind:"save_activity",date,name:"虚构运动",caloriesKcal:"100",inclusion:"additional"};
 const invalid=await submit(a.userId,[request("daily"),activity]);assert.equal(invalid.canConfirm,false);assert.match(invalid.rows[1].error!,/不能额外相加/);
 const valid=await submit(a.userId,[request("daily"),{...activity,inclusion:"included"}]);assert.equal(valid.canConfirm,true);await decideEnergyOperation(db,a.userId,valid.id,valid.revision,"confirm");
 const days=energyDays(await readEnergySnapshot(db,a.userId),[],[date]);assert.equal(days[0].totalKcal,"2259.4364");assert.equal(days[0].activities.length,1);
});
test("兼容旧应用改数后不冒充旧公式；只改备注仍保留固定快照",async()=>{
 const a=await owner(),operation=await submit(a.userId,[request("daily")]);await decideEnergyOperation(db,a.userId,operation.id,operation.revision,"confirm");
 const [saved]=await db.select().from(schema.energyDay).where(eq(schema.energyDay.userId,a.userId));
 await db.update(schema.energyDay).set({notes:"旧版备注"}).where(eq(schema.energyDay.id,saved.id));assert.ok((await readEnergySnapshot(db,a.userId)).days[0].calculationSnapshot);
 await db.update(schema.energyDay).set({totalKcal:"2400",version:saved.version+1}).where(eq(schema.energyDay.id,saved.id));
 const record=(await readEnergySnapshot(db,a.userId)).days[0];assert.equal(record.calculationSnapshot,null);assert.equal(record.restingInputMethod,"manual");assert.equal(record.totalKcal,"2400.0000");
});
test("旧客户端明确改静息或全天值仍按手填保存，来源计算快照清除",async()=>{
 const a=await owner(),one=await submit(a.userId,[request("daily")]);await decideEnergyOperation(db,a.userId,one.id,one.revision,"confirm");const saved=(await readEnergySnapshot(db,a.userId)).days[0];
 const edit=await submit(a.userId,[{kind:"save_energy_day",id:saved.id,version:saved.version,date,totalKcal:"2400"}]);assert.equal(edit.canConfirm,true);await decideEnergyOperation(db,a.userId,edit.id,edit.revision,"confirm");const updated=(await readEnergySnapshot(db,a.userId)).days[0];assert.equal(updated.totalKcal,"2400.0000");assert.equal(updated.calculationSnapshot,null);assert.equal(updated.restingInputMethod,"manual");
});
test("设备沿用已采用分项或仅总数，不套系数、不接受伪造设备值",async()=>{
 const a=await owner(),id=randomUUID();await db.insert(schema.energyDay).values({id,userId:a.userId,date,entryMode:"total",activityMode:"total",timezone:"Asia/Shanghai",totalKcal:"2158",sourceSystem:"Garmin Personal:虚构"});
 const metadata={strategy:"total" as const,sources:{total:null,resting:null,active:null,steps:null,activities:null},facts:[],restingKcal:"2058",activeKcal:"100",compositionKnown:true,coverageUntil:null,syncedAt:new Date().toISOString(),label:"虚构Garmin"};
 await db.insert(schema.energyDayAdoption).values({userId:a.userId,date,mode:"source",metadata});
 const valid=await submit(a.userId,[{kind:"save_energy_day",id,version:1,date,restingInputMethod:"device",entryMode:"total",totalKcal:"2158",notes:"直接采用设备"}]);assert.equal(valid.canConfirm,true);await decideEnergyOperation(db,a.userId,valid.id,valid.revision,"confirm");
 const saved=(await readEnergySnapshot(db,a.userId)).days[0];assert.equal(saved.totalKcal,"2158.0000");assert.equal(saved.calculationSnapshot,null);assert.equal(energyDays(await readEnergySnapshot(db,a.userId),[],[date])[0].restingKcal,"2058");
 const forged=await submit(a.userId,[{kind:"save_energy_day",id,version:saved.version,date,restingInputMethod:"device",totalKcal:"9999"}]);assert.match(forged.rows[0].error!,/设备全天值/);
 await db.update(schema.energyDayAdoption).set({metadata:{...metadata,restingKcal:null,activeKcal:null,compositionKnown:false}}).where(eq(schema.energyDayAdoption.userId,a.userId));
 const onlyTotal=await submit(a.userId,[{kind:"save_energy_day",id,version:saved.version,date,restingInputMethod:"device",notes:"只有设备总数"}]);assert.equal(onlyTotal.canConfirm,true);assert.equal(onlyTotal.rows[0].day?.restingKcal,null);assert.equal(onlyTotal.rows[0].day?.totalKcal,"2158.0000");
});
