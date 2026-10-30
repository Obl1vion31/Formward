import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { authenticateAi, createAiToken, revokeAiToken } from "../auth/ai-tokens";
import { submitAiMeasurementOperation, reviewAiMeasurementOperation } from "../measurements/ai-operations";
import { submitMealOperation, decideMealOperation, readMealSnapshot, reviseMealOperation } from "../meals/records";
import { macroDistribution, sumNutrition } from "../meals/model";
import { submitRecordOperation, reviewRecordOperation, loadRecordReview, getRecordOperation, listRecordOperations } from "./operations";

import type { RecordReviewView } from "./model";

const pg = new PGlite(), db = drizzle(pg, { schema });
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
const nutrition = { caloriesKcal: "200", proteinG: "20", carbsG: "10", fatG: "8" };
const body = { key: "body", kind: "save_record", date: "2024-08-01", period: "daytime", weightKg: "70", fasting: true, deviceLabel: "虚构秤" } as const;
const food = { key: "food", kind: "save_food", name: "虚构食品", baseQuantity: "100", unit: "g", nutrition, sourceKind: "estimated", basis: "虚构成分数据" } as const;
const meal = { key: "meal", kind: "save_meal", date: "2024-08-01", mealType: "午餐", items: [{ kind: "food", name: "虚构食品", quantity: "50", unit: "g", nutrition, sourceKind: "estimated" }] } as const;
async function owner() {
  const userId = randomUUID(); await db.insert(schema.user).values({ id: userId, email: `${userId}@example.test`, name: "虚构统一审核用户" });
  const token = await createAiToken(db, userId, "虚构令牌", "write"), identity = await authenticateAi(db, `Bearer ${token.rawToken}`);
  return { userId, identity, token };
}
const input = (items: unknown[]) => ({ operationId: randomUUID(), items });
const reject = (work: Promise<unknown>, code: string) => assert.rejects(work, (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === code);

test("克数与能量比例分别计算，热量未知不影响克数百分比，零与缺项不造比例", () => {
  const totals = sumNutrition([{ caloriesKcal: "3500", proteinG: "127", carbsG: "354", fatG: "182" }]);
  const grams = macroDistribution(totals)!, energy = macroDistribution(totals, "energy")!;
  assert.ok(Math.abs(grams[2].ratio - 182 / 663) < 1e-12);
  assert.ok(Math.abs(energy[2].ratio - 1638 / 3562) < 1e-12);
  assert.equal(grams.reduce((sum, segment) => sum + segment.calories, 0), 3500);
  assert.ok(macroDistribution(sumNutrition([{ ...nutrition, caloriesKcal: null }])));
  assert.equal(macroDistribution(sumNutrition([{ ...nutrition, fatG: null }])), null);
  assert.equal(macroDistribution(sumNutrition([{ ...nutrition, proteinG: "0", carbsG: "0", fatG: "0" }])), null);
});

for (let mask = 1; mask <= 7; mask++) test(`三类内容任意组合 ${mask}，草稿不写事实，统一确认幂等`, async () => {
  const { userId, identity } = await owner(), raw = input([body, meal, food].filter((_, index) => mask & (1 << index)));
  let operation: RecordReviewView = await submitRecordOperation(db, identity, raw);
  assert.equal((await readMealSnapshot(db, userId)).meals.length, 0);
  assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.userId, userId))).length, 0);
  assert.equal((await submitRecordOperation(db, identity, raw)).id, operation.id);
  operation = await reviewRecordOperation(db, userId, operation.id, { kind: "check", revision: operation.revision, keys: [operation.rows[0].key] });
  assert.equal(operation.rows[0].checked, true);
  assert.equal((await readMealSnapshot(db, userId)).foods.length, 0);
  operation = await reviewRecordOperation(db, userId, operation.id, { kind: "confirm", revision: operation.revision });
  assert.equal(operation.status, "confirmed");
  const snapshot = await readMealSnapshot(db, userId);
  assert.equal(snapshot.meals.length, mask & 2 ? 1 : 0); assert.equal(snapshot.foods.length, mask & 4 ? 1 : 0);
  assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.userId, userId))).length, mask & 1 ? 1 : 0);
  assert.equal((await reviewRecordOperation(db, userId, operation.id, { kind: "confirm", revision: 1 })).status, "confirmed");
});

