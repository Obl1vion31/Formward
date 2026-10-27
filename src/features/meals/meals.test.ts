import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createAiToken, authenticateAi, revokeAiToken } from "../auth/ai-tokens";
import { nutritionFor, sumNutrition, dailyTotals, type FoodDraft, type MealAction, type Nutrition } from "./model";
import { submitMealOperation, decideMealOperation, reviseMealOperation, readMealSnapshot, getMealOperation, searchFoods } from "./records";
import { previewMealTsv, stageMealInitialization } from "../imports/meals";
import { previewFoodMaintenance, applyFoodMaintenance } from "./food-maintenance";
import { previewMealTextCorrection, applyMealTextCorrection } from "./text-maintenance";
import { queryMeals, queryFoods } from "./ai-api";
import { foodLibraryRules, foodDescriptionProblem } from "./food-description";
const pg = new PGlite(), db = drizzle(pg, { schema });
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
const n = (k: string | null = "150", p: string | null = "20", c: string | null = "3", f: string | null = "7"): Nutrition => ({ caloriesKcal: k, proteinG: p, carbsG: c, fatG: f });
const product = (patch: Partial<FoodDraft> = {}): FoodDraft => ({ name: "虚构鸡肉", brand: "虚构品牌", preparation: "熟制90g", baseQuantity: "1", unit: "包", nutrition: n("110", "21", "2", "3"), sourceKind: "label", basis: "虚构包装转录，每包营养", ...patch });
const lunch = (patch: Partial<Extract<MealAction, { kind: "save_meal" }>> = {}): MealAction => ({ kind: "save_meal", date: "2024-08-01", mealType: "午餐", items: [{ kind: "misc", name: "杂", quantity: "1", unit: "份", nutrition: n(), sourceKind: "estimated", basis: "虚构照片估算剩余食物" }], ...patch });
async function owner() { const userId = randomUUID(); await db.insert(schema.user).values({ id: userId, name: "虚构饮食用户", email: `${userId}@example.test` }); return userId; }
async function save(userId: string, actions: MealAction[]) { const op = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions }); assert.equal(op.canConfirm, true, op.rows.map(r => r.error).join(";")); await decideMealOperation(db, userId, op.id, op.revision, "confirm"); return op; }
const reject = (work: Promise<unknown>, code: string) => assert.rejects(work, e => e instanceof Error && "code" in e && e.code === code);

test("食材说明保留分项分析，个人餐次与泛化提醒在预览前拒绝，可用原标识纠正文案", async () => {
  const userId=await owner(),operationId=randomUUID();
  const analysis="组成：虚构熟面250g、酱100g、肉120g。\n计算：采用虚构参考密度分项换算并求和，整份约900kcal；肉类配比未知。";
  for(const basis of ["用户2024-08-01午餐吃过该面","与早前用户深夜牛排保持相似基准","熟重不可直接套用，必须调整","本次实际摄入半份"]){
    await reject(submitMealOperation(db,{userId,origin:"manual"},{operationId,actions:[{kind:"save_food",...product({basis})}]}),"food_description");
  }
  await reject(submitMealOperation(db,{userId,origin:"manual"},{operationId,actions:[lunch({items:[{kind:"food",name:"虚构面",quantity:"1",unit:"包",sourceKind:"estimated",foodDraft:product({basis:"用户要求加入食材库"})}]})]}),"food_description");
  assert.equal((await db.select().from(schema.mealOperation).where(eq(schema.mealOperation.userId,userId))).length,0);
  const op=await submitMealOperation(db,{userId,origin:"manual"},{operationId,actions:[{kind:"save_food",...product({basis:analysis})}]});assert.equal(op.canConfirm,true);
  await decideMealOperation(db,userId,op.id,op.revision,"confirm");assert.equal((await searchFoods(db,userId))[0].basis,analysis);
  await save(userId,[lunch({notes:"用户今天吃了半份",items:[{kind:"food",name:"虚构自由记录",sourceKind:"estimated",basis:"用户接受本次分量估算",nutrition:n()}]})]);
  assert.equal((await readMealSnapshot(db,userId)).meals[0].notes,"用户今天吃了半份");
});

test("食材查询在实时结果附当前说明规则，基础来源无泛化提醒", async () => {
  const userId=await owner();await save(userId,[{kind:"save_food",...product()}]);
  const result=await queryFoods(db,userId);assert.equal(result.foodLibraryRules,foodLibraryRules);assert.equal(result.foods.length,1);assert.equal(result.presets.length,0);
  assert.ok(result.presets.every(food=>!foodDescriptionProblem(food)));
  assert.deepEqual((await queryFoods(db,await owner())).foods,[]);
});

test("旧预览确认也检查食材说明，既有完成请求仍可幂等重试", async () => {
  const userId=await owner(),raw={operationId:randomUUID(),actions:[{kind:"save_food" as const,...product()}]};
  const op=await submitMealOperation(db,{userId,origin:"manual"},raw);
  const legacy={...raw,actions:[{...raw.actions[0],basis:"用户当天吃过该食物"}]};
  await db.update(schema.mealOperation).set({draft:legacy}).where(eq(schema.mealOperation.id,op.id));
  await reject(decideMealOperation(db,userId,op.id,op.revision,"confirm"),"food_description");assert.equal((await readMealSnapshot(db,userId)).foods.length,0);
  const revised=await reviseMealOperation(db,userId,op.id,op.revision,raw.actions);await decideMealOperation(db,userId,op.id,revised.revision,"confirm");
  await db.update(schema.mealOperation).set({draft:legacy}).where(eq(schema.mealOperation.id,op.id));
  assert.equal((await submitMealOperation(db,{userId,origin:"manual"},raw)).status,"confirmed");
  assert.equal((await decideMealOperation(db,userId,op.id,revised.revision,"confirm")).status,"confirmed");
});

test("仅修正食材库说明时完整保留历史餐项及个人餐次语境", async () => {
  const userId=await owner();await save(userId,[{kind:"save_food",...product()}]);
  const f=(await searchFoods(db,userId))[0];
  await save(userId,[lunch({notes:"用户当天实际食用半包",items:[{kind:"food",name:f.name,foodId:f.id,foodVersion:f.version,quantity:"0.5",unit:f.unit,sourceKind:f.sourceKind}]})]);
  const before=await readMealSnapshot(db,userId),request={operationId:randomUUID(),updateMealDescriptions:false,changes:[{id:f.id,version:f.version,preparation:f.preparation!,basis:"虚构标签来源与实际规格"}]};
  const preview=await previewFoodMaintenance(db,userId,request);assert.equal(preview.affectedMeals,0);
  await applyFoodMaintenance(db,userId,request,preview.digest);const after=await readMealSnapshot(db,userId);
  assert.deepEqual(after.meals,before.meals);assert.deepEqual(after.foods[0].nutrition,before.foods[0].nutrition);assert.equal(after.foods[0].basis,"虚构标签来源与实际规格");
});

