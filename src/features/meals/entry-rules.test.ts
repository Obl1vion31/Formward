import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { authenticateAi, createAiToken } from "../auth/ai-tokens";
import { checkWebMeals } from "../records/web-entry-server";
import { getRecordOperation, reviewRecordOperation, submitRecordOperation } from "../records/operations";
import { currentMealPreview, dailyTotals, duplicateMealNotice, emptyNutrition, macroDistribution, mealContentKey, type MealAction, type Nutrition } from "./model";
import { decideMealOperation, displayMealOperation, getMealOperation, readMealSnapshot, submitMealOperation } from "./records";

const pg = new PGlite(), db = drizzle(pg, { schema });
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
const date = "2026-11-07";
const legacyError = "发现内容相同的餐次。确认是另一次进食后勾选“仍然新增”，或取消重复录入。";
const legacyWarning = "本餐热量：本次 6,000 kcal，上次 60 kcal，保存前请核对。";
const n = (k = "60", p = "1"): Nutrition => ({ caloriesKcal: k, proteinG: p, carbsG: "2", fatG: "1" });
const meal = (nutrition = n(), patch: Partial<Extract<MealAction, { kind: "save_meal" }>> = {}): Extract<MealAction, { kind: "save_meal" }> => ({ kind: "save_meal", date, mealType: "加餐", items: [{ kind: "food", name: "虚构大福", quantity: "1", unit: "份", sourceKind: "estimated", nutrition }], ...patch });
async function owner() { const id = randomUUID(); await db.insert(schema.user).values({ id, name: "虚构饮食规则验收", email: id + "@example.test" }); return id; }
async function save(userId: string, action: MealAction) { const op = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [action] }); assert.equal(op.canConfirm, true); await decideMealOperation(db, userId, op.id, op.revision, "confirm"); return op; }

test("同名加餐变化及食材大幅修改不生成历史倍数提醒，实际修改摘要保持", async () => {
  const id = await owner(); await save(id, meal());
  for (const [offset, nutrition] of [[0, n("6000", "100")], [1, n("1", "0.01")]] as const) {
    const action = meal(nutrition, { date: offset ? "2026-11-08" : date });
    const input = { operationId: randomUUID(), actions: [action] };
    await checkWebMeals(db, id, input);
    const op = await submitMealOperation(db, { userId: id, origin: "manual" }, input);
    assert.equal(op.canConfirm, true); assert.deepEqual(op.rows[0].warnings, []);
    await decideMealOperation(db, id, op.id, op.revision, "confirm");
  }
  const original = (await readMealSnapshot(db, id)).meals.find(m => m.date === date && m.totals.values.caloriesKcal === "60.0000")!;
  const edited = await submitMealOperation(db, { userId: id, origin: "manual" }, { operationId: randomUUID(), actions: [meal(n("12000", "200"), { id: original.id, version: original.version })] });
  assert.deepEqual(edited.rows[0].warnings, []); assert.equal(edited.rows[0].changes?.changed.length, 1);
  const food = { kind: "save_food" as const, name: "虚构食材", baseQuantity: "1", unit: "份", sourceKind: "reference" as const, nutrition: n() };
  const created = await save(id, food), saved = created.rows[0].food!;
  const updated = await submitMealOperation(db, { userId: id, origin: "manual" }, { operationId: randomUUID(), actions: [{ ...food, id: saved.id, version: saved.version, nutrition: n("6000", "100") }] });
  assert.equal(updated.canConfirm, true); assert.deepEqual(updated.rows[0].warnings, []);
});

test("相同餐次只提示，allowDuplicate省略／false／true均可直接保存，重复请求仍幂等", async () => {
  const id = await owner(); await save(id, meal());
  for (const allowDuplicate of [undefined, false, true]) {
    const input = { operationId: randomUUID(), actions: [meal(n(), { allowDuplicate })] };
    const op = await submitMealOperation(db, { userId: id, origin: "manual" }, input);
    assert.equal(op.canConfirm, true); assert.equal(op.rows[0].error, undefined);
    assert.equal(op.rows[0].warnings.filter(w => w === duplicateMealNotice).length, 1);
    assert.ok(op.rows[0].duplicateIds.length > 0);
    assert.equal((await submitMealOperation(db, { userId: id, origin: "manual" }, input)).id, op.id);
    await decideMealOperation(db, id, op.id, op.revision, "confirm");
    await decideMealOperation(db, id, op.id, op.revision, "confirm");
  }
  assert.equal((await readMealSnapshot(db, id)).meals.length, 4);
});

