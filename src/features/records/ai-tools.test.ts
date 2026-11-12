import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createAiToken, authenticateAi, revokeAiToken } from "../auth/ai-tokens";
import { ApiError } from "../auth/ai-identity";
import { mealPreviewOperation, previewMeal, mealPreviewSchema, type MealPreviewInput } from "../meals/ai-preview";
import { applyMealChanges, previewMealChanges, savedMealDraft } from "../meals/ai-changes";
import { getMealOperation, decideMealOperation, readMealSnapshot, searchFoods, submitMealOperation } from "../meals/records";
import { energyPreviewOperation, previewEnergy } from "../activities/ai-preview";
import { readEnergySnapshot } from "../activities/records";
import { queryEnergy } from "../activities/ai-api";
import { queryMeals } from "../meals/ai-api";
import { queryAiMeasurementPage, queryAiMeasurements } from "../measurements/ai-api";
import { submitAiMeasurementOperation, reviewAiMeasurementOperation } from "../measurements/ai-operations";
import { queryParameters, boundedQueryPage } from "./ai-query";
import { mealAiResponse, recordAiResponse, aiRecovery } from "./ai-response";
import { getRecordOperation, reviewRecordOperation, submitRecordOperation } from "./operations";
import { emptyNutrition, type MealView } from "../meals/model";
import { balanceStatistics, decimalStatistics } from "./ai-statistics";
import { setMealDayStatus } from "../meals/day-status";
import { energyDays } from "../activities/model";
import { withAiFieldDefinitions } from "./ai-field-definitions";
import { safeAiError } from "../measurements/ai-api";
import { createAiToolSession } from "./ai-tool-session.mjs";

const queries: string[] = [], pg = new PGlite(), db = drizzle(pg, { schema, logger: { logQuery(query) { queries.push(query); } } });
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
async function owner(permission: "read" | "write" = "write") {
  const userId = randomUUID();
  await db.insert(schema.user).values({ id: userId, name: "虚构AI工具用户", email: userId + "@example.test" });
  const token = await createAiToken(db, userId, "虚构测试", permission);
  return { userId, token, identity: await authenticateAi(db, "Bearer " + token.rawToken) };
}
const food = { name: "虚构午餐", quantity: "2", unit: "份", caloriesKcal: "600", proteinG: "0", sourceKind: "estimated", basis: "两份合计的虚构估算，油量未知。" };
const lunch = (patch: Partial<MealPreviewInput> = {}): MealPreviewInput => ({ operationId: randomUUID(), date: "2024-08-01", timezone: "Asia/Shanghai", mealType: "午餐", foods: [food], ...patch });

test("营养总和、范围、负数及均值由整数汇总，缺记录不补零", () => {
  assert.deepEqual(decimalStatistics(["136", "99", "155", "155", "133", "93", "105"]), { count: 7, sum: "876.0000", mean: "125.1429", min: "93.0000", max: "155.0000" });
  assert.equal(decimalStatistics(["-287", "-79", "949", "775", "924", "-1109"]).sum, "1173.0000");
  assert.deepEqual(decimalStatistics([null]), { count: 0, sum: null, mean: null, min: null, max: null });
  assert.equal(decimalStatistics(["0", null]).mean, "0.0000");
});

test("食材引用与自由填写在结构中分开，缺单位可定位，库营养不能被覆盖", () => {
  const reference = { name: "库牛奶", foodId: randomUUID(), foodVersion: 1, quantity: "250", unit: "mL" };
  assert.ok(mealPreviewSchema.safeParse(lunch({ foods: [reference] })).success);
  assert.ok(mealPreviewSchema.safeParse(lunch({ foods: [{ ...reference, nutritionBasis: "consumed_total" }] })).success);
  assert.equal(mealPreviewSchema.safeParse(lunch({ foods: [{ ...reference, caloriesKcal: "999" }] } as unknown as MealPreviewInput)).success, false);
  const missing = { ...reference } as Record<string, unknown>; delete missing.unit;
  assert.throws(() => mealPreviewOperation(lunch({ foods: [missing] } as unknown as MealPreviewInput)), error => {
    const failure = safeAiError(error); assert.equal(failure.error.code, "invalid_input"); assert.ok(failure.error.details?.fields?.some(field => field.path.includes("unit"))); return true;
  });
});