test("每份和每100g换算支持小数，显式热量独立于三大营养素", () => {
  assert.deepEqual(nutritionFor(product(), "2"), n("220.0000", "42.0000", "4.0000", "6.0000"));
  assert.equal(nutritionFor(product({ baseQuantity: "100", unit: "g", nutrition: n("95") }), "135.5").caloriesKcal, "128.7250");
  assert.equal(nutritionFor(product({ nutrition: n("84") }), "1").caloriesKcal, "84.0000");
});
test("空值、真实零值和部分合计分别处理", () => {
  const sum = sumNutrition([n("0", "0", null, "0"), n(null, "4", "8", "0")]);
  assert.equal(sum.values.caloriesKcal, "0.0000"); assert.equal(sum.incomplete.caloriesKcal, true); assert.equal(sum.values.proteinG, "4.0000"); assert.equal(sum.incomplete.proteinG, false); assert.equal(sum.incomplete.carbsG, true);
  assert.equal(sumNutrition([]).values.caloriesKcal, null);
});
test("具体食材两包加杂只计剩余，单餐与每天合计一致", async () => {
  const userId = await owner(); await save(userId, [{ kind: "save_food", ...product() }]);
  const f = (await searchFoods(db, userId))[0];
  await save(userId, [lunch({ items: [{ kind: "food", name: f.name, foodId: f.id, foodVersion: f.version, quantity: "2", unit: "包", sourceKind: "label" }, { kind: "misc", name: "杂", nutrition: n("200", "8", "30", "5"), sourceKind: "estimated" }] })]);
  const state = await readMealSnapshot(db, userId), days = dailyTotals(state.meals);
  assert.equal(state.meals[0].totals.values.caloriesKcal, "420.0000"); assert.equal(days[0].totals.values.caloriesKcal, "420.0000"); assert.equal(state.meals[0].totals.values.proteinG, "50.0000");
});
test("整餐估算不能叠加其他食物，杂不可重复，日期单位无效进入待修正预览", async () => {
  const userId = await owner();
  for (const action of [lunch({ items: [{ kind: "whole", name: "整餐", nutrition: n(), sourceKind: "estimated" }, { kind: "food", name: "鸡肉", nutrition: n(), sourceKind: "estimated" }] }), lunch({ items: [{ kind: "misc", name: "杂", nutrition: n(), sourceKind: "estimated" }, { kind: "misc", name: "杂2", nutrition: n(), sourceKind: "estimated" }] }), lunch({ date: "2024-02-30" })]) {
    const op = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [action] }); assert.equal(op.canConfirm, false); await reject(decideMealOperation(db, userId, op.id, op.revision, "confirm"), "review_required");
  }
  assert.equal((await readMealSnapshot(db, userId)).meals.length, 0);
});
test("标签需要依据，负数与额外字段无效；未知可留空", async () => {
  const userId = await owner();
  const op = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [{ kind: "save_food", ...product({ basis: null }) }] }); assert.equal(op.canConfirm, false);
  await reject(submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [lunch({ items: [{ kind: "misc", name: "杂", nutrition: n("-1"), sourceKind: "estimated" }] })] }), "invalid_input");
  await reject(submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), userId: "fake", actions: [lunch()] }), "invalid_input");
  await save(userId, [lunch({ items: [{ kind: "misc", name: "杂", sourceKind: "unknown" }] })]); assert.equal((await readMealSnapshot(db, userId)).meals[0].totals.values.caloriesKcal, null);
});
test("餐次允许同日期同餐次不同内容；相同内容提示并可确认另一餐", async () => {
  const userId = await owner(); await save(userId, [lunch()]); await save(userId, [lunch({ notes: "另外一次独立进食" })]);
  let op = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [lunch()] }); assert.equal(op.canConfirm, false); assert.equal(op.rows[0].duplicateIds.length, 1);
  op = { ...op, ...await reviseMealOperation(db, userId, op.id, op.revision, [lunch({ allowDuplicate: true })]) };
  await decideMealOperation(db, userId, op.id, op.revision, "confirm"); assert.equal((await readMealSnapshot(db, userId)).meals.length, 3);
});
test("请求与确认幂等，不同内容及其他令牌不能复用标识", async () => {
  const userId = await owner(), t = await createAiToken(db, userId, "虚构写令牌", "write"), identity = await authenticateAi(db, `Bearer ${t.rawToken}`), raw = { operationId: randomUUID(), actions: [lunch()] };
  const op = await submitMealOperation(db, { userId, origin: "ai", identity }, raw);
  assert.equal((await submitMealOperation(db, { userId, origin: "ai", identity }, raw)).id, op.id);
  await reject(submitMealOperation(db, { userId, origin: "ai", identity }, { ...raw, actions: [lunch({ mealType: "晚餐" })] }), "request_conflict");
  const t2 = await createAiToken(db, userId, "另一个令牌", "write"), otherIdentity = await authenticateAi(db, `Bearer ${t2.rawToken}`);
  await reject(submitMealOperation(db, { userId, origin: "ai", identity: otherIdentity }, raw), "request_conflict");
  await decideMealOperation(db, userId, op.id, op.revision, "confirm"); await decideMealOperation(db, userId, op.id, op.revision, "confirm");
  assert.equal((await readMealSnapshot(db, userId)).meals.length, 1); assert.equal((await db.select().from(schema.mealEvent).where(eq(schema.mealEvent.userId, userId))).length, 1);
});
test("跨账号餐次、食材、预览不可访问或写入，组合外键也拒绝跨账号引用", async () => {
  const userId = await owner(), otherId = await owner(); await save(userId, [{ kind: "save_food", ...product() }, lunch()]);
  const state = await readMealSnapshot(db, userId), f = state.foods[0], m = state.meals[0];
  for (const action of [lunch({ id: m.id, version: m.version }), lunch({ items: [{ kind: "food", name: f.name, foodId: f.id, foodVersion: f.version, quantity: "1", unit: "包", sourceKind: "label" }] })]) { const op = await submitMealOperation(db, { userId: otherId, origin: "manual" }, { operationId: randomUUID(), actions: [action] }); assert.equal(op.canConfirm, false); }
  const op = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [lunch({ notes: "另一餐" })] }); await reject(getMealOperation(db, otherId, op.id), "not_found");
  assert.deepEqual(await searchFoods(db, otherId), []); assert.deepEqual((await queryMeals(db, otherId, new URLSearchParams())).meals, []);
  await assert.rejects(db.insert(schema.mealItem).values({ id: randomUUID(), userId: otherId, mealId: m.id, position: 0, kind: "food", name: "跨账号", sourceKind: "unknown" }));
});
test("只读与撤销阻止AI写入和旧预览确认", async () => {
  const userId = await owner(), read = await createAiToken(db, userId, "只读", "read"), readonly = await authenticateAi(db, `Bearer ${read.rawToken}`);
  await reject(submitMealOperation(db, { userId, origin: "ai", identity: readonly }, { operationId: randomUUID(), actions: [lunch()] }), "read_only");
  const t = await createAiToken(db, userId, "写令牌", "write"), identity = await authenticateAi(db, `Bearer ${t.rawToken}`), op = await submitMealOperation(db, { userId, origin: "ai", identity }, { operationId: randomUUID(), actions: [lunch()] });
  await revokeAiToken(db, userId, t.token.id); await reject(decideMealOperation(db, userId, op.id, op.revision, "confirm"), "invalid_token"); assert.equal((await readMealSnapshot(db, userId)).meals.length, 0);
});
test("审核过期与快照变化需刷新，审核版本冲突不覆盖草稿", async () => {
  const userId = await owner(), t = await createAiToken(db, userId, "写令牌", "write"), identity = await authenticateAi(db, `Bearer ${t.rawToken}`);
  let op = await submitMealOperation(db, { userId, origin: "ai", identity }, { operationId: randomUUID(), actions: [lunch()] });
  await db.update(schema.mealOperation).set({ expiresAt: new Date(0) }).where(eq(schema.mealOperation.id, op.id)); await reject(decideMealOperation(db, userId, op.id, op.revision, "confirm"), "expired");
  op = { ...op, ...await reviseMealOperation(db, userId, op.id, op.revision) };
  await save(userId, [lunch({ date: "2024-08-02" })]); await reject(decideMealOperation(db, userId, op.id, op.revision, "confirm"), "snapshot_changed");
  op = { ...op, ...await reviseMealOperation(db, userId, op.id, op.revision) }; await reject(reviseMealOperation(db, userId, op.id, op.revision - 1), "version_conflict"); await decideMealOperation(db, userId, op.id, op.revision, "confirm");
});
test("食材版本改变保留历史快照，旧餐改备注或分量仍使用原营养基准", async () => {
  const userId = await owner(); await save(userId, [{ kind: "save_food", ...product() }]); const f = (await searchFoods(db, userId))[0];
  await save(userId, [lunch({ items: [{ kind: "food", name: f.name, foodId: f.id, foodVersion: f.version, quantity: "1", unit: "包", sourceKind: "label" }] })]);
  await save(userId, [{ kind: "save_food", ...product({ id: f.id, version: f.version, nutrition: n("130") }) }]); const m = (await readMealSnapshot(db, userId)).meals[0]; assert.equal(m.totals.values.caloriesKcal, "110.0000");
  await save(userId, [lunch({ id: m.id, version: m.version, notes: "改备注并调整实际食量", items: [{ kind: "food", name: f.name, foodId: f.id, foodVersion: f.version, quantity: "2", unit: "包", sourceKind: "label" }] })]); assert.equal((await readMealSnapshot(db, userId)).meals[0].totals.values.caloriesKcal, "220.0000");
});
test("网页旧草稿可按保存顺序覆盖，删除与恢复改变汇总并保持审计", async () => {
  const userId = await owner(); await save(userId, [lunch()]); const m = (await readMealSnapshot(db, userId)).meals[0];
  await save(userId, [lunch({ id: m.id, version: m.version, notes: "新备注" })]); const stale = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [lunch({ id: m.id, version: m.version })] }); assert.equal(stale.canConfirm, true);
  const current = (await readMealSnapshot(db, userId)).meals[0]; await save(userId, [{ kind: "delete_meal", id: current.id, version: current.version }]); let state = await readMealSnapshot(db, userId); assert.equal(dailyTotals(state.meals).length, 0);
  await save(userId, [{ kind: "restore_meal", id: state.meals[0].id, version: state.meals[0].version }]); state = await readMealSnapshot(db, userId); assert.equal(dailyTotals(state.meals).length, 1); assert.equal(state.meals[0].notes, "新备注");
});
test("同规格食材拒绝重复，停用后可恢复；已有餐的历史引用仍有效", async () => {
  const userId = await owner(); await save(userId, [{ kind: "save_food", ...product() }]); const f = (await searchFoods(db, userId))[0];
  const duplicate = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [{ kind: "save_food", ...product() }] }); assert.equal(duplicate.canConfirm, false);
  await save(userId, [{ kind: "delete_food", id: f.id, version: f.version }]); assert.deepEqual(await searchFoods(db, userId), []); const disabled = (await readMealSnapshot(db, userId)).foods[0]; await save(userId, [{ kind: "restore_food", id: f.id, version: disabled.version }]); assert.equal((await searchFoods(db, userId)).length, 1);
});
test("新食材和餐次同批预览，确认前无事实写入，确认后原始请求与营养快照保留", async () => {
  const userId = await owner(), action = lunch({ items: [{ kind: "food", name: "虚构鸡肉", foodDraft: product(), quantity: "2", unit: "包", sourceKind: "label" }] });
  const op = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [action] }); assert.equal(op.canConfirm, true); assert.deepEqual(await searchFoods(db, userId), []);
  await decideMealOperation(db, userId, op.id, op.revision, "confirm"); const state = await readMealSnapshot(db, userId); assert.equal(state.foods.length, 1); assert.equal(state.meals[0].items[0].foodSnapshot?.id, state.foods[0].id);
  const events = await db.select().from(schema.mealEvent).where(eq(schema.mealEvent.userId, userId)); assert.deepEqual(events.map(e => e.recordType).sort(), ["food", "meal"]);
});
const tsv = "日期\t餐次\t食物 / 餐食\t记录状态\t蛋白质 (g)\t脂肪 (g)\t碳水 (g)\t热量 (kcal)\t备注\n2024-08-01\t午餐\t虚构牛肉加面\t正常记录\t20\t10\t30\t290\t虚构描述\n2024-08-01\t加餐\t虚构果汁\t正常记录\t0\t0\t10\t40\t\n2024-08-01\t加餐\t虚构糕点\t正常记录\t3\t5\t15\t117\t";
test("初始化一行一餐且同餐次多行不合并，食物在备注、原始数值留档", async () => {
  const userId = await owner(), preview = previewMealTsv(tsv, [{ date: "2024-08-01", mealType: "午餐", description: "虚构牛肉加面", caloriesKcal: "310" }]);
  assert.equal(preview.actions.length, 3); assert.equal(preview.decisions.changes.length, 1); assert.equal(preview.originalRows[0]["热量 (kcal)"], "290");
  const op = await stageMealInitialization(db, userId, tsv, "虚构.tsv", [{ date: "2024-08-01", mealType: "午餐", description: "虚构牛肉加面", caloriesKcal: "310" }]);
  assert.equal(op.expiresAt, null); assert.equal((await readMealSnapshot(db, userId)).meals.length, 0); await decideMealOperation(db, userId, op.id, op.revision, "confirm");
  const state = await readMealSnapshot(db, userId); assert.equal(state.meals.length, 3); assert.equal(state.foods.length, 0); assert.ok(state.meals.every(m => m.source === "initialization" && m.items.length === 1 && m.items[0].kind === "whole")); assert.ok(state.meals.some(m => m.notes?.includes("虚构牛肉加面")));
  assert.equal((await stageMealInitialization(db, userId, tsv, "虚构.tsv", [{ date: "2024-08-01", mealType: "午餐", description: "虚构牛肉加面", caloriesKcal: "310" }])).id, op.id);
});
test("取消初始化后可重新生成预览，原批次复用且不会保存或重复正式餐次", async () => {
  const userId = await owner(), first = await stageMealInitialization(db, userId, tsv, "虚构.tsv");
  await decideMealOperation(db, userId, first.id, first.revision, "cancel");
  const next = await stageMealInitialization(db, userId, tsv, "虚构.tsv"); assert.notEqual(next.id, first.id); assert.equal(next.status, "pending");
  assert.equal((await readMealSnapshot(db, userId)).meals.length, 0); assert.equal((await stageMealInitialization(db, userId, tsv, "虚构.tsv")).id, next.id);
});
test("参考热量仅格式差异不报调整，取消后的并发重试只保留一个新预览", async () => {
  const preview = previewMealTsv(tsv, [{ date: "2024-08-01", mealType: "午餐", description: "虚构牛肉加面", caloriesKcal: "290.0" }]); assert.equal(preview.decisions.changes.length, 0);
  const userId = await owner(), first = await stageMealInitialization(db, userId, tsv, "虚构.tsv"); await decideMealOperation(db, userId, first.id, first.revision, "cancel");
  const results = await Promise.all([stageMealInitialization(db, userId, tsv, "虚构.tsv"), stageMealInitialization(db, userId, tsv, "虚构.tsv")]); assert.equal(results[0].id, results[1].id);
});