test("同批新食材只入库一次，多餐复用；取消食材仍保留每餐快照和营养", async () => {
  for (const excludeFood of [false, true]) {
    const { userId, identity } = await owner();
    const linked = { ...meal, items: [{ kind: "food", name: food.name, foodRef: food.key, quantity: "50", unit: "g", sourceKind: "estimated" }] };
    let operation: RecordReviewView = await submitRecordOperation(db, identity, input([food, linked, { ...linked, key: "dinner", mealType: "晚餐" }]));
    assert.ok(operation.rows.every(row => !row.meal?.error), operation.rows.map(row => row.meal?.error).join(";"));
    if (excludeFood) operation = await reviewRecordOperation(db, userId, operation.id, { kind: "exclude", revision: operation.revision, keys: [food.key] });
    operation = await reviewRecordOperation(db, userId, operation.id, { kind: "confirm", revision: operation.revision });
    const snapshot = await readMealSnapshot(db, userId); assert.equal(snapshot.foods.length, excludeFood ? 0 : 1); assert.equal(snapshot.meals.length, 2);
    for (const saved of snapshot.meals) { assert.equal(Number(saved.totals.values.caloriesKcal), 100); assert.equal(saved.items[0].foodSnapshot?.baseQuantity, "100"); assert.equal(!!saved.items[0].foodId, !excludeFood); }
  }
});

test("只入库不保存摄入，排除可恢复；内嵌新食材自动展开", async () => {
  const { userId, identity } = await owner(); const { key, kind, ...draft } = food; void key; void kind;
  let operation: RecordReviewView = await submitRecordOperation(db, identity, input([{ ...meal, items: [{ kind: "food", name: food.name, foodDraft: draft, quantity: "50", unit: "g", sourceKind: "estimated" }] }]));
  assert.equal(operation.rows.length, 2);
  operation = await reviewRecordOperation(db, userId, operation.id, { kind: "exclude", revision: operation.revision, keys: [meal.key] });
  operation = await reviewRecordOperation(db, userId, operation.id, { kind: "restore", revision: operation.revision, keys: [meal.key] });
  operation = await reviewRecordOperation(db, userId, operation.id, { kind: "exclude", revision: operation.revision, keys: [meal.key] });
  await reviewRecordOperation(db, userId, operation.id, { kind: "confirm", revision: operation.revision });
  const snapshot = await readMealSnapshot(db, userId); assert.equal(snapshot.foods.length, 1); assert.equal(snapshot.meals.length, 0);
});

test("修改清除核对标记，原请求不变，食材修改联动本餐预览", async () => {
  const { userId, identity } = await owner(), linked = { ...meal, items: [{ kind: "food", name: food.name, foodRef: food.key, quantity: "50", unit: "g", sourceKind: "estimated" }] };
  const raw = input([food, linked]); let operation: RecordReviewView = await submitRecordOperation(db, identity, raw);
  operation = await reviewRecordOperation(db, userId, operation.id, { kind: "check", revision: operation.revision, keys: [food.key, meal.key] });
  const { key, ...action } = food;
  operation = await reviewRecordOperation(db, userId, operation.id, { kind: "update", revision: operation.revision, key, action: { ...action, nutrition: { ...nutrition, caloriesKcal: "400" } } });
  assert.ok(operation.rows.every(row => !row.checked)); assert.equal(Number(operation.rows.find(row => row.key === meal.key)?.meal?.meal?.totals.values.caloriesKcal), 200);
  const [stored] = await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.id, operation.id)); assert.deepEqual(stored.payload, raw);
});

test("第二类写入审计失败，身体、饮食及终态整个事务回滚", async () => {
  const { userId, identity } = await owner(), operation = await submitRecordOperation(db, identity, input([body, meal]));
  await pg.exec(`CREATE FUNCTION fail_record_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id = '${userId}' THEN RAISE EXCEPTION 'fictional failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_record_audit BEFORE INSERT ON meal_events FOR EACH ROW EXECUTE FUNCTION fail_record_audit();`);
  try { await assert.rejects(reviewRecordOperation(db, userId, operation.id, { kind: "confirm", revision: operation.revision })); }
  finally { await pg.exec("DROP TRIGGER fail_record_audit ON meal_events; DROP FUNCTION fail_record_audit();"); }
  assert.equal((await readMealSnapshot(db, userId)).meals.length, 0);
  assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.userId, userId))).length, 0);
  assert.equal((await loadRecordReview(db, userId, operation.id)).status, "pending");
  await reviewRecordOperation(db, userId, operation.id, { kind: "confirm", revision: operation.revision });
});