test("同一统一草稿原地修正且重试幂等，保留原请求，不写事实，跨账号／新授权／过期受保护", async () => {
  const actor = await owner(), original = { operationId: randomUUID(), items: [{ ...mealPreviewOperation(lunch()).actions[0], key: "meal" }, { kind: "save_energy_day", key: "energy", date: "2024-08-01", entryMode: "total", totalKcal: "2200" }] };
  const first = await submitRecordOperation(db, actor.identity, original);
  const corrected = { ...original, operationId: randomUUID(), previewId: first.id, revision: first.revision, items: original.items.map(item => item.kind === "save_meal" ? { ...item, notes: "修正备注" } : item) };
  const next = await submitRecordOperation(db, actor.identity, corrected);
  assert.equal(next.id, first.id); assert.ok(next.revision > first.revision); assert.equal(next.canConfirm, true);
  const summary = recordAiResponse(next); assert.equal(summary.rows?.find(row => row.meal)?.meal?.meal?.notes, "修正备注");
  const repeat = await submitRecordOperation(db, actor.identity, corrected); assert.equal(repeat.repeated, true); assert.equal(repeat.revision, next.revision);
  assert.equal((await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.userId, actor.userId))).length, 1);
  const [stored] = await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.id, first.id)); assert.deepEqual(stored.payload, JSON.parse(JSON.stringify(original)));
  assert.equal((await readMealSnapshot(db, actor.userId)).meals.length, 0);
  await reject(submitRecordOperation(db, actor.identity, { ...corrected, operationId: randomUUID() }), "review_changed");
  await reject(submitRecordOperation(db, actor.identity, { ...corrected, operationId: randomUUID(), revision: next.revision, items: corrected.items.map(item => ({ ...item, key: "other-" + item.key })) }), "invalid_input");
  const other = await owner(); await reject(submitRecordOperation(db, other.identity, corrected), "not_found");
  const secondToken = await createAiToken(db, actor.userId, "另一个连接", "write"), secondIdentity = await authenticateAi(db, "Bearer " + secondToken.rawToken);
  await reject(submitRecordOperation(db, secondIdentity, corrected), "forbidden");
  await db.update(schema.mealOperation).set({ expiresAt: new Date(0) }).where(eq(schema.mealOperation.id, stored.mealOperationId!));
  await reject(submitRecordOperation(db, actor.identity, { ...corrected, operationId: randomUUID(), revision: next.revision }), "preview_expired");
});

test("盈余只统计同页完整日交集，部分摄入和累计不补零，权限不自动扩大", async () => {
  const actor = await savedMeal();
  const energy = await previewEnergy(db, actor.identity, { operationId: randomUUID(), date: actor.meal.date, totalKcal: "500" });
  await reviewRecordOperation(db, actor.userId, energy.id, { kind: "confirm", revision: energy.revision });
  const params = new URLSearchParams({ from: actor.meal.date, to: actor.meal.date, view: "summary", includeMeals: "true" });
  const result = await queryEnergy(db, actor.userId, params, actor.identity);
  assert.equal(result.balance?.coveredDays, 0); assert.equal(result.balance?.net.sum, null); assert.ok(result.balance?.days[0].reasons.includes("intake_not_complete"));
  const meals = await queryMeals(db, actor.userId, new URLSearchParams({ from: actor.meal.date, to: actor.meal.date, view: "summary" }));
  assert.equal(meals.statistics.recorded.caloriesKcal.sum, "600.0000"); assert.equal(meals.statistics.complete.caloriesKcal.sum, null);
  const day = meals.days[0].day;
  await setMealDayStatus(db, actor.userId, { operationId: randomUUID(), date: actor.meal.date, status: "complete", version: day.version, contentDigest: day.contentDigest });
  const complete = await queryEnergy(db, actor.userId, params, actor.identity);
  assert.equal(complete.balance?.intake.sum, "600.0000"); assert.equal(complete.balance?.expenditure.sum, "500.0000"); assert.equal(complete.balance?.net.sum, "100.0000"); assert.equal(complete.balance?.coveredDays, 1);
  const fullMeals = await queryMeals(db, actor.userId, new URLSearchParams({ from: actor.meal.date, to: actor.meal.date, view: "summary" }));
  const energyDaysValue = energyDays(await readEnergySnapshot(db, actor.userId), [], [actor.meal.date]);
  const cumulative = balanceStatistics(fullMeals.days, energyDaysValue.map(day => ({ ...day, cumulative: true })), { from: actor.meal.date, to: actor.meal.date });
  assert.equal(cumulative.net.sum, null); assert.ok(cumulative.days[0].reasons.includes("expenditure_cumulative"));
  const partial = balanceStatistics(fullMeals.days.map(day => ({ ...day, totals: { ...day.totals, incomplete: { ...day.totals.incomplete, caloriesKcal: true } } })), energyDaysValue, { from: actor.meal.date, to: actor.meal.date });
  assert.equal(partial.net.sum, null); assert.ok(partial.days[0].reasons.includes("intake_unknown_or_partial"));
  const paged = await queryEnergy(db, actor.userId, new URLSearchParams({ from: "2024-08-01", to: "2025-08-02", view: "summary", includeMeals: "true" }), actor.identity);
  if (!("page" in paged)) throw new Error("应有分页信息");
  assert.equal(paged.page.hasMore, true); assert.equal(paged.balance?.window.to, paged.page.to); assert.notEqual(paged.balance?.window.to, paged.range.to);
  const explained = withAiFieldDefinitions("query_energy", result); assert.ok(explained.fieldDefinitions["balance.coveredDays"]);
  await reject(queryEnergy(db, actor.userId, params), "insufficient_scope");
  const other = await owner(); await reject(queryEnergy(db, actor.userId, params, other.identity), "insufficient_scope");
});