test("缺图不阻止文字保存，无图审计、审核终态及说明保留",async()=>{
 const userId=await owner(),explanation={amount:{source:"estimate" as const,basis:"虚构份量估100g",uncertainty:"图片份量存在误差"}};
 const op=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[lunch({expectedImageCount:1,items:[{kind:"food",name:"虚构牛排",quantity:"100",unit:"g",sourceKind:"estimated",nutrition:n("120","20","0","4"),reviewExplanation:explanation}]})]});
 assert.equal(op.missingImages,1);
 const saved=await decideMealOperation(db,userId,op.id,op.revision,"confirm",true);assert.equal(saved.status,"confirmed");assert.equal(saved.canConfirm,false);assert.match(saved.result!.message,/文字/);
 assert.deepEqual((await readMealSnapshot(db,userId)).meals[0].items[0].reviewExplanation,explanation);
 const events=await db.select().from(schema.mealEvent).where(eq(schema.mealEvent.userId,userId));assert.equal(events[0].snapshot.confirmedWithoutImages,true);
 const repeated=await decideMealOperation(db,userId,op.id,op.revision,"confirm",true);assert.equal(repeated.revision,saved.revision);assert.equal((await readMealSnapshot(db,userId)).meals.length,1);
});

async function textCorrectionFixture() {
  const userId=await owner();
  await save(userId,[{kind:"save_food",...product({preparation:"虚构鸡肉面（不含饮料）",basis:"虚构照片估算，不含饮料"})}]);
  const f=(await searchFoods(db,userId))[0];
  await save(userId,[lunch({items:[{kind:"food",name:f.name,foodId:f.id,foodVersion:f.version,quantity:"2",unit:f.unit,sourceKind:f.sourceKind}]})]);
  const before=await readMealSnapshot(db,userId),m=before.meals[0];
  const [item]=await db.select().from(schema.mealItem).where(eq(schema.mealItem.mealId,m.id));
  const request={operationId:randomUUID(),foodId:f.id,foodVersion:f.version,preparation:{before:f.preparation!,after:"虚构鸡肉面"},basis:{before:f.basis!,after:"根据虚构照片估算鸡肉和面条"},items:[{id:item.id,mealId:m.id,mealVersion:m.version}]};
  return {userId,before,request,item};
}
test("说明修正只改指定文字与版本，旧请求、旧餐项、营养和份量保持并留AI审计，重试幂等",async()=>{
  const {userId,before,request,item}=await textCorrectionFixture();
  const originals=await db.select().from(schema.mealOperation).where(eq(schema.mealOperation.userId,userId));
  const imageId=randomUUID();
  await db.insert(schema.mealImage).values({id:imageId,userId,pathname:"private/fictional-text-test.png",sha256:"a".repeat(64),mimeType:"image/png",byteSize:68,fileName:"虚构照片.png",source:"manual",createdBy:userId});
  await db.insert(schema.mealImageLink).values({id:randomUUID(),userId,imageId,mealId:before.meals[0].id,position:0});
  const preview=await previewMealTextCorrection(db,userId,request);
  assert.equal((await readMealSnapshot(db,userId)).foods[0].version,1);
  const result=await applyMealTextCorrection(db,userId,request,preview.digest),after=await readMealSnapshot(db,userId);
  assert.equal(result.repeated,false);assert.equal(after.foods[0].preparation,request.preparation.after);
  assert.deepEqual(after.foods[0].nutrition,before.foods[0].nutrition);assert.equal(after.foods[0].baseQuantity,before.foods[0].baseQuantity);
  assert.deepEqual(after.meals[0].items[0].nutrition,before.meals[0].items[0].nutrition);assert.equal(after.meals[0].items[0].quantity,before.meals[0].items[0].quantity);
  assert.equal(after.meals[0].items[0].foodSnapshot?.basis,request.basis.after);assert.equal(after.meals[0].version,2);assert.deepEqual(after.meals[0].imageIds,[imageId]);
  const [old]=await db.select().from(schema.mealItem).where(eq(schema.mealItem.id,item.id));assert.ok(old.deletedAt);assert.equal(old.basis,item.basis);assert.deepEqual(old.foodSnapshot,item.foodSnapshot);
  for(const original of originals)assert.deepEqual(await getMealOperation(db,userId,original.id),original);
  const events=await db.select().from(schema.mealEvent).where(eq(schema.mealEvent.operationId,result.id));assert.equal(events.length,2);assert.ok(events.every(e=>e.actorType==="ai"&&e.actorId==="codex"&&e.confirmedBy===userId));
  assert.deepEqual(await applyMealTextCorrection(db,userId,request,preview.digest),{id:result.id,repeated:true});
  assert.deepEqual(await readMealSnapshot(db,userId),after);
  await reject(applyMealTextCorrection(db,userId,{...request,basis:{...request.basis,after:"其他内容"}},preview.digest),"operation_conflict");
});
test("说明修正拒绝跨账号、过期预览、原文或版本冲突及身份碰撞",async()=>{
  const {userId,before,request}=await textCorrectionFixture(),other=await owner();
  await reject(previewMealTextCorrection(db,other,request),"not_found");
  await reject(previewMealTextCorrection(db,userId,{...request,items:[{...request.items[0],mealVersion:99}]}),"version_conflict");
  await reject(previewMealTextCorrection(db,userId,{...request,basis:{...request.basis,before:"不匹配"}}),"version_conflict");
  await reject(applyMealTextCorrection(db,userId,request,"outdated"),"version_conflict");
  assert.deepEqual(await readMealSnapshot(db,userId),before);
  await save(userId,[{kind:"save_food",...product({preparation:request.preparation.after})}]);
  await reject(previewMealTextCorrection(db,userId,request),"duplicate_food");
});
test("说明修正审计失败时食材、餐项版本和软删除整批回滚",async()=>{
  const {userId,before,request,item}=await textCorrectionFixture(),preview=await previewMealTextCorrection(db,userId,request);
  await pg.exec("CREATE FUNCTION reject_text_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.snapshot->>'origin' = 'text-maintenance' THEN RAISE EXCEPTION 'fictional audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_text_audit BEFORE INSERT ON meal_events FOR EACH ROW EXECUTE FUNCTION reject_text_audit();");
  try {await assert.rejects(applyMealTextCorrection(db,userId,request,preview.digest));}finally{await pg.exec("DROP TRIGGER reject_text_audit ON meal_events; DROP FUNCTION reject_text_audit();");}
  assert.deepEqual(await readMealSnapshot(db,userId),before);
  const [old]=await db.select().from(schema.mealItem).where(eq(schema.mealItem.id,item.id));assert.equal(old.deletedAt,null);
});