test("跨账号、重复内容冲突、重复key、无效项目、撤销授权与并发审核保护", async () => {
  const ownerA = await owner(), ownerB = await owner(), raw = input([body, meal]);
  let operation: RecordReviewView = await submitRecordOperation(db, ownerA.identity, raw);
  await reject(loadRecordReview(db, ownerB.userId, operation.id), "not_found");
  await reject(getRecordOperation(db, ownerB.identity, operation.id), "not_found");
  await reject(reviewRecordOperation(db, ownerB.userId, operation.id, { kind: "confirm", revision: 1 }), "not_found");
  await reject(submitRecordOperation(db, ownerA.identity, { ...raw, items: [body] }), "request_conflict");
  await reject(submitRecordOperation(db, ownerA.identity, input([body, body])), "invalid_input");
  operation = await reviewRecordOperation(db, ownerA.userId, operation.id, { kind: "check", revision: 1, keys: [body.key] });
  await reject(reviewRecordOperation(db, ownerA.userId, operation.id, { kind: "confirm", revision: 1 }), "review_changed");
  await revokeAiToken(db, ownerA.userId, ownerA.token.token.id);
  await assert.rejects(reviewRecordOperation(db, ownerA.userId, operation.id, { kind: "confirm", revision: operation.revision }));
  let invalid: RecordReviewView = await submitRecordOperation(db, ownerB.identity, input([{ ...body, weightKg: "wrong" }, meal]));
  await reject(reviewRecordOperation(db, ownerB.userId, invalid.id, { kind: "confirm", revision: 1 }), "review_required");
  invalid = await reviewRecordOperation(db, ownerB.userId, invalid.id, { kind: "exclude", revision: 1, keys: [body.key] });
  await reviewRecordOperation(db, ownerB.userId, invalid.id, { kind: "confirm", revision: invalid.revision });
});

test("旧链接读取不写批次，首次核对采用统一草稿，旧身体已保存行不重复写入", async () => {
  const { userId, identity } = await owner();
  const bodyOperation = await submitAiMeasurementOperation(db, identity, { kind: "batch", operationId: randomUUID(), items: [{ ...body, key: undefined }, { ...body, date: "2024-08-02", key: undefined }].map(({ key, ...rest }) => { void key; return rest; }) });
  const partial = await reviewAiMeasurementOperation(db, userId, bodyOperation.id, { kind: "confirm", revision: bodyOperation.revision, itemIds: [bodyOperation.items[0].id] });
  let review = await loadRecordReview(db, userId, partial.id);
  assert.equal((await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.userId, userId))).length, 0);
  review = await reviewRecordOperation(db, userId, partial.id, {kind:"check",revision:review.revision,keys:[partial.items[1].id]});
  assert.equal((await loadRecordReview(db,userId,partial.id)).id,review.id);
  review = await reviewRecordOperation(db, userId, partial.id, { kind: "confirm", revision: review.revision }); assert.equal(review.status, "confirmed");
  assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.userId, userId))).length, 2);
  const legacyMeal = await submitMealOperation(db, { userId, origin: "ai", identity }, { operationId: randomUUID(), actions: [{ ...meal, key: undefined }].map(({ key, ...rest }) => { void key; return rest; }) });
  review = await loadRecordReview(db, userId, legacyMeal.id, "meal");
  review = await reviewRecordOperation(db, userId, legacyMeal.id, { kind: "check", revision: review.revision, keys: [review.rows[0].key] }, "meal");
  assert.equal((await readMealSnapshot(db, userId)).meals.length, 0);
  await reviewRecordOperation(db, userId, legacyMeal.id, { kind: "confirm", revision: review.revision }, "meal");
  assert.equal((await readMealSnapshot(db, userId)).meals.length, 1);
  const pending = await submitAiMeasurementOperation(db, identity, {kind:"batch",operationId:randomUUID(),items:[{kind:"save_record",date:"2024-08-03",period:"evening",weightKg:"71",deviceLabel:"虚构秤"},{kind:"save_record",date:"2024-08-04",period:"evening",weightKg:"72",deviceLabel:"虚构秤"}]});
  await reviewAiMeasurementOperation(db,userId,pending.id,{kind:"confirm",revision:pending.revision,itemIds:[pending.items[0].id]});
  const cancelled = await reviewRecordOperation(db,userId,pending.id,{kind:"cancel",revision:1});
  assert.equal(cancelled.status,"cancelled");assert.equal(cancelled.saved,1);assert.equal(cancelled.rows.filter(row=>row.persisted).length,1);
});