test("未加载工具不执行，只补下一轮定义；相同请求复用回执，修正保留草稿标识", () => {
  const tool = { name: "submit_record_operation", description: "提交", inputSchema: {} }, session = createAiToolSession({ tools: [tool] });
  assert.deepEqual(session.names(), []); const blocked = session.missing(tool.name); assert.equal(blocked.executed, false); assert.deepEqual(session.names(), [tool.name]);
  const args = { operationId: randomUUID(), items: [{ key: "meal", kind: "save_meal", notes: "原" }] }, receipt = { id: randomUUID(), revision: 1, status: "pending" };
  session.remember(tool.name, args, receipt);
  assert.equal(session.prepare(tool.name, { ...args, operationId: randomUUID() }).result?.id, receipt.id);
  const prepared = session.prepare(tool.name, { ...args, items: [{ ...args.items[0], notes: "新" }] }); assert.equal(prepared.args?.previewId, receipt.id); assert.equal(prepared.args?.revision, 1);
  assert.equal(session.prepare(tool.name, { ...args, items: [{ key: "other", kind: "save_meal" }] }).result?.error, "existing_draft_requires_explicit_correction");
  assert.deepEqual(createAiToolSession({ tools: [tool] }).names(), []);
});

test("单餐或简洁消耗修正也不另建待审，下一轮补修改工具定义，不自动吞并独立任务", () => {
  const definitions = ["preview_meal", "preview_meal_changes", "preview_energy", "get_record_operation", "submit_record_operation"].map(name => ({ name, description: name, inputSchema: {} }));
  const session = createAiToolSession({ tools: definitions }), first = { operationId: randomUUID(), date: "today", mealType: "早餐", foods: [{ name: "虚构鸡蛋", quantity: "1", unit: "个" }] }, receipt = { id: randomUUID(), revision: 1, status: "pending", rows: [{ meal: { date: "2024-08-01" } }] };
  session.remember("preview_meal", first, receipt);
  const corrected = session.prepare("preview_meal", { ...first, operationId: randomUUID(), date: "2024-08-01", foods: [{ ...first.foods[0], caloriesKcal: "78" }] });
  assert.equal(corrected.result?.error, "existing_meal_preview_requires_correction"); assert.equal(corrected.result?.previewId, receipt.id); assert.equal(corrected.result?.executed, false); assert.ok(session.names().includes("preview_meal_changes"));
  assert.ok(session.prepare("preview_meal", { ...first, mealType: "午餐" }).args);
  const energy = { id: randomUUID(), revision: 1, status: "pending", operationType: "record", rows: [{ key: "day", kind: "save_energy_day" }] };
  session.remember("preview_energy", { operationId: randomUUID(), date: "today", totalKcal: "1000" }, energy);
  const changed = session.prepare("preview_energy", { operationId: randomUUID(), date: "today", totalKcal: "1100" });
  assert.equal(changed.result?.error, "existing_record_preview_requires_correction"); assert.equal(changed.result?.previewId, energy.id); assert.equal(changed.result?.executed, false);
});