test("仅修正明确指定的餐次备注时不改食材、餐项或其营养版本",async()=>{
  const {userId,before,request}=await textCorrectionFixture();
  const edit={...request,preparation:{before:request.preparation.before,after:request.preparation.before},basis:{before:request.basis.before,after:request.basis.before},notes:[{mealId:before.meals[0].id,mealVersion:1,before:null,after:"只描述实际鸡肉和面条"}]};
  const preview=await previewMealTextCorrection(db,userId,edit);assert.equal(preview.foodChanged,false);
  await reject(previewMealTextCorrection(db,userId,{...edit,notes:[{...edit.notes[0],before:"不存在的原文"}]}),"version_conflict");
  await applyMealTextCorrection(db,userId,edit,preview.digest);
  const after=await readMealSnapshot(db,userId);assert.deepEqual(after.foods,before.foods);assert.deepEqual(after.meals[0].items,before.meals[0].items);
  assert.equal(after.meals[0].version,2);assert.equal(after.meals[0].notes,edit.notes[0].after);
});

test("手动合并来源无需长篇说明，旧标签与成分表校验保持，小数勺数准确换算",async()=>{
 const userId=await owner();await save(userId,[{kind:"save_food",...product({name:"虚构乳清",baseQuantity:"1",unit:"勺",sourceKind:"reference",basis:null,nutrition:n("120","24","3","1.5")})}]);
 const f=(await searchFoods(db,userId))[0];assert.equal(nutritionFor(f,"0.5").caloriesKcal,"60.0000");assert.deepEqual(nutritionFor(f,"0.8"),n("96.0000","19.2000","2.4000","1.2000"));
 await save(userId,[lunch({items:[{kind:"food",name:f.name,foodId:f.id,foodVersion:f.version,quantity:"0.8",unit:"勺",sourceKind:"reference"}]})]);
 const old=(await readMealSnapshot(db,userId)).meals[0];assert.equal(old.items[0].unit,"勺");assert.equal(old.totals.values.caloriesKcal,"96.0000");
 const other=await owner();await reject(submitMealOperation(db,{userId:other,origin:"manual"},{operationId:randomUUID(),actions:[lunch({items:[{kind:"food",name:f.name,foodId:f.id,foodVersion:f.version,quantity:"1",unit:"勺",sourceKind:"reference"}]})]}).then(op=>{if(op.rows[0].error)throw Object.assign(new Error(op.rows[0].error),{code:"not_found"});}),"not_found");
 const invalid=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_food",...product({sourceKind:"composition_table",basis:null})}]});assert.equal(invalid.canConfirm,false);
});
test("更新食材当前计量规格不改已有餐次的克数或营养快照",async()=>{
 const userId=await owner();await save(userId,[{kind:"save_food",...product({baseQuantity:"30.4",unit:"g",nutrition:n("120")})}]);const f=(await searchFoods(db,userId))[0];
 await save(userId,[lunch({items:[{kind:"food",name:f.name,foodId:f.id,foodVersion:f.version,quantity:"15.2",unit:"g",sourceKind:f.sourceKind}]})]);
 const original=(await readMealSnapshot(db,userId)).meals[0];await save(userId,[{kind:"save_food",...product({id:f.id,version:f.version,baseQuantity:"1",unit:"勺",nutrition:n("120")})}]);
 const state=await readMealSnapshot(db,userId);assert.deepEqual(state.meals[0],original);assert.equal(state.foods[0].unit,"勺");
 await save(userId,[lunch({id:original.id,version:original.version,items:original.items.map(({id,foodSnapshot,nutrition,...item})=>{void foodSnapshot;void nutrition;return {...item,originalItemId:id};}),notes:"仅修改备注"})]);
 const edited=(await readMealSnapshot(db,userId)).meals[0];assert.equal(edited.items[0].unit,"g");assert.equal(edited.totals.values.caloriesKcal,"60.0000");
});