test("独立修改子审核后父批次拒绝旧确认，刷新后方可保存", async () => {
  const { userId, identity } = await owner(); let operation: RecordReviewView = await submitRecordOperation(db, identity, input([meal]));
  const [row] = await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.id, operation.id));
  await reviseMealOperation(db, userId, row.mealOperationId!, operation.mealOperation!.revision);
  await reject(reviewRecordOperation(db, userId, operation.id, { kind: "confirm", revision: operation.revision }), "review_changed");
  operation = await reviewRecordOperation(db, userId, operation.id, { kind: "refresh", revision: operation.revision });
  await reviewRecordOperation(db, userId, operation.id, { kind: "confirm", revision: operation.revision });
});

test("混合预览过期时整体回滚，刷新后可保存；全重复身体记录无需再次确认", async () => {
  const { userId, identity } = await owner(); let operation: RecordReviewView = await submitRecordOperation(db, identity, input([body, meal]));
  const [row] = await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.id, operation.id));
  await db.update(schema.mealOperation).set({ expiresAt: new Date(0) }).where(eq(schema.mealOperation.id, row.mealOperationId!));
  await reject(reviewRecordOperation(db, userId, operation.id, { kind: "confirm", revision: operation.revision }), "expired");
  assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.userId, userId))).length, 0);
  operation = await reviewRecordOperation(db, userId, operation.id, { kind: "refresh", revision: operation.revision });
  await reviewRecordOperation(db, userId, operation.id, { kind: "confirm", revision: operation.revision });
  const duplicate = await submitRecordOperation(db, identity, input([body])); assert.equal(duplicate.status, "completed"); assert.equal(duplicate.canConfirm, false);
});

test("未知批内食材引用明确阻止保存，可取消错误餐次独立入库", async () => {
  const { userId, identity } = await owner();
  let operation: RecordReviewView = await submitRecordOperation(db, identity, input([food, { ...meal, items: [{ kind: "food", name: food.name, quantity: "50", unit: "g", foodRef: "unknown", sourceKind: "estimated" }] }]));
  assert.equal(operation.canConfirm, false); assert.ok(operation.needsUserInput.some(issue => issue.key === "meal"));
  operation = await reviewRecordOperation(db, userId, operation.id, { kind: "exclude", revision: operation.revision, keys: [meal.key] });
  await reviewRecordOperation(db, userId, operation.id, { kind: "confirm", revision: operation.revision });
  const snapshot = await readMealSnapshot(db, userId); assert.equal(snapshot.foods.length, 1); assert.equal(snapshot.meals.length, 0);
});