test("统一草稿可补齐遗漏的同日正式编号，不把新运动预览编号当历史记录，也不能换账号或日期", async () => {
  const actor = await owner(), date = "2024-08-01";
  const seed = await previewEnergy(db, actor.identity, { operationId: randomUUID(), date, totalKcal: "1000" });
  await reviewRecordOperation(db, actor.userId, seed.id, { kind: "confirm", revision: seed.revision });
  const saved = (await readEnergySnapshot(db, actor.userId)).days[0];
  const items = [{ key: "day", kind: "save_energy_day", date, entryMode: "total", totalKcal: "2200" }, { key: "run", kind: "save_activity", date, name: "跑步", caloriesKcal: "300", inclusion: "included" }];
  const first = await submitRecordOperation(db, actor.identity, { operationId: randomUUID(), items });
  assert.equal(first.canConfirm, false);
  const correction = { operationId: randomUUID(), previewId: first.id, revision: first.revision, items: [{ ...items[0], id: saved.id, version: saved.version }, items[1]] };
  const temporaryId = first.rows.find(row => row.key === "run")!.energy!.after!.id;
  const temporaryDayId = first.rows.find(row => row.key === "day")!.energy!.after!.id;
  assert.ok(!first.energySnapshot?.days.some(day => day.id === temporaryDayId));
  await assert.rejects(submitRecordOperation(db, actor.identity, { ...correction, operationId: randomUUID(), items: [{ ...correction.items[0], id: temporaryDayId }, items[1]] }), error => error instanceof ApiError && error.details?.fields?.[0]?.path === "items.0.id" && error.message.includes(saved.id));
  await assert.rejects(submitRecordOperation(db, actor.identity, { ...correction, operationId: randomUUID(), items: [correction.items[0], { ...items[1], id: temporaryId, version: 1 }] }), error => error instanceof ApiError && error.details?.fields?.[0]?.path === "items.1.id" && /临时编号/.test(error.message));
  await reject(submitRecordOperation(db, actor.identity, { ...correction, operationId: randomUUID(), items: [{ ...correction.items[0], date: "2024-08-02" }, items[1]] }), "invalid_input");
  const other = await owner(); await reject(submitRecordOperation(db, actor.identity, { ...correction, operationId: randomUUID(), items: [{ ...correction.items[0], id: other.userId }, items[1]] }), "invalid_input");
  const corrected = await submitRecordOperation(db, actor.identity, correction);
  assert.equal(corrected.id, first.id); assert.equal(corrected.canConfirm, true);
  assert.equal(corrected.rows[0].energy?.day?.totalKcal, "2200");
  assert.equal((await readEnergySnapshot(db, actor.userId)).days[0].totalKcal, "1000.0000");
  const repeat = await submitRecordOperation(db, actor.identity, correction); assert.equal(repeat.repeated, true); assert.equal(repeat.revision, corrected.revision);
});
test("错误初始日编号可修正为同日真实记录，修好后不能换成另一条已保存记录", async () => {
  const actor = await owner(), date = "2024-08-01";
  for (const day of [date, "2024-08-02"]) { const seed = await previewEnergy(db, actor.identity, { operationId: randomUUID(), date: day, totalKcal: "1000" }); await reviewRecordOperation(db, actor.userId, seed.id, { kind: "confirm", revision: seed.revision }); }
  const saved = (await readEnergySnapshot(db, actor.userId)).days, real = saved.find(day => day.date === date)!, other = saved.find(day => day.date !== date)!;
  const first = await submitRecordOperation(db, actor.identity, { operationId: randomUUID(), items: [{ key: "day", kind: "save_energy_day", date, id: randomUUID(), version: 1, entryMode: "total", totalKcal: "2200" }] });
  assert.equal(first.canConfirm, false);
  const corrected = await submitRecordOperation(db, actor.identity, { operationId: randomUUID(), previewId: first.id, revision: first.revision, items: [{ key: "day", kind: "save_energy_day", date, id: real.id, version: real.version, entryMode: "total", totalKcal: "2200" }] });
  assert.equal(corrected.id, first.id); assert.equal(corrected.canConfirm, true);
  await reject(submitRecordOperation(db, actor.identity, { operationId: randomUUID(), previewId: corrected.id, revision: corrected.revision, items: [{ key: "day", kind: "save_energy_day", date, id: other.id, version: other.version, entryMode: "total", totalKcal: "2200" }] }), "invalid_input");
  assert.equal((await readEnergySnapshot(db, actor.userId)).days.find(day => day.id === real.id)?.totalKcal, "1000.0000");
});
const reject = (promise: Promise<unknown>, code: string) => assert.rejects(promise, error => error instanceof ApiError && error.code === code);
async function savedMeal(withImage = false) {
  const actor = await owner(), imageId = randomUUID();
  if (withImage) await db.insert(schema.mealImage).values({ id: imageId, userId: actor.userId, pathname: "fictional/private.png", sha256: "1".repeat(64), mimeType: "image/png", byteSize: 50, fileName: "fictional.png", source: "manual", createdBy: actor.userId });
  const preview = await previewMeal(db, actor.identity, lunch(withImage ? { imageIds: [imageId], notes: "原备注" } : {}));
  assert.equal(preview.canConfirm, true);
  await decideMealOperation(db, actor.userId, preview.id, preview.revision, "confirm");
  return { ...actor, meal: (await readMealSnapshot(db, actor.userId)).meals[0] };
}

test("总量、每份和每100克采用相同业务换算，0与未知不混淆，不提前除法舍入", async () => {
  const { identity } = await owner();
  const total = await previewMeal(db, identity, lunch());
  assert.equal(total.rows[0].meal?.totals.values.caloriesKcal, "600.0000");
  const portion = await previewMeal(db, identity, lunch({ foods: [{ ...food, caloriesKcal: "300", nutritionBasis: "per_portion" }] }));
  assert.equal(portion.rows[0].meal?.totals.values.caloriesKcal, "600.0000");
  assert.equal(portion.rows[0].meal?.items[0].perPortionNutrition?.caloriesKcal, "300");
  const reference = await previewMeal(db, identity, lunch({ foods: [{ ...food, quantity: "333", unit: "g", caloriesKcal: "0.0001", proteinG: "0", referenceQuantity: "100", nutritionBasis: "per_reference" }] }));
  assert.equal(reference.rows[0].meal?.items[0].nutrition.caloriesKcal, "0.0003");
  assert.equal(reference.rows[0].meal?.items[0].nutrition.proteinG, "0.0000");
  assert.equal(reference.rows[0].meal?.items[0].nutrition.carbsG, null);
  assert.match(reference.rows[0].meal?.items[0].basis ?? "", /每100g/);
});