test("食材维护更新当前单位及说明，历史营养、克数快照和原始操作保留，重试幂等",async()=>{
 const {userId,before}=await textCorrectionFixture(),f=before.foods[0];
 const originalOps=await db.select().from(schema.mealOperation).where(eq(schema.mealOperation.userId,userId));
 const request={operationId:randomUUID(),changes:[{id:f.id,version:f.version,preparation:"虚构简短规格",basis:"虚构标签每勺营养",baseQuantity:"1",unit:"勺"}]};
 const preview=await previewFoodMaintenance(db,userId,request),result=await applyFoodMaintenance(db,userId,request,preview.digest),after=await readMealSnapshot(db,userId);
 assert.equal(after.foods[0].unit,"勺");assert.deepEqual(after.foods[0].nutrition,f.nutrition);
 const item=after.meals[0].items[0],old=before.meals[0].items[0];assert.deepEqual(item.nutrition,old.nutrition);assert.equal(item.quantity,old.quantity);assert.equal(item.unit,old.unit);assert.equal(item.foodSnapshot?.unit,old.foodSnapshot?.unit);assert.equal(item.foodSnapshot?.version,old.foodSnapshot?.version);assert.equal(item.foodSnapshot?.basis,"虚构标签每勺营养");assert.deepEqual(after.meals[0].totals,before.meals[0].totals);
 for(const op of originalOps)assert.deepEqual(await getMealOperation(db,userId,op.id),op);
 assert.deepEqual(await applyFoodMaintenance(db,userId,request,preview.digest),{id:result.id,repeated:true});
 const events=await db.select().from(schema.mealEvent).where(eq(schema.mealEvent.operationId,result.id));assert.equal(events.length,2);assert.ok(events.every(event=>event.actorType==="ai"));
});
test("食材维护拒绝无效单位、旧预览、跨账号，审计失败整批回滚",async()=>{
 const {userId,before}=await textCorrectionFixture(),f=before.foods[0],request={operationId:randomUUID(),changes:[{id:f.id,version:f.version,preparation:"简短",basis:"虚构依据"}]};
 await reject(previewFoodMaintenance(db,await owner(),request),"not_found");
 await reject(applyFoodMaintenance(db,userId,request,"expired"),"version_conflict");
 await assert.rejects(previewFoodMaintenance(db,userId,{...request,changes:[{...request.changes[0],baseQuantity:"0"}]}));
 const preview=await previewFoodMaintenance(db,userId,request);
 await pg.exec("CREATE FUNCTION reject_food_maintenance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.snapshot->>'origin' = 'food-maintenance' THEN RAISE EXCEPTION 'fictional audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_food_maintenance BEFORE INSERT ON meal_events FOR EACH ROW EXECUTE FUNCTION reject_food_maintenance();");
 try{await assert.rejects(applyFoodMaintenance(db,userId,request,preview.digest));}finally{await pg.exec("DROP TRIGGER reject_food_maintenance ON meal_events; DROP FUNCTION reject_food_maintenance();");}
 assert.deepEqual(await readMealSnapshot(db,userId),before);
});