test("重复餐次对照只返回本账号已有事实，另一次进食仍须明确选择", async () => {
  const first = await owner(), other = await owner();
  let saved: RecordReviewView = await submitRecordOperation(db, first.identity, input([meal]));
  saved = await reviewRecordOperation(db, first.userId, saved.id, {kind:"confirm",revision:saved.revision});
  assert.equal(saved.status,"confirmed");
  const original = (await readMealSnapshot(db, first.userId)).meals[0];
  let repeated: RecordReviewView = await submitRecordOperation(db, first.identity, input([meal]));
  assert.match(repeated.rows[0].meal!.error!, /相同/);
  assert.deepEqual(repeated.rows[0].duplicateMeals?.map(row=>[row.id,row.date,row.items[0].name,Number(row.totals.values.caloriesKcal)]), [[original.id,meal.date,"虚构食品",200]]);
  assert.equal((await readMealSnapshot(db, first.userId)).meals.length,1);
  const otherPreview = await submitRecordOperation(db, other.identity, input([meal]));
  assert.equal(otherPreview.rows[0].duplicateMeals,undefined);
  await reject(getRecordOperation(db,other.identity,repeated.id),"not_found");
  const repeatedAction = repeated.rows[0].action;
  assert.equal(repeatedAction.kind,"save_meal");
  if (repeatedAction.kind !== "save_meal") throw new Error("虚构餐次类型不符");
  repeated = await reviewRecordOperation(db, first.userId, repeated.id, {kind:"update",key:"meal",revision:repeated.revision,action:{...repeatedAction,allowDuplicate:true}});
  assert.equal(repeated.rows[0].meal!.error,undefined);
  assert.equal((await readMealSnapshot(db, first.userId)).meals.length,1,"更新预览不写入餐次");
  await reviewRecordOperation(db, first.userId, repeated.id, {kind:"confirm",revision:repeated.revision});
  assert.equal((await readMealSnapshot(db, first.userId)).meals.length,2);
});

test("最近提交摘要区分业务日期与提交时间、取消项和过期，保持账号隔离", async () => {
  const first = await owner(), other = await owner();
  let op: RecordReviewView = await submitRecordOperation(db, first.identity, input([meal,{key:"burn",kind:"save_energy_day",date:"2024-08-02",entryMode:"total",totalKcal:"2500"}]));
  let rows = await listRecordOperations(db, first.userId);
  assert.deepEqual(rows[0].dates,["2024-08-01","2024-08-02"]);
  assert.deepEqual(rows[0].types,["摄入","消耗"]);
  assert.match(rows[0].summary,/摄入1餐、消耗1项/);
  assert.equal(rows[0].pendingCount,2);
  assert.equal(rows[0].expired,false);
  assert.notEqual(rows[0].createdAt.slice(0,10),"2024-08-01");
  assert.equal((await listRecordOperations(db,other.userId)).length,0);
  await db.update(schema.energyOperation).set({expiresAt:new Date("2020-01-01T00:00:00Z")}).where(eq(schema.energyOperation.id,op.energyOperation!.id));
  rows = await listRecordOperations(db,first.userId);
  assert.equal(rows[0].expired,true);
  assert.equal(rows[0].status,"pending","展示过期不篡改批次状态");
  op = await reviewRecordOperation(db,first.userId,op.id,{kind:"exclude",keys:["burn"],revision:op.revision});
  rows = await listRecordOperations(db,first.userId);
  assert.deepEqual(rows[0].dates,["2024-08-01"]);
  assert.equal(rows[0].excludedCount,1);
  assert.equal(rows[0].pendingCount,1);
  assert.equal(rows[0].expired,false,"已排除项目不决定剩余批次的有效期");
  await reviewRecordOperation(db,first.userId,op.id,{kind:"confirm",revision:op.revision});
  rows = await listRecordOperations(db,first.userId);
  assert.equal(rows[0].status,"confirmed");
  assert.equal(rows[0].expired,false);
  assert.equal(rows[0].pendingCount,0);
});

test("AI新增修改允许；整条删除恢复、混合批量及旧待确认均拒绝，网页手动可继续",async()=>{
 const {userId,identity}=await owner();
 for(const kind of ["delete_meal","restore_meal","delete_food","restore_food","delete_activity","restore_activity","delete_energy_day","restore_energy_day","delete_energy_profile","restore_energy_profile"]) {
  const action={kind,id:randomUUID(),version:1};
  await reject(submitRecordOperation(db,identity,input([{key:"bad",...action},meal])),"ai_action_not_allowed");
 }
 assert.equal((await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.userId,userId))).length,0);
 const op=await submitRecordOperation(db,identity,input([meal]));
 await reviewRecordOperation(db,userId,op.id,{kind:"confirm",revision:op.revision});
 const record=(await readMealSnapshot(db,userId)).meals[0];
 const action={kind:"delete_meal" as const,id:record.id,version:record.version};
 await reject(submitMealOperation(db,{userId,origin:"ai",identity},{operationId:randomUUID(),actions:[action]}),"ai_action_not_allowed");
 // 模拟规则上线前已存在且拥有合法凭据的删除申请。
 const old=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[action]});
 await db.update(schema.mealOperation).set({origin:"ai",tokenId:identity.tokenId}).where(eq(schema.mealOperation.id,old.id));
 await reject(decideMealOperation(db,userId,old.id,old.revision,"confirm"),"ai_action_not_allowed");
 assert.equal((await readMealSnapshot(db,userId)).meals[0].deletedAt,null);
 assert.equal((await decideMealOperation(db,userId,old.id,old.revision,"cancel")).status,"cancelled");
 const manual=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[action]});
 await decideMealOperation(db,userId,manual.id,manual.revision,"confirm");
 assert.ok((await readMealSnapshot(db,userId)).meals[0].deletedAt);
});