test("明确kJ转换为kcal，双热量字段和错误单位被拒绝，不猜来源", async () => {
  const { identity } = await owner();
  const { caloriesKcal, ...rest } = food; void caloriesKcal;
  const preview = await previewMeal(db, identity, lunch({ foods: [{ ...rest, caloriesKj: "418.4", sourceKind: "unknown" }] }));
  assert.equal(preview.rows[0].meal?.items[0].nutrition.caloriesKcal, "100.0000");
  assert.equal(preview.rows[0].meal?.items[0].sourceKind, "unknown");
  assert.throws(() => mealPreviewOperation(lunch({ foods: [{ ...food, caloriesKj: "418.4" }] })), /其中一种/);
  assert.throws(() => mealPreviewOperation(lunch({ foods: [{ ...food, fatG: "0.1kg" }] })), ApiError);
});

test("真实模型漏写重复转录或消耗模式时，服务器仅从明确字段生成，不创造新事实", async () => {
  const { identity } = await owner();
  const preview = await previewMeal(db, identity, lunch({ foods: [{ name: "虚构包装", quantity: "2", unit: "份", nutritionBasis: "per_portion", caloriesKcal: "300", proteinG: "0", sourceKind: "label" }] }));
  assert.equal(preview.canConfirm, true);
  assert.equal(preview.rows[0].meal?.items[0].nutrition.caloriesKcal, "600.0000");
  assert.match(preview.rows[0].meal?.items[0].basis ?? "", /每1份.*carbsG=未知/);
  const energy = await previewEnergy(db, identity, { operationId: randomUUID(), date: "2024-08-01", restingKcal: "1800", activeKcal: "0" });
  assert.equal(energy.canConfirm, true); assert.equal(energy.rows[0].energy?.day?.totalKcal, "1800.0000");
  const missing = await previewEnergy(db, identity, { operationId: randomUUID(), date: "2024-08-01", restingKcal: "1800" });
  assert.equal(missing.rows[0].energy?.day?.activeSource, "activities");
});

test("跨零点重试固定首次日期、相同内容返回同预览，改内容冲突且正式记录仍为0", async () => {
  const { identity, userId } = await owner(), input = lunch({ date: "yesterday" });
  const first = await previewMeal(db, identity, input, new Date("2026-11-10T15:59:59Z"));
  const repeated = await previewMeal(db, identity, input, new Date("2026-11-10T16:00:01Z"));
  assert.equal(first.id, repeated.id); assert.equal(repeated.repeated, true);
  assert.equal(repeated.rows[0].meal?.date, "2026-11-09");
  await reject(previewMeal(db, identity, { ...input, mealType: "晚餐" }), "request_conflict");
  assert.equal((await readMealSnapshot(db, userId)).meals.length, 0);
});

test("旧每份、whole/misc与混合提交仍有效，不让整餐与细项重复相加", async () => {
  const { identity } = await owner();
  for (const kind of ["whole", "misc"] as const) {
    const preview = await previewMeal(db, identity, lunch({ foods: [{ ...food, kind }] }));
    assert.equal(preview.canConfirm, true); assert.equal(preview.rows[0].meal?.items[0].kind, kind);
  }
  const invalid = await previewMeal(db, identity, lunch({ foods: [{ ...food, kind: "whole" }, { ...food, name: "另项" }] }));
  assert.equal(invalid.canConfirm, false);
  const original = mealPreviewOperation(lunch());
  const mixed = await submitRecordOperation(db, identity, { operationId: randomUUID(), items: [{ ...original.actions[0], key: "meal" }, { kind: "save_energy_day", key: "energy", date: "2024-08-01", entryMode: "total", totalKcal: "2000" }] });
  assert.equal(mixed.rows.length, 2); assert.ok(mixed.confirmationPath);
});

test("局部修改只改指定项，保留照片、备注、食物身份及未改精度；确认后才写事实", async () => {
  const { identity, userId, meal } = await savedMeal(true);
  const raw = { operationId: randomUUID(), mealId: meal.id, version: meal.version, updateFoods: [{ itemId: meal.items[0].id!, proteinG: "12.3456" }] };
  const preview = await previewMealChanges(db, identity, raw);
  assert.equal(preview.operationType, "meal");
  if (preview.operationType !== "meal") throw new Error();
  assert.equal(preview.rows[0].meal?.items[0].nutrition.proteinG, "12.3456");
  assert.equal(preview.rows[0].meal?.items[0].nutrition.caloriesKcal, "600.0000");
  assert.equal(preview.rows[0].meal?.items[0].id, meal.items[0].id);
  assert.deepEqual(preview.rows[0].meal?.imageIds, meal.imageIds); assert.equal(preview.rows[0].meal?.notes, "原备注");
  assert.equal((await readMealSnapshot(db, userId)).meals[0].items[0].nutrition.proteinG, "0.0000");
  await decideMealOperation(db, userId, preview.id, preview.revision, "confirm");
  const repeated = await previewMealChanges(db, identity, raw);
  assert.equal(repeated.id, preview.id); assert.equal(repeated.status, "confirmed");
  assert.equal((await readMealSnapshot(db, userId)).meals[0].items[0].nutrition.proteinG, "12.3456");
});