import { permanentlyDeleteMealRecord } from "./recently-deleted";
import { defaultFoodQuantity, suggestedMealType, macroEnergy, operationSchema } from "./model";
test("分类可选且不改变旧请求摘要，省略更新保留原分类", async()=>{
 const userId=await owner(),request={operationId:randomUUID(),actions:[{kind:"save_food" as const,...product({category:"meal"})}]};
 assert.equal("category" in operationSchema.parse({operationId:randomUUID(),actions:[{kind:"save_food",...product()}]}).actions[0],false);
 await save(userId,request.actions);let f=(await searchFoods(db,userId))[0];assert.equal(f.category,"meal");
 const {category,...legacy}=f;void category;const {deletedAt,...draft}=legacy;void deletedAt;
 await save(userId,[{kind:"save_food",...draft}]);f=(await searchFoods(db,userId))[0];assert.equal(f.category,"meal");
 const cross=await submitMealOperation(db,{userId:await owner(),origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_food",...draft,category:"meal"}]});assert.equal(cross.canConfirm,false);
});
test("计数默认一份，重量和未知单位留空；餐次按小时建议",()=>{
 for(const unit of ["份","勺","包","只","scoop"])assert.equal(defaultFoodQuantity(unit),"1");
 for(const unit of ["g","克","kg","ml","毫升","未知"])assert.equal(defaultFoodQuantity(unit),null);
 assert.deepEqual([0,5,10,14,17,22].map(suggestedMealType),["夜宵","早餐","午餐","加餐","晚餐","夜宵"]);
});
test("三色堆叠按4P4C9F分配已记录热量，缺项与零分开",()=>{
 const totals=sumNutrition([n("1000","30","40","10")]),stack=macroEnergy(totals)!;
 assert.equal(stack.length,3);assert.ok(Math.abs(stack.reduce((sum,row)=>sum+row.calories,0)-1000)<1e-8);assert.equal(stack[0].ratio,120/370);
 assert.equal(macroEnergy(sumNutrition([n("1000",null,"40","10")])),null);
 assert.equal(macroEnergy(sumNutrition([n("1000","0","0","0")])),null);
 assert.equal(macroEnergy(sumNutrition([n("0","30","40","10")]))!.reduce((s,r)=>s+r.calories,0),0);
});
test("永久删除食材保留所有版本的营养和原规格，历史编辑可换算且新餐不能引用",async()=>{
 const userId=await owner(),imageId=randomUUID();await db.insert(schema.mealImage).values({id:imageId,userId,pathname:"fictional/purge.png",sha256:randomUUID(),mimeType:"image/png",byteSize:1,fileName:"虚构照片",source:"manual",createdBy:userId});await save(userId,[{kind:"save_food",...product({baseQuantity:"100",unit:"g",imageIds:[imageId]})}]);let f=(await searchFoods(db,userId))[0];
 const linked=()=>lunch({items:[{kind:"food",name:f.name,foodId:f.id,foodVersion:f.version,quantity:"50",unit:"g",sourceKind:f.sourceKind}]});
 await save(userId,[linked(),{...linked(),mealType:"晚餐"} as MealAction]);
 let before=await readMealSnapshot(db,userId);const first=before.meals[0];
 await save(userId,[lunch({id:first.id,version:first.version,notes:"虚构修改",items:first.items.map(i=>({originalItemId:i.id,kind:"food",name:i.name,foodId:i.foodId,foodVersion:i.foodVersion,quantity:i.quantity,unit:i.unit,sourceKind:i.sourceKind}))})]);
 await save(userId,[{kind:"save_food",...product({id:f.id,version:f.version,baseQuantity:"1",unit:"勺",nutrition:n("200")})}]);f=(await searchFoods(db,userId))[0];
 const activeRequest={operationId:randomUUID(),recordType:"food" as const,id:f.id,version:f.version};
 await save(userId,[{kind:"delete_food",id:f.id,version:f.version}]);before=await readMealSnapshot(db,userId);f=before.foods[0];
 const pending=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[lunch({date:"2024-08-02"})]});
 const allBefore=await db.select().from(schema.mealItem).where(eq(schema.mealItem.userId,userId)),request={...activeRequest,version:f.version};
 await reject(permanentlyDeleteMealRecord(db,await owner(),request),"not_found");
 assert.equal((await permanentlyDeleteMealRecord(db,userId,request)).repeated,false);assert.equal((await permanentlyDeleteMealRecord(db,userId,request)).repeated,true);
 await reject(decideMealOperation(db,userId,pending.id,pending.revision,"confirm"),"snapshot_changed");
 const after=await readMealSnapshot(db,userId);assert.equal(after.foods.length,0);assert.equal(after.meals[0].items[0].foodSnapshot?.imageIds?.[0],imageId);assert.equal((await db.select().from(schema.mealImage).where(eq(schema.mealImage.id,imageId))).length,1);
 for(const m of after.meals){const old=before.meals.find(row=>row.id===m.id)!;assert.deepEqual(m.totals,old.totals);assert.equal(m.version,old.version);assert.equal(m.items[0].foodId,undefined);assert.deepEqual(m.items[0].foodSnapshot,old.items[0].foodSnapshot);}
 const allAfter=await db.select().from(schema.mealItem).where(eq(schema.mealItem.userId,userId));assert.deepEqual(allAfter,allBefore.map(item=>({...item,foodId:null})));
 const m=after.meals[0],i=m.items[0];
 await save(userId,[lunch({id:m.id,version:m.version,items:[{originalItemId:i.id,kind:"food",name:i.name,quantity:"25",unit:"g",sourceKind:i.sourceKind}]})]);
 const edited=(await readMealSnapshot(db,userId)).meals.find(row=>row.id===m.id)!;assert.equal(edited.totals.values.caloriesKcal,"27.5000");assert.equal(edited.items[0].foodSnapshot?.unit,"g");assert.equal(edited.items[0].foodId,undefined);
 const wrongItem=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[lunch({date:"2024-08-03",items:[{originalItemId:edited.items[0].id,kind:"food",name:i.name,quantity:"1",unit:"g",sourceKind:"estimated"}]})]});assert.equal(wrongItem.canConfirm,false);
 const invalid=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[linked()]});assert.equal(invalid.canConfirm,false);
 await reject(permanentlyDeleteMealRecord(db,userId,{...request,operationId:randomUUID()}),"not_found");
});
test("永久删除餐次移除所有子项与关联，重复安全、不能恢复",async()=>{
 const userId=await owner();await save(userId,[lunch()]);let m=(await readMealSnapshot(db,userId)).meals[0];await save(userId,[{kind:"delete_meal",id:m.id,version:m.version}]);m=(await readMealSnapshot(db,userId)).meals[0];
 const request={operationId:randomUUID(),recordType:"meal" as const,id:m.id,version:m.version};await reject(permanentlyDeleteMealRecord(db,userId,{...request,version:m.version+1}),"version_conflict");
 await permanentlyDeleteMealRecord(db,userId,request);assert.equal((await readMealSnapshot(db,userId)).meals.length,0);assert.equal((await db.select().from(schema.mealItem).where(eq(schema.mealItem.userId,userId))).length,0);
 assert.equal((await permanentlyDeleteMealRecord(db,userId,request)).repeated,true);const op=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"restore_meal",id:m.id,version:m.version}]});assert.equal(op.canConfirm,false);
 const events=await db.select().from(schema.mealEvent).where(eq(schema.mealEvent.recordId,m.id));assert.ok(events.some(event=>event.snapshot.permanentDeletion===true));
});
test("永久删除拒绝不完整快照并在审计失败时完整回滚",async()=>{
 const userId=await owner();await save(userId,[{kind:"save_food",...product()}]);let f=(await searchFoods(db,userId))[0];await save(userId,[lunch({items:[{kind:"food",name:f.name,foodId:f.id,foodVersion:f.version,quantity:"1",unit:f.unit,sourceKind:f.sourceKind}]})]);await save(userId,[{kind:"delete_food",id:f.id,version:f.version}]);f=(await readMealSnapshot(db,userId)).foods[0];
 const [item]=await db.select().from(schema.mealItem).where(eq(schema.mealItem.userId,userId)),request={operationId:randomUUID(),recordType:"food" as const,id:f.id,version:f.version};
 await db.update(schema.mealItem).set({foodSnapshot:null}).where(eq(schema.mealItem.id,item.id));await reject(permanentlyDeleteMealRecord(db,userId,request),"snapshot_required");await db.update(schema.mealItem).set({foodSnapshot:item.foodSnapshot}).where(eq(schema.mealItem.id,item.id));
 const before=await readMealSnapshot(db,userId);
 await pg.exec("CREATE FUNCTION fail_permanent_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.snapshot->>'permanentDeletion' = 'true' THEN RAISE EXCEPTION 'fictional audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_permanent_event BEFORE INSERT ON meal_events FOR EACH ROW EXECUTE FUNCTION fail_permanent_audit();");
 try{await assert.rejects(permanentlyDeleteMealRecord(db,userId,request));assert.deepEqual(await readMealSnapshot(db,userId),before);assert.equal((await db.select().from(schema.mealOperation).where(eq(schema.mealOperation.operationId,request.operationId))).length,0);}finally{await pg.exec("DROP TRIGGER reject_permanent_event ON meal_events; DROP FUNCTION fail_permanent_audit();");}
});