test("照片未齐和旧照片核对标识不阻止文字保存；不自动另建食材库",async()=>{
 const {userId,identity}=await owner();
 const op=await submitRecordOperation(db,identity,input([{...meal,expectedImageCount:2,photoReview:{dateConfirmed:false,mealTypeConfirmed:false,identityConfirmed:false,amountConfirmed:false,cookingConfirmed:false,questions:["未知做法保留估算"]}}]));
 assert.equal(op.canConfirm,true);assert.deepEqual(op.needsUserInput,[]);assert.equal(op.rows.length,1);
 await reviewRecordOperation(db,userId,op.id,{kind:"confirm",revision:op.revision});
 const snapshot=await readMealSnapshot(db,userId);assert.equal(snapshot.meals.length,1);assert.equal(snapshot.foods.length,0);
});
test("按运动累计的消耗编辑拿到同一服务端预览内运动，不把400误作0",async()=>{
 const {userId,identity}=await owner();
 const op=await submitRecordOperation(db,identity,input([{key:"energy",kind:"save_energy_day",date:"2024-08-01",entryMode:"components",activityMode:"activities",restingKcal:"1800"},{key:"run",kind:"save_activity",date:"2024-08-01",name:"虚构跑步",caloriesKcal:"400"}]));
 assert.equal(op.energySnapshot?.activities[0].caloriesKcal,"400");
 assert.equal(op.energySnapshot?.days[0].restingKcal,"1800");
 assert.equal((await readMealSnapshot(db,userId)).meals.length,0);
});

test("先录运动再提交总数，会列出独立包含核对项；取消不删事实，可一次选择全部",async()=>{
 const {userId,identity}=await owner();
 const op:RecordReviewView=await submitRecordOperation(db,identity,input([{key:"run",kind:"save_activity",date:"2024-08-01",name:"虚构先录运动",caloriesKcal:"300"}]));
 await reviewRecordOperation(db,userId,op.id,{kind:"confirm",revision:op.revision});
 let aggregate:RecordReviewView=await submitRecordOperation(db,identity,input([{key:"total",kind:"save_energy_day",date:"2024-08-01",entryMode:"total",totalKcal:"600"}]));
 assert.equal(aggregate.rows.length,2);assert.equal(aggregate.rows.filter(row=>row.inclusionReview).length,1);assert.equal(aggregate.canConfirm,false);
 const activity=aggregate.rows.find(row=>row.action.kind==="save_activity")!;
 aggregate=await reviewRecordOperation(db,userId,aggregate.id,{kind:"exclude",revision:aggregate.revision,keys:[activity.key]});assert.equal(aggregate.canConfirm,false);
 aggregate=await reviewRecordOperation(db,userId,aggregate.id,{kind:"restore",revision:aggregate.revision,keys:[activity.key]});
 aggregate=await reviewRecordOperation(db,userId,aggregate.id,{kind:"energy_inclusion",revision:aggregate.revision,keys:[activity.key],inclusion:"additional"});assert.equal(aggregate.canConfirm,true);
 assert.equal(Number(aggregate.rows.find(row=>row.action.kind==="save_energy_day")!.energy!.day!.totalKcal),900);
 await reviewRecordOperation(db,userId,aggregate.id,{kind:"confirm",revision:aggregate.revision});
 const days=await db.select().from(schema.energyDay).where(eq(schema.energyDay.userId,userId));assert.equal(Number(days[0].totalKcal),600);
});
test("更改待确认总数后增加独立运动核对；每份餐项修改清楚列出移除内容",async()=>{
 const {userId,identity}=await owner();
 let op:RecordReviewView=await submitRecordOperation(db,identity,input([{key:"run",kind:"save_activity",date:"2024-08-01",name:"虚构运动",caloriesKcal:"300"},{key:"total",kind:"save_energy_day",date:"2024-08-01",entryMode:"total",totalKcal:"600"}]));
 const workout=op.rows.find(row=>row.action.kind==="save_activity")!;
 op=await reviewRecordOperation(db,userId,op.id,{kind:"energy_inclusion",revision:op.revision,keys:[workout.key],inclusion:"included"});
 assert.equal(op.canConfirm,true);
 const total=op.rows.find(row=>row.action.kind==="save_energy_day")!;
 assert.equal(total.action.kind,"save_energy_day");if(total.action.kind!=="save_energy_day")throw new Error("虚构总数行缺失");
 op=await reviewRecordOperation(db,userId,op.id,{kind:"update",revision:op.revision,key:total.key,action:{...total.action,kind:"save_energy_day",date:"2024-08-01",entryMode:"total",totalKcal:"700"}});
 // 修改过的包含选择必须再次检查，不根据大小推断。
 assert.equal(op.energySnapshot?.days[0].totalKcal,"700");assert.equal(op.canConfirm,false);
 const first:RecordReviewView=await submitRecordOperation(db,identity,input([{...meal,items:[...meal.items,{kind:"food",name:"虚构被移除食物",sourceKind:"estimated",nutrition}]}]));
 await reviewRecordOperation(db,userId,first.id,{kind:"confirm",revision:first.revision});
 const saved=(await readMealSnapshot(db,userId)).meals[0];
 const changed=await submitRecordOperation(db,identity,input([{...meal,id:saved.id,version:saved.version,items:[{kind:"food",originalItemId:saved.items[0].id,name:saved.items[0].name,quantity:"1.5",unit:"份",nutritionBasis:"per_portion",perPortionNutrition:nutrition,sourceKind:"estimated"}]}]));
 assert.equal(changed.rows[0].meal?.changes?.removed[0].name,"虚构被移除食物");
 assert.equal(Number(changed.rows[0].meal?.meal?.totals.values.caloriesKcal),300);
});