test("零、未知及已知部分正式保存不混淆，营养未知不生成占比或零合计", async () => {
  const id = await owner(), zero = n("0", "0"); zero.carbsG = "0"; zero.fatG = "0";
  for (const [target, nutrition] of [[date, zero], ["2026-11-08", emptyNutrition()], ["2026-11-09", { ...emptyNutrition(), proteinG: "8" }]] as const) {
    const action = meal(nutrition, { date: target }), input = { operationId: randomUUID(), actions: [action] };
    await checkWebMeals(db, id, input); await save(id, action);
  }
  const snapshot = await readMealSnapshot(db, id), days = dailyTotals(snapshot.meals);
  assert.equal(days.find(day => day.date === date)!.totals.values.caloriesKcal, "0.0000");
  for (const target of ["2026-11-08", "2026-11-09"]) {
    const day = days.find(day => day.date === target)!;
    assert.equal(day.totals.values.caloriesKcal, null); assert.equal(macroDistribution(day.totals), null);
  }
  assert.deepEqual(snapshot.meals.find(m => m.date === "2026-11-08")!.items[0].nutrition, emptyNutrition());
});

test("严格重复匹配保留日期、餐次、备注、数量及营养口径，不扩大为相似餐", async () => {
  const id = await owner(); await save(id, meal()); const saved = (await readMealSnapshot(db, id)).meals[0];
  assert.equal(mealContentKey(saved), mealContentKey({ ...saved, items: saved.items.map(i => ({ ...i, quantity: "1.00", nutrition: n("60.0", "1.0") })) }));
  for (const action of [meal(n(), { date: "2026-11-08" }), meal(n(), { mealType: "夜宵" }), meal(n(), { notes: "另一份备注" }), meal(n("61")), meal(n(), { items: [{ ...meal().items[0], quantity: "2" }] })]) {
    const op = await submitMealOperation(db, { userId: id, origin: "manual" }, { operationId: randomUUID(), actions: [action] });
    assert.deepEqual(op.rows[0].duplicateIds, []);
  }
});

test("旧待确认餐次仅清除退役系统拦截，原始请求和草稿不变，保存无须先刷新", async () => {
  const id = await owner(); await save(id, meal());
  const input = { operationId: randomUUID(), actions: [meal()] }, op = await submitMealOperation(db, { userId: id, origin: "manual" }, input);
  const row = await getMealOperation(db, id, op.id), preview = row.preview.map(p => ({ ...p, error: legacyError, warnings: [legacyWarning, duplicateMealNotice, "部分营养未知，合计仅包含已知数据。"] }));
  await db.update(schema.mealOperation).set({ preview }).where(and(eq(schema.mealOperation.userId, id), eq(schema.mealOperation.id, op.id)));
  const stored = await getMealOperation(db, id, op.id), view = displayMealOperation(stored);
  assert.equal(view.canConfirm, true); assert.equal(view.rows[0].error, undefined);
  assert.deepEqual(view.rows[0].warnings, [duplicateMealNotice, "部分营养未知，合计仅包含已知数据。"]);
  assert.equal(stored.preview[0].error, legacyError); assert.deepEqual(stored.draft, row.draft); assert.deepEqual(stored.payload, row.payload);
  assert.equal(displayMealOperation({ ...stored, expiresAt: new Date(0) }).canConfirm, false);
  const bad = currentMealPreview([{ ...preview[0], error: "照片不属于当前账号。" }])[0]; assert.equal(bad.error, "照片不属于当前账号。");
  assert.equal(currentMealPreview([{ ...preview[0], duplicateIds: [] }])[0].error, legacyError);
  await decideMealOperation(db, id, op.id, op.revision, "confirm");
  const saved = await getMealOperation(db, id, op.id); assert.deepEqual(saved.payload, row.payload); assert.deepEqual(saved.draft, row.draft);
  assert.equal((await readMealSnapshot(db, id)).meals.length, 2);
});

test("混合AI旧预览同样非阻断，保留账号隔离及最终确认幂等", async () => {
  const id = await owner(); await save(id, meal());
  const token = await createAiToken(db, id, "虚构饮食确认", "write"), identity = await authenticateAi(db, `Bearer ${token.rawToken}`);
  const op = await submitRecordOperation(db, identity, { operationId: randomUUID(), items: [{ key: "meal", ...meal() }] });
  const [record] = await db.select().from(schema.recordOperation).where(and(eq(schema.recordOperation.userId, id), eq(schema.recordOperation.id, op.id)));
  const child = await getMealOperation(db, id, record.mealOperationId!);
  await db.update(schema.mealOperation).set({ preview: child.preview.map(p => ({ ...p, error: legacyError, warnings: [legacyWarning] })) }).where(eq(schema.mealOperation.id, child.id));
  const view = await getRecordOperation(db, identity, op.id); assert.equal(view.canConfirm, true); assert.deepEqual(view.needsUserInput, []);
  assert.deepEqual(view.rows[0].meal?.warnings, [duplicateMealNotice]);
  const other = await owner(), t = await createAiToken(db, other, "虚构其他账号", "write"), another = await authenticateAi(db, `Bearer ${t.rawToken}`);
  await assert.rejects(getRecordOperation(db, another, op.id));
  await reviewRecordOperation(db, id, op.id, { kind: "confirm", revision: view.revision });
  await reviewRecordOperation(db, id, op.id, { kind: "confirm", revision: view.revision });
  assert.equal((await readMealSnapshot(db, id)).meals.length, 2);
});