test("自由总量改食量必须明确保持或缩放；部分新营养也不能掩盖未明确的其余总量", async () => {
  const { identity, meal } = await savedMeal();
  const base = { operationId: randomUUID(), mealId: meal.id, version: meal.version, updateFoods: [{ itemId: meal.items[0].id!, quantity: "1" }] };
  await reject(previewMealChanges(db, identity, base), "needs_input");
  await reject(previewMealChanges(db, identity, { ...base, updateFoods: [{ ...base.updateFoods[0], proteinG: "5" }] }), "needs_input");
  for (const [effect, expected] of [["keep_total", "600.0000"], ["scale_total", "300.0000"]] as const) {
    const operation = await previewMealChanges(db, identity, { ...base, operationId: randomUUID(), updateFoods: [{ ...base.updateFoods[0], quantityEffect: effect }] });
    if (operation.operationType !== "meal") throw new Error();
    assert.equal(operation.rows[0].meal?.items[0].nutrition.caloriesKcal, expected);
  }
});

test("每份项自动按新份量换算，局部清空与省略有区别", async () => {
  const { identity, userId } = await owner();
  const original = await previewMeal(db, identity, lunch({ foods: [{ ...food, nutritionBasis: "per_portion", caloriesKcal: "300" }] }));
  await decideMealOperation(db, userId, original.id, original.revision, "confirm");
  const meal = (await readMealSnapshot(db, userId)).meals[0];
  const preview = await previewMealChanges(db, identity, { operationId: randomUUID(), mealId: meal.id, version: meal.version, updateFoods: [{ itemId: meal.items[0].id!, quantity: "3" }] });
  if (preview.operationType !== "meal") throw new Error();
  assert.equal(preview.rows[0].meal?.items[0].nutrition.caloriesKcal, "900.0000");
  const cleared = await previewMealChanges(db, identity, { operationId: randomUUID(), mealId: meal.id, version: meal.version, clearNotes: true, updateFoods: [{ itemId: meal.items[0].id!, clearFields: ["proteinG"] }] });
  if (cleared.operationType !== "meal") throw new Error();
  assert.equal(cleared.rows[0].meal?.items[0].nutrition.proteinG, null);
  assert.equal(cleared.rows[0].meal?.items[0].nutrition.caloriesKcal, "600.0000");
});

test("历史食材快照的份量自动换算，不使用修改后的库规格", async () => {
  const { identity, userId } = await owner();
  const created = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [{ kind: "save_food", name: "虚构规格", baseQuantity: "100", unit: "g", nutrition: { ...emptyNutrition(), caloriesKcal: "100" }, sourceKind: "unknown" }] });
  await decideMealOperation(db, userId, created.id, created.revision, "confirm");
  const entry = (await searchFoods(db, userId))[0];
  const mealPreview = await previewMeal(db, identity, lunch({ foods: [{ name: entry.name, foodId: entry.id, foodVersion: entry.version, quantity: "100", unit: "g" }] }));
  await decideMealOperation(db, userId, mealPreview.id, mealPreview.revision, "confirm");
  await db.update(schema.food).set({ caloriesKcal: "999", version: 2 }).where(eq(schema.food.id, entry.id));
  const meal = (await readMealSnapshot(db, userId)).meals[0];
  const changed = await previewMealChanges(db, identity, { operationId: randomUUID(), mealId: meal.id, version: meal.version, updateFoods: [{ itemId: meal.items[0].id!, quantity: "150" }] });
  if (changed.operationType !== "meal") throw new Error();
  assert.equal(changed.rows[0].meal?.items[0].nutrition.caloriesKcal, "150.0000");
});

test("待确认修改在原链接更新；重试不重复添加，AI修改不冒充人工", async () => {
  const { identity, userId } = await owner(), first = await previewMeal(db, identity, lunch());
  const input = { operationId: randomUUID(), previewId: first.id, revision: first.revision, addFoods: [{ name: "虚构水", quantity: "1", unit: "杯", caloriesKcal: "0", sourceKind: "unknown" }] };
  const changed = await previewMealChanges(db, identity, input);
  assert.equal(changed.operationType, "record");
  const repeated = await previewMealChanges(db, identity, input);
  assert.equal(changed.id, repeated.id); assert.equal(repeated.repeated, true);
  assert.equal((await getMealOperation(db, userId, first.id)).draft.actions[0].kind, "save_meal");
  if (changed.operationType !== "record") throw new Error();
  assert.equal(changed.rows[0].action.kind, "save_meal"); assert.equal(changed.rows[0].editedBy, undefined);
  assert.equal(changed.rows[0].aiEdits?.length, 1);
  assert.equal(changed.rows[0].meal?.meal?.items.length, 2);
  await reject(previewMealChanges(db, identity, { ...input, notes: "不同内容" }), "request_conflict");
  assert.equal((await readMealSnapshot(db, userId)).meals.length, 0);
});