test("AI消耗确认按整批投影返回每天读数，运动单独修改也包含当天其他运动", async () => {
  const { userId, identity } = await owner();
  let initial = await submitRecordOperation(db, identity, input([
    { key: "exercise", kind: "save_activity", date: "2024-10-30", name: "虚构羽毛球", calorieMode: "components", exerciseActiveKcal: "801", exerciseRestingKcal: "145", sourceSystem: "虚构手表" },
  ]));
  await reviewRecordOperation(db, userId, initial.id, { kind: "confirm", revision: initial.revision });
  let review: RecordReviewView = await submitRecordOperation(db, identity, input([{ key: "day", kind: "save_energy_day", date: "2024-10-30", restingKcal: "2058", activeKcal: "1027" }]));
  const exercise = review.rows.find(row => row.inclusionReview)!;
  assert.ok(exercise);
  assert.equal(exercise.energy?.coverageQuestions?.length, 1, "日记录提出的包含问题也在对应运动旁可回答");
  review = await reviewRecordOperation(db, userId, review.id, { kind: "energy_inclusion", revision: review.revision, keys: [exercise.key], inclusion: "included" });
  for (const row of review.rows) assert.equal(Number(row.energy!.day!.totalKcal), 3085);
  review = await reviewRecordOperation(db, userId, review.id, { kind: "energy_inclusion", revision: review.revision, keys: [exercise.key], inclusion: "additional" });
  for (const row of review.rows) assert.equal(Number(row.energy!.day!.totalKcal), 3886);
  review = await reviewRecordOperation(db, userId, review.id, { kind: "energy_inclusion", revision: review.revision, keys: [exercise.key], inclusion: "included" });
  await reviewRecordOperation(db, userId, review.id, { kind: "confirm", revision: review.revision });
  const savedReview = await loadRecordReview(db, userId, review.id);
  const activity = savedReview.rows.find(row => row.inclusionReview)!.energy!.after!;
  assert.ok("name" in activity);
  const update = await submitRecordOperation(db, identity, input([{ key: "update", kind: "save_activity", id: activity.id, version: activity.version, date: activity.date, name: activity.name, sourceSystem: "虚构新来源" }]));
  assert.equal(update.canConfirm, true);
  assert.ok(update.rows[0].energy?.day);
  assert.equal(Number(update.rows[0].energy!.day!.totalKcal), 3085);
  initial = await submitRecordOperation(db, identity, input([
    { key: "auto", kind: "save_energy_day", date: "2024-10-29", activityMode: "activities", restingKcal: "2058" },
    { key: "a", kind: "save_activity", date: "2024-10-29", name: "虚构甲", caloriesKcal: "801" },
    { key: "b", kind: "save_activity", date: "2024-10-29", name: "虚构乙", caloriesKcal: "100" },
  ]));
  for (const row of initial.rows) assert.equal(Number(row.energy!.day!.totalKcal), 2959);
  await reviewRecordOperation(db, userId, initial.id, { kind: "confirm", revision: initial.revision });
  const saved = await loadRecordReview(db, userId, initial.id);
  const existing = saved.rows.find(row => row.key === "a")!.energy!.after!;
  assert.ok("name" in existing);
  const onlyActivity = await submitRecordOperation(db, identity, input([{ key: "one", kind: "save_activity", id: existing.id, version: existing.version, date: existing.date, name: existing.name, caloriesKcal: "820" }]));
  assert.equal(onlyActivity.canConfirm, true);
  assert.equal(Number(onlyActivity.rows[0].energy!.day!.totalKcal), 2978);
});

