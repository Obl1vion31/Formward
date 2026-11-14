import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { Database } from "../../db/client";
import { createAiToken, authenticateAi, revokeAiToken } from "../auth/ai-tokens";
import { createAiPreview, getAiPreview, updateAiPreview, aiPreviewResponse, previewBundleSchema, previewMealChangesSchema, updatePreviewSchema } from "./ai-previews";
import { aiContractSnapshot } from "../mcp/contract-export";
import { chatToolBridge } from "../assistant/chat-tools";
import { createAiToolSession } from "./ai-tool-session.mjs";
import { withAiFieldDefinitions } from "./ai-field-definitions";
import { emptyNutrition } from "../meals/model";
import { submitMealOperation, readMealSnapshot } from "../meals/records";
import { submitAiMeasurementOperation } from "../measurements/ai-operations";
import { reviewRecordOperation } from "./operations";
import { doubaoInputSchema } from "../doubao/mcp";

const pg = new PGlite(), testDb = drizzle(pg, { schema }), db = testDb as unknown as Database;
before(async () => { await migrate(testDb, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
async function owner() {
  const userId = randomUUID(); await db.insert(schema.user).values({ id:userId, name:"虚构工具V2用户", email:userId+"@example.test" });
  const token = await createAiToken(db,userId,"V2隔离测试","write");
  return { userId, token, identity:await authenticateAi(db,"Bearer "+token.rawToken) };
}
const milk = { name:"虚构牛奶", quantity:"250", unit:"mL", caloriesKcal:"150", proteinG:"7.5", carbsG:"11.25", fatG:"8.75", sourceKind:"label", basis:"虚构测试标签，本次250mL总量" };
const meal = { date:"2024-08-01", mealType:"早餐", foods:[milk], notes:"保留原备注" };
const make = (operationId=randomUUID()) => ({ operationId, meals:[meal] });
async function image(userId:string) { const id=randomUUID();await db.insert(schema.mealImage).values({id,userId,pathname:"isolated/"+id,sha256:id,mimeType:"image/png",byteSize:32,fileName:"虚构.png",source:"ai",createdBy:userId});return id; }

test("正式目录恰为18项、退役工具不注册、两种按需会话同源",async()=>{
  const {contract}=await aiContractSnapshot();assert.equal(contract.tools.length,18);assert.equal(contract.serverInfo.version,"2.0.0");
  const names=contract.tools.map((tool:{name:string})=>tool.name);
  for(const old of ["submit_record_operation","submit_meal_operation","submit_measurement_operation","submit_training_operation","get_record_operation","get_meal_operation","get_measurement_operation","get_training_operation","preview_meal","append_pending_images"])assert.equal(names.includes(old),false);
  const a=await owner(),bridge=chatToolBridge(db,a.identity,new Request("http://localhost/api/mcp"));
  try{await bridge.rpc("initialize",{protocolVersion:"2025-11-25",capabilities:{},clientInfo:{name:"v2-test",version:"1"}});
    for(const name of ["authorize_formward","get_profile","query_measurements","query_meals","query_energy","query_training","search_foods","search_exercises"]){const result=await bridge.rpc("tools/call",{name,arguments:{}});assert.equal(result.isError,undefined,name);assert.ok(result.structuredContent.fieldDefinitions,name);assert.doesNotMatch(JSON.stringify(result.structuredContent),/submit_record_operation|get_meal_operation/,name+"回执不再引导退役工具");}
    const old=await bridge.rpc("tools/call",{name:"submit_meal_operation",arguments:{}});assert.ok(old.isError);
  }finally{await bridge.close();}
  const session=createAiToolSession(contract,{managedOperationIds:true});session.load({names:["preview_meals","preview_foods"]});
  const first=session.prepare("preview_meals",make()).args!,changed=session.prepare("preview_foods",{foods:[]}).args!;
  assert.equal(first.operationId,changed.operationId,"同任务创建编号不随工具或内容变化");
});
test("豆包发现平铺新组合餐项的食物互斥分支，原生合同和其他union保持",async()=>{
  const {contract}=await aiContractSnapshot(),original=contract.tools.find((tool:{name:string})=>tool.name==="preview_record_bundle")!.inputSchema;
  const count=(value:unknown):number=>{if(!value||typeof value!=="object")return 0;const row=value as Record<string,unknown>,options=row.anyOf as {properties?:Record<string,unknown>}[]|undefined;return(options?.some(option=>option.properties?.foodId)&&options?.some(option=>option.properties?.nutrition)?1:0)+Object.values(row).reduce<number>((sum,item)=>sum+count(item),0);};
  assert.ok(count(original)>0);assert.equal(count(doubaoInputSchema(original)),0);assert.ok(count(original)>0);
  const unrelated={anyOf:[{type:"string"},{type:"number"}]};assert.deepEqual(doubaoInputSchema(unrelated),unrelated);
});
test("新餐全部走统一父预览，同ID重试或跨入口冲突不多建批次",async()=>{
  const a=await owner(),input=make(),one=await createAiPreview(db,a.identity,"preview_meals",input);
  assert.equal(one.canConfirm,true);assert.equal((await createAiPreview(db,a.identity,"preview_meals",input)).id,one.id);
  await assert.rejects(()=>createAiPreview(db,a.identity,"preview_meals",{...input,meals:[{...meal,foods:[{...milk,quantity:"200"}]}]}),/同一operationId/);
  await assert.rejects(()=>createAiPreview(db,a.identity,"preview_foods",{operationId:input.operationId,foods:[{name:"库项",baseQuantity:"100",unit:"g",nutrition:emptyNutrition(),sourceKind:"unknown"}]}),/同一operationId/);
  assert.equal((await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.userId,a.userId))).length,1);
  assert.equal((await db.select().from(schema.mealOperation).where(eq(schema.mealOperation.userId,a.userId))).length,1);
  assert.equal((await readMealSnapshot(db,a.userId)).meals.length,0);
  await assert.rejects(()=>createAiPreview(db,a.identity,"preview_record_bundle",{operationId:randomUUID(),items:[{key:"meal",kind:"save_meal",date:"2024-08-01",mealType:"早餐",items:[{kind:"food",name:"鸡蛋",quantity:"1",unit:"个",nutrition:emptyNutrition(),sourceKind:"unknown"}]}]}),/至少包含两类/);
});
test("局部改数量服务器缩放，原请求不变、原id不变、重复修改只执行一次",async()=>{
  const a=await owner(),one=await createAiPreview(db,a.identity,"preview_meals",make()),[stored]=await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.id,one.id));
  const input={operationId:randomUUID(),id:one.id,revision:one.revision,changes:[{key:one.rows[0].key,kind:"save_meal",updateFoods:[{index:0,quantity:"200",quantityEffect:"scale_total"}]}]};
  const two=await updateAiPreview(db,a.identity,input);assert.equal(two.id,one.id);assert.equal(two.rows[0].meal?.meal?.totals.values.caloriesKcal,"120.0000");assert.equal(two.rows[0].meal?.meal?.notes,meal.notes);
  const repeat=await updateAiPreview(db,a.identity,input);assert.equal(repeat.repeated,true);assert.equal(repeat.revision,two.revision);
  const [after]=await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.id,one.id));assert.deepEqual(after.payload,stored.payload);assert.equal(after.requestDigest,stored.requestDigest);
  await assert.rejects(()=>updateAiPreview(db,a.identity,{...input,changes:[{key:one.rows[0].key,kind:"save_meal",notes:"改内容"}]}),/同一修改请求/);
  const state=await getAiPreview(db,a.identity,one.id);assert.equal(state.status,"pending");assert.equal(aiPreviewResponse(state,"status").saved,0);
  assert.ok(withAiFieldDefinitions("get_preview",aiPreviewResponse(state)).fieldDefinitions["rows.*.meal.**.notes"]);
});
test("追加漏项沿用同批，身体和新餐只有一个父预览；复试不重复追加",async()=>{
  const a=await owner(),one=await createAiPreview(db,a.identity,"preview_meals",make());
  const input={operationId:randomUUID(),id:one.id,revision:one.revision,appendItems:[{key:"body",kind:"save_record",date:"2024-08-01",period:"daytime",weightKg:"66.3",fasting:true,deviceLabel:"虚构体脂秤"}]};
  const two=await updateAiPreview(db,a.identity,input);assert.equal(two.id,one.id);assert.equal(two.rows.length,2);assert.equal(two.rows.find(row=>row.key==="body")?.body?.input.weightKg,"66.30");
  const repeat=await updateAiPreview(db,a.identity,input);assert.equal(repeat.repeated,true);assert.equal(repeat.rows.length,2);
  await assert.rejects(()=>updateAiPreview(db,a.identity,{...input,operationId:randomUUID(),revision:two.revision}),/唯一key/);
  assert.equal((await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.userId,a.userId))).length,1);
  assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.userId,a.userId))).length,0);
});
test("向既有身体子预览追加新时段，保留原项和原到期时间",async()=>{
  const a=await owner(),one=await createAiPreview(db,a.identity,"preview_measurements",{operationId:randomUUID(),items:[{kind:"save_record",date:"2024-08-01",period:"daytime",weightKg:"66.3",fasting:true,deviceLabel:"虚构秤"}]});
  const two=await updateAiPreview(db,a.identity,{id:one.id,revision:one.revision,operationId:randomUUID(),appendItems:[{key:"evening",kind:"save_record",date:"2024-08-01",period:"evening",weightKg:"66.5",fasting:false,deviceLabel:"虚构秤"}]});
  assert.equal(two.rows.length,2);assert.equal(two.expiresAt,one.expiresAt);assert.equal(two.canConfirm,true);
});
test("补照片保留原附件及文字，去重、跨账号、版本冲突分别校验",async()=>{
  const a=await owner(),other=await owner(),first=await image(a.userId),second=await image(a.userId),foreign=await image(other.userId);
  const one=await createAiPreview(db,a.identity,"preview_meals",{operationId:randomUUID(),meals:[{...meal,imageIds:[first]}]});
  const input={operationId:randomUUID(),id:one.id,revision:one.revision,changes:[{kind:"save_meal",key:one.rows[0].key,addImageIds:[second]}]};
  const two=await updateAiPreview(db,a.identity,input);assert.deepEqual(two.rows[0].meal?.meal?.imageIds,[first,second]);assert.equal(two.rows[0].meal?.meal?.notes,meal.notes);
  assert.equal((await updateAiPreview(db,a.identity,input)).revision,two.revision);
  await assert.rejects(()=>updateAiPreview(db,a.identity,{...input,operationId:randomUUID()}),/已变化/);
  await assert.rejects(()=>updateAiPreview(db,a.identity,{...input,operationId:randomUUID(),revision:two.revision,changes:[{kind:"save_meal",key:one.rows[0].key,addImageIds:[foreign]}]}),/不属于当前账号/);
  assert.deepEqual((await getAiPreview(db,a.identity,one.id)).rows[0].meal?.meal?.imageIds,[first,second]);
});
test("食材维护不生成实际餐次，正式保存仍须原网页确认",async()=>{
  const a=await owner(),one=await createAiPreview(db,a.identity,"preview_foods",{operationId:randomUUID(),foods:[{name:"虚构复测牛奶",baseQuantity:"100",unit:"mL",nutrition:{caloriesKcal:"60",proteinG:"3",carbsG:"4.5",fatG:"3.5"},sourceKind:"label",basis:"虚构标签"}]});
  assert.equal(one.rows[0].action.kind,"save_food");assert.equal(one.canConfirm,true);assert.equal((await readMealSnapshot(db,a.userId)).foods.length,0);
  const saved=await reviewRecordOperation(db,a.userId,one.id,{kind:"confirm",revision:one.revision});assert.equal(saved.saved,1);
  const facts=await readMealSnapshot(db,a.userId);assert.equal(facts.foods.length,1);assert.equal(facts.meals.length,0);
});
test("已保存餐次只改备注；待审编号不能混入正式修改入口",async()=>{
  const a=await owner(),one=await createAiPreview(db,a.identity,"preview_meals",make());await reviewRecordOperation(db,a.userId,one.id,{kind:"confirm",revision:one.revision});
  const saved=(await readMealSnapshot(db,a.userId)).meals[0];
  const edit=await createAiPreview(db,a.identity,"preview_meal_changes",{operationId:randomUUID(),changes:[{mealId:saved.id,version:saved.version,notes:"聚餐"}]});
  assert.equal(edit.rows[0].meal?.meal?.notes,"聚餐");assert.deepEqual(edit.rows[0].meal?.meal?.totals,saved.totals);assert.equal((await readMealSnapshot(db,a.userId)).meals[0].notes,meal.notes);
  assert.equal(previewMealChangesSchema.safeParse({operationId:randomUUID(),previewId:edit.id,revision:edit.revision,notes:"不应接受"}).success,false);
  assert.equal(updatePreviewSchema.safeParse({operationId:randomUUID(),id:edit.id,revision:edit.revision,changes:[{kind:"save_meal",key:edit.rows[0].key,mealId:randomUUID()}]}).success,false);
});
test("旧身体和饮食预览仍可统一读取、原授权修改、原链接继续确认",async()=>{
  const a=await owner();
  const old=await submitMealOperation(db,{userId:a.userId,origin:"ai",identity:a.identity},{operationId:randomUUID(),actions:[{kind:"save_meal",date:"2024-08-01",mealType:"午餐",items:[{kind:"food",name:"虚构鸡蛋",quantity:"1",unit:"个",sourceKind:"unknown",nutrition:emptyNutrition()}]}]});
  const viewed=await getAiPreview(db,a.identity,old.id),updated=await updateAiPreview(db,a.identity,{id:old.id,revision:viewed.revision,operationId:randomUUID(),changes:[{key:viewed.rows[0].key,kind:"save_meal",notes:"保留旧链接"}]});
  assert.equal((await getAiPreview(db,a.identity,old.id)).id,updated.id);assert.equal(updated.rows[0].meal?.meal?.notes,"保留旧链接");
  const body=await submitAiMeasurementOperation(db,a.identity,{kind:"batch",operationId:randomUUID(),items:[{kind:"save_record",date:"2024-08-01",period:"daytime",weightKg:"66",fasting:true,deviceLabel:"虚构秤"}]});assert.equal((await getAiPreview(db,a.identity,body.id)).rows.length,1);
});
test("原授权、权限、账号、到期和项目身份不能由草稿修改绕过",async()=>{
  const a=await owner(),other=await owner(),one=await createAiPreview(db,a.identity,"preview_meals",make()),input={operationId:randomUUID(),id:one.id,revision:one.revision,changes:[{kind:"save_meal",key:one.rows[0].key,notes:"修改"}]};
  await assert.rejects(()=>getAiPreview(db,other.identity,one.id),/不属于/);await assert.rejects(()=>updateAiPreview(db,other.identity,input),/不属于/);
  const another=await createAiToken(db,a.userId,"另一个授权","write"),otherGrant=await authenticateAi(db,"Bearer "+another.rawToken);
  await assert.rejects(()=>updateAiPreview(db,otherGrant,input),/原授权/);await assert.rejects(()=>updateAiPreview(db,a.identity,input,new Date(),["meals:read"]),/写入权限/);
  await revokeAiToken(db,a.userId,a.identity.tokenId!);await assert.rejects(()=>updateAiPreview(db,a.identity,input),/撤销|无效|到期/);
});
test("单功能组合调用拒绝，消费条目与食材入库可组合，多餐可同批",async()=>{
  const a=await owner();assert.equal(previewBundleSchema.safeParse({operationId:randomUUID(),previewId:randomUUID(),revision:1,items:[]}).success,false);
  const many=await createAiPreview(db,a.identity,"preview_meals",{operationId:randomUUID(),meals:[meal,{...meal,mealType:"午餐"}]});assert.equal(many.rows.length,2);
  const energy=await createAiPreview(db,a.identity,"preview_energy",{operationId:randomUUID(),days:[{date:"2024-08-01",totalKcal:"2200"},{date:"2024-08-02",totalKcal:"2300"}]});assert.equal(energy.rows.filter(row=>row.action.kind==="save_energy_day").length,2);
  const train=await createAiPreview(db,a.identity,"preview_training",{operationId:randomUUID(),items:[{key:"plan",kind:"schedule_training",date:"2024-08-01",templateId:randomUUID()}]});assert.equal(train.rows[0].action.kind,"schedule_training");assert.equal(train.canConfirm,false,"不存在模板必须不能确认");
});