test("混合预览只改指定餐次，保持身体、消耗与其他餐次，旧revision冲突", async () => {
  const { identity } = await owner(), meal = mealPreviewOperation(lunch()).actions[0];
  const original = await submitRecordOperation(db, identity, { operationId: randomUUID(), items: [{ ...meal, key: "lunch" }, { ...meal, mealType: "晚餐", key: "dinner" }, { key: "energy", kind: "save_energy_day", date: "2024-08-01", entryMode: "total", totalKcal: "2000" }] });
  const changed = await previewMealChanges(db, identity, { operationId: randomUUID(), previewId: original.id, revision: original.revision, key: "lunch", notes: "只改午餐" });
  const current = await getRecordOperation(db, identity, original.id);
  assert.equal(current.rows[1].action.kind, "save_meal");
  assert.equal(current.rows[1].action.kind === "save_meal" ? current.rows[1].action.notes : null, undefined);
  assert.deepEqual(current.rows[2].action, original.rows[2].action);
  assert.equal(changed.rows.length, 1);
  await reject(previewMealChanges(db, identity, { operationId: randomUUID(), previewId: original.id, revision: original.revision, key: "lunch", notes: "过期修改" }), "review_changed");
});

test("禁止跨账号、换授权、只读、撤销、过期，以及清空整餐", async () => {
  const first = await owner(), second = await owner(), preview = await previewMeal(db, first.identity, lunch());
  const patch = { operationId: randomUUID(), previewId: preview.id, revision: preview.revision, notes: "修改" };
  await reject(previewMealChanges(db, second.identity, patch), "not_found");
  const otherToken = await createAiToken(db, first.userId, "另一授权", "write");
  const otherIdentity = await authenticateAi(db, "Bearer " + otherToken.rawToken);
  await reject(previewMealChanges(db, otherIdentity, patch), "forbidden");
  await reject(previewMealChanges(db, first.identity, { ...patch, removeFoods: [{ index: 0 }] }), "invalid_input");
  await db.update(schema.mealOperation).set({ expiresAt: new Date(0) }).where(eq(schema.mealOperation.id, preview.id));
  await reject(previewMealChanges(db, first.identity, patch), "preview_expired");
  const readOnly = await owner("read");
  await reject(previewMeal(db, readOnly.identity, lunch()), "read_only");
  await revokeAiToken(db, first.userId, first.token.token.id);
  await reject(previewMealChanges(db, first.identity, patch), "invalid_token");
});

test("消耗总数、分项、明确0、仅运动沿用包含规则，跨日重试不换日", async () => {
  const { identity, userId } = await owner();
  const input = { operationId: randomUUID(), date: "yesterday", timezone: "Asia/Shanghai", restingKcal: "1800", activeKcal: "0", activityMode: "total" as const };
  const preview = await previewEnergy(db, identity, input, new Date("2026-11-10T15:59:59Z"));
  const again = await previewEnergy(db, identity, input, new Date("2026-11-10T16:00:01Z"));
  assert.equal(preview.id, again.id); assert.equal(again.repeated, true);
  assert.equal(preview.rows[0].energy?.day?.totalKcal, "1800.0000");
  assert.equal(preview.rows[0].energy?.after && "date" in preview.rows[0].energy.after ? preview.rows[0].energy.after.date : null, "2026-11-09");
  assert.throws(() => energyPreviewOperation({ ...input, totalKcal: "2000" }), ApiError);
  const activity = await previewEnergy(db, identity, { operationId: randomUUID(), date: "2024-08-01", activities: [{ name: "虚构跑步", caloriesKcal: "200", durationMinutes: "20" }] });
  assert.equal(activity.rows[0].energy?.day?.totalKcal, null);
  assert.equal((await readEnergySnapshot(db, userId)).activities.length, 0);
});

test("消耗预览确认、状态摘要与错误恢复指示准确，不回传全库", async () => {
  const { identity, userId } = await owner();
  const preview = await previewEnergy(db, identity, { operationId: randomUUID(), date: "2024-08-01", totalKcal: "2000" });
  const summary = recordAiResponse(preview);
  assert.equal(summary.state, "awaiting_web_confirmation"); assert.equal("foods" in summary, false);
  assert.equal("energySnapshot" in summary, false); assert.equal("rows" in recordAiResponse(preview, "status"), false);
  await reviewRecordOperation(db, userId, preview.id, { kind: "confirm", revision: preview.revision });
  const saved = recordAiResponse(await getRecordOperation(db, identity, preview.id), "status");
  assert.equal(saved.saved, 1); assert.equal(saved.requiresWebConfirmation, false);
  assert.equal(aiRecovery("request_conflict", 409).retryable, false);
  assert.equal(aiRecovery("unavailable", 503).nextAction, "retry_same_operation_id_and_content");
  assert.equal(aiRecovery("needs_input", 400).nextAction, "ask_user");
});