test("两份人工旧草稿先后保存，后保存生效，保留真实前后版本和历史规格；AI仍阻止过期覆盖",async()=>{
 const userId=await owner();await save(userId,[{kind:"save_food",...product()}]);const f=(await searchFoods(db,userId))[0];
 await save(userId,[lunch({items:[{kind:"food",name:f.name,quantity:"1",unit:f.unit,foodId:f.id,foodVersion:f.version,sourceKind:f.sourceKind}]})]);
 const original=(await readMealSnapshot(db,userId)).meals[0],item=original.items[0];
 const draft=(quantity:string,notes:string):MealAction=>({kind:"save_meal",id:original.id,version:original.version,date:original.date,mealType:original.mealType,notes,items:[{kind:"food",originalItemId:item.id,name:item.name,quantity,unit:item.unit,foodId:item.foodId,foodVersion:item.foodVersion,sourceKind:item.sourceKind}]});
 const a=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[draft("2","先保存")]});
 const b=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[draft("1.5","后保存")]});
 await decideMealOperation(db,userId,a.id,a.revision,"confirm");await decideMealOperation(db,userId,b.id,b.revision,"confirm");
 const after=(await readMealSnapshot(db,userId)).meals[0];assert.equal(after.version,3);assert.equal(after.notes,"后保存");assert.equal(Number(after.totals.values.caloriesKcal),165);
 const events=await db.select().from(schema.mealEvent).where(eq(schema.mealEvent.operationId,b.id));
 assert.equal((events[0].snapshot as {before:{version:number}}).before.version,2);
 const token=await createAiToken(db,userId,"虚构并发AI","write"),identity=await authenticateAi(db,"Bearer "+token.rawToken);
 const stale=await submitMealOperation(db,{userId,origin:"ai",identity},{operationId:randomUUID(),actions:[draft("3","AI旧版本")]});
 assert.equal(stale.canConfirm,false);
 const later=await save(userId,[draft("0.5","旧草稿更晚保存")]);assert.equal(later.canConfirm,true);
 assert.equal(Number((await readMealSnapshot(db,userId)).meals[0].totals.values.caloriesKcal),55);
});