test("旧自动运动核对预览阻止直接保存，刷新保留原分项并重新选择", async () => {
  const { userId, identity } = await owner();
  const seed = await submitRecordOperation(db, identity, input([{ key: "sport", kind: "save_activity", date: "2024-10-30", name: "虚构旧核对", calorieMode: "components", exerciseActiveKcal: "801.1234", exerciseRestingKcal: "145" }]));
  await reviewRecordOperation(db, userId, seed.id, { kind: "confirm", revision: seed.revision });
  const pending = await submitRecordOperation(db, identity, input([{ key: "day", kind: "save_energy_day", date: "2024-10-30", restingKcal: "2058", activeKcal: "1027" }]));
  const [stored] = await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.id, pending.id));
  const draft = structuredClone(stored.draft);
  const target = draft.find(item => item.inclusionReview)!;
  const before = pending.rows.find(row => row.inclusionReview)!.energy!.before!;
  assert.ok("name" in before);
  const oldAction = { kind: "save_activity" as const, id: before.id, version: before.version, date: before.date, name: before.name, caloriesKcal: before.caloriesKcal, durationMinutes: before.durationMinutes, completed: before.completed };
  target.action = { ...oldAction, inclusion: "additional" };
  target.originalInput = oldAction;
  await db.update(schema.recordOperation).set({ draft }).where(eq(schema.recordOperation.id, pending.id));
  const old = await loadRecordReview(db, userId, pending.id);
  assert.equal(old.canConfirm, false);
  assert.match(old.rows.find(row => row.inclusionReview)!.energy!.error!, /需要刷新预览/);
  let refreshed = await reviewRecordOperation(db, userId, pending.id, { kind: "refresh", revision: old.revision });
  const sport = refreshed.rows.find(row => row.inclusionReview)!;
  assert.equal(sport.action.kind, "save_activity");
  assert.ok(sport.energy?.after && "name" in sport.energy.after);
  assert.equal(sport.energy.after.calorieMode, "components");
  assert.equal(sport.energy.after.exerciseActiveKcal, "801.1234");
  assert.equal(refreshed.canConfirm, false, "刷新后不能沿用旧的包含选择");
  refreshed = await reviewRecordOperation(db, userId, pending.id, { kind: "energy_inclusion", revision: refreshed.revision, keys: [sport.key], inclusion: "included" });
  assert.equal(refreshed.canConfirm, true);
  await reviewRecordOperation(db, userId, pending.id, { kind: "confirm", revision: refreshed.revision });
  const [saved] = await db.select().from(schema.activity).where(eq(schema.activity.userId, userId));
  assert.equal(saved.calorieMode, "components");
  assert.equal(saved.exerciseActiveKcal, "801.1234");
  const [request] = await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.id, pending.id));
  assert.deepEqual(request.payload, stored.payload, "原始AI请求不可改写");
});