test("新查询范围由服务器解析并显式分页，旧查询默认形状继续可用", async () => {
  const params = queryParameters({ range: "last7", timezone: "Asia/Shanghai" }, new Date("2026-11-01T00:30:00Z"));
  assert.equal(params.get("from"), "2026-10-26"); assert.equal(params.get("to"), "2026-11-01");
  assert.equal(params.get("view"), "summary");
  assert.throws(() => queryParameters({ range: "last7", from: "2024-08-01" }), ApiError);
  const page = boundedQueryPage(new URLSearchParams({ from: "2024-01-01", to: "2024-12-31", view: "details" }), "2026-11-11");
  assert.equal(page.dates.length, 50); assert.equal(page.page.nextFrom, "2024-02-20"); assert.equal(page.page.hasMore, true);
  const { identity, userId } = await owner(), preview = await previewMeal(db, identity, lunch());
  await decideMealOperation(db, userId, preview.id, preview.revision, "confirm");
  const summary = await queryMeals(db, userId, new URLSearchParams({ from: "2024-08-01", to: "2024-08-02", view: "summary" }));
  assert.equal(summary.meals.length, 0); assert.equal(summary.days.length, 1);
  const details = await queryMeals(db, userId, new URLSearchParams({ from: "2024-08-01", to: "2024-08-02", view: "details" }));
  assert.equal(details.meals.length, 1); assert.equal(details.meals[0].version, 1);
  assert.equal((await queryMeals(db, userId, new URLSearchParams())).meals.length, 1);
  const energy = await queryEnergy(db, userId, new URLSearchParams({ from: "2024-08-01", to: "2024-08-02", view: "summary" }));
  assert.equal(energy.days[0].totalKcal, null);
});

test("摘要只读所选日期，食材搜索不查询餐次，未选年份不进入结果", async () => {
  const { userId, identity } = await savedMeal();
  const old = await previewMeal(db, identity, lunch({ date: "2020-01-01" }));
  await decideMealOperation(db, userId, old.id, old.revision, "confirm");
  queries.length = 0;
  await searchFoods(db, userId);
  assert.equal(queries.some(sql => /from "meals"|from "meal_items"|from "measurements"/.test(sql)), false);
  queries.length = 0;
  const selected = await queryMeals(db, userId, new URLSearchParams({ from: "2024-08-01", to: "2024-08-01", view: "details" }));
  assert.deepEqual(selected.meals.map(meal => meal.date), ["2024-08-01"]);
  assert.ok(queries.some(sql => sql.includes('"meals"."local_date" in')));
});

test("身体新摘要锚定所查日期，旧当前摘要明确scope，缺测不填0", async () => {
  const { userId, identity } = await owner();
  for (const [date, weight] of [["2024-07-31", "70"], ["2024-08-01", "71"], ["2025-08-01", "80"]]) {
    const preview = await submitAiMeasurementOperation(db, identity, { kind: "batch", operationId: randomUUID(), items: [{ kind: "save_record", date, period: "daytime", weightKg: weight, fasting: true, deviceLabel: "虚构秤" }] }, "Asia/Shanghai");
    await reviewAiMeasurementOperation(db, userId, preview.id, { kind: "confirm", revision: preview.revision });
  }
  const summary = await queryAiMeasurementPage(db, userId, new URLSearchParams({ from: "2024-08-01", to: "2024-08-02", view: "summary" }), "Asia/Shanghai");
  assert.equal(summary.sevenDay.anchorDate, "2024-08-02");
  assert.equal(summary.sevenDay.weightKg.average, 70.5);
  assert.equal(summary.days.find(day => day.date === "2024-08-02")?.daytime, null);
  assert.equal("records" in summary, false);
  const legacy = await queryAiMeasurements(db, userId, new URLSearchParams({ from: "2024-08-01", to: "2024-08-02" }), "Asia/Shanghai");
  assert.equal(legacy.analyses.weightKg.summary.scope, "latest_available_seven_days");
  assert.equal(legacy.analyses.weightKg.summary.current?.weightKg, "80.00");
});

test("过期预览状态不能显示可确认，取消不等于保存", () => {
  const operation = { id: randomUUID(), revision: 1, origin: "ai", createdAt: new Date(0).toISOString(), expiresAt: new Date(0).toISOString(), status: "pending", rows: [], canConfirm: true, confirmationPath: "/example", result: null };
  assert.equal(mealAiResponse(operation).state, "expired"); assert.equal(mealAiResponse(operation).canConfirm, false);
  assert.equal(mealAiResponse({ ...operation, status: "cancelled" }).state, "closed");
});

test("不相关字段和餐内空改动被拒绝，保存草稿仍只包含业务字段", () => {
  const meal: MealView = { id: randomUUID(), version: 1, date: "2024-08-01", mealType: "午餐", imageIds: [], source: "manual", deletedAt: null, totals: { values: emptyNutrition(), incomplete: { caloriesKcal: true, proteinG: true, carbsG: true, fatG: true } }, items: [{ id: randomUUID(), kind: "food", name: "虚构食物", quantity: "1", unit: "份", nutrition: emptyNutrition(), sourceKind: "unknown" }] };
  const draft = savedMealDraft(meal);
  assert.equal("totals" in draft, false);
  assert.equal("id" in draft.items[0], false);
  assert.throws(() => applyMealChanges(draft, { operationId: randomUUID(), mealId: meal.id, version: meal.version }), /实际修改/);
});