test("网页直接永久删除有效餐次，作废当日确认且重试不重复作废",async()=>{
 const {setMealDayStatus}=await import("./day-status");
 const userId=await owner();await save(userId,[lunch()]);
 const m=(await readMealSnapshot(db,userId)).meals[0],group=dailyTotals([m])[0];
 await setMealDayStatus(db,userId,{operationId:randomUUID(),date:group.day.date,version:group.day.version,contentDigest:group.day.contentDigest,status:"complete"});
 const request={operationId:randomUUID(),recordType:"meal" as const,id:m.id,version:m.version};
 await permanentlyDeleteMealRecord(db,userId,request);
 assert.equal((await readMealSnapshot(db,userId)).meals.length,0);
 const day=(await db.select().from(schema.mealDay).where(eq(schema.mealDay.userId,userId)))[0];assert.equal(day.status,"unconfirmed");
 await permanentlyDeleteMealRecord(db,userId,request);
 assert.deepEqual((await db.select().from(schema.mealDay).where(eq(schema.mealDay.userId,userId)))[0],day);
});
test("永久删除包装食材保留营养、份数和当天已记完，不改餐次版本",async()=>{
 const {setMealDayStatus}=await import("./day-status");const userId=await owner();
 await save(userId,[{kind:"save_food",...product({unit:"g",baseQuantity:"90",servingQuantity:"90",servingUnit:"包"})}]);
 const f=(await searchFoods(db,userId))[0];
 await save(userId,[lunch({items:[{kind:"food",foodId:f.id,foodVersion:f.version,name:f.name,quantity:"0.5",unit:"包",sourceKind:f.sourceKind}]})]);
 const before=await readMealSnapshot(db,userId),g=dailyTotals(before.meals)[0];
 await setMealDayStatus(db,userId,{date:g.day.date,version:g.day.version,contentDigest:g.day.contentDigest,operationId:randomUUID(),status:"complete"});
 await permanentlyDeleteMealRecord(db,userId,{operationId:randomUUID(),recordType:"food",id:f.id,version:f.version});
 const after=await readMealSnapshot(db,userId);assert.equal(after.meals[0].version,before.meals[0].version);assert.deepEqual(after.meals[0].totals,before.meals[0].totals);assert.equal(dailyTotals(after.meals)[0].day.status,"complete");assert.equal(after.meals[0].items[0].quantity,"0.5000");assert.equal(after.meals[0].items[0].unit,"包");
});
test("旧软删除食材保留，新同规格可新增，有效同规格仍阻止恢复",async()=>{
 const userId=await owner();await save(userId,[{kind:"save_food",...product()}]);const f=(await searchFoods(db,userId))[0];
 await save(userId,[{kind:"delete_food",id:f.id,version:f.version}]);
 await save(userId,[{kind:"save_food",...product()}]);
 const foods=(await readMealSnapshot(db,userId)).foods;assert.equal(foods.length,2);assert.equal(foods.filter(f=>!f.deletedAt).length,1);
 const old=foods.find(f=>f.deletedAt)!;const op=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"restore_food",id:old.id,version:old.version}]});assert.equal(op.canConfirm,false);
});

test("网页保存前发现旧版本时拒绝覆盖，明确采用最新版本后才保存；英文餐次统一中文",async()=>{const userId=await owner();await save(userId,[lunch({mealType:" LUNCH "})]);let current=(await readMealSnapshot(db,userId)).meals[0];assert.equal(current.mealType,"午餐");const old={...(lunch() as Extract<MealAction,{kind:"save_meal"}>),id:current.id,version:current.version};await save(userId,[{...old,notes:"手机的新备注"}]);const pending=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[old]});await reject(decideMealOperation(db,userId,pending.id,pending.revision,"confirm",true,{strictManualVersions:true}),"version_conflict");current=(await readMealSnapshot(db,userId)).meals[0];assert.equal(current.notes,"手机的新备注");await save(userId,[{...old,version:current.version,notes:"明确覆盖"}]);assert.equal((await readMealSnapshot(db,userId)).meals[0].notes,"明确覆盖");});
