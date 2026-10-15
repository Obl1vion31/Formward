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
import { queryMeals } from "./ai-api";
const pg = new PGlite(), db = drizzle(pg, { schema });
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
const n = (k: string | null = "150", p: string | null = "20", c: string | null = "3", f: string | null = "7"): Nutrition => ({ caloriesKcal: k, proteinG: p, carbsG: c, fatG: f });
const product = (patch: Partial<FoodDraft> = {}): FoodDraft => ({ name: "虚构鸡肉", brand: "虚构品牌", preparation: "熟制90g", baseQuantity: "1", unit: "包", nutrition: n("110", "21", "2", "3"), sourceKind: "label", basis: "虚构包装转录，每包营养", ...patch });
const lunch = (patch: Partial<Extract<MealAction, { kind: "save_meal" }>> = {}): MealAction => ({ kind: "save_meal", date: "2024-08-01", mealType: "午餐", items: [{ kind: "misc", name: "杂", quantity: "1", unit: "份", nutrition: n(), sourceKind: "estimated", basis: "虚构照片估算剩余食物" }], ...patch });
async function owner() { const userId = randomUUID(); await db.insert(schema.user).values({ id: userId, name: "虚构饮食用户", email: `${userId}@example.test` }); return userId; }
async function save(userId: string, actions: MealAction[]) { const op = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions }); assert.equal(op.canConfirm, true, op.rows.map(r => r.error).join(";")); await decideMealOperation(db, userId, op.id, op.revision, "confirm"); return op; }
const reject = (work: Promise<unknown>, code: string) => assert.rejects(work, e => e instanceof Error && "code" in e && e.code === code);

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
test("编辑冲突保留记录，删除与恢复改变汇总并保持审计", async () => {
  const userId = await owner(); await save(userId, [lunch()]); const m = (await readMealSnapshot(db, userId)).meals[0];
  await save(userId, [lunch({ id: m.id, version: m.version, notes: "新备注" })]); const stale = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [lunch({ id: m.id, version: m.version })] }); assert.equal(stale.canConfirm, false);
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

test("缺图须网页登录明确选择，无图保存审计、审核终态及说明保留",async()=>{
 const userId=await owner(),explanation={amount:{source:"estimate" as const,basis:"虚构份量估100g",uncertainty:"图片份量存在误差"}};
 const op=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[lunch({expectedImageCount:1,items:[{kind:"food",name:"虚构牛排",quantity:"100",unit:"g",sourceKind:"estimated",nutrition:n("120","20","0","4"),reviewExplanation:explanation}]})]});
 assert.equal(op.missingImages,1);await assert.rejects(decideMealOperation(db,userId,op.id,op.revision,"confirm"),/照片/);
 const saved=await decideMealOperation(db,userId,op.id,op.revision,"confirm",true);assert.equal(saved.status,"confirmed");assert.equal(saved.canConfirm,false);assert.match(saved.result!.message,/文字/);
 assert.deepEqual((await readMealSnapshot(db,userId)).meals[0].items[0].reviewExplanation,explanation);
 const events=await db.select().from(schema.mealEvent).where(eq(schema.mealEvent.userId,userId));assert.equal(events[0].snapshot.confirmedWithoutImages,true);
 const repeated=await decideMealOperation(db,userId,op.id,op.revision,"confirm",true);assert.equal(repeated.revision,saved.revision);assert.equal((await readMealSnapshot(db,userId)).meals.length,1);
});
