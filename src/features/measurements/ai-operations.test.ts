import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { authenticateAi, createAiToken, listAiTokens, revokeAiToken, type AiIdentity } from "../auth/ai-tokens";
import { decideAiMeasurementOperation, getAiMeasurementOperation, parseAiMeasurementInput, reviewAiMeasurementOperation, submitAiMeasurementOperation, type ReviewInput } from "./ai-operations";
import { aiApiResponse, aiConfirmationUrl, aiRequestTimezone, queryAiMeasurements, readAiJson } from "./ai-api";
import { listMeasurements, saveReportedMeasurements } from "./records";
import { entryMetrics, entryPeriods } from "./entry-state";
import { saveMeasurementDay } from "./editing";
import { applyHistoricalInitialization, previewHistoricalInitialization } from "./initialization";
import { systemMeasurementTimezone, timezoneLabel, timezoneOptions, validateMeasurementTimezone } from "./timezone";

const pg = new PGlite(), db = drizzle(pg, { schema });
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
async function owner(permission: "read" | "write" = "write", seed = false) {
  const userId = `fictional-ai-${randomUUID()}`;
  await db.insert(schema.user).values({ id: userId, name: "虚构 AI 用户", email: `${userId}@example.test` });
  if (seed) await saveReportedMeasurements(db, { userId, actorId: userId, requestKey: randomUUID().replaceAll("-", "").padEnd(64, "a"), entryChannel: "manual", deviceLabel: "虚构秤", records: [1, 2, 3].flatMap(day => entryPeriods.map(period => ({ recordDate: `2024-04-0${day}`, period, weightKg: (70 + day / 10 + (period === "evening" ? .5 : 0)).toFixed(2), bodyFatPercent: "20.00", fasting: period === "daytime" }))) });
  const token = await createAiToken(db, userId, "虚构接入", permission);
  const identity = await authenticateAi(db, `Bearer ${token.rawToken}`);
  return { userId, token, identity, actor: { userId, actorId: userId } };
}
const input = (periods: unknown = { daytime: { weightKg: "70.2", fasting: true, deviceLabel: "虚构秤" } }, date = "2024-04-04") => ({ kind: "save_day", operationId: randomUUID(), date, periods });
const confirm = (identity: AiIdentity, id: string) => decideAiMeasurementOperation(db, identity.userId, id, "confirm");
const rejects = (promise: Promise<unknown>, code: string) => assert.rejects(promise, error => error instanceof Error && "code" in error && error.code === code);
const realItem = (date = "2024-05-01", patch: Record<string, unknown> = {}): ReviewInput => ({ kind: "save_record", date, period: "evening", weightKg: "70.20", deviceLabel: "虚构审核秤", ...patch } as ReviewInput);
const batch = (items: ReviewInput[]) => ({ kind: "batch", operationId: randomUUID(), items });

test("查询提供本次系统时区与当地日期，客户端时区优先且无效值拒绝", async () => {
  const { userId } = await owner();
  assert.equal(aiRequestTimezone(new Request("http://localhost")), systemMeasurementTimezone());
  const timezone = aiRequestTimezone(new Request("http://localhost", { headers: { "X-Formward-Timezone": "+05:45" } }));
  const result = await queryAiMeasurements(db, userId, new URLSearchParams(), timezone);
  assert.equal(result.context.timezone, "+05:45"); assert.equal(result.context.timezoneLabel, "GMT+5:45"); assert.match(result.context.localDate, /^\d{4}-\d{2}-\d{2}$/);
  for (const invalid of ["", "+14:15", "not-a-timezone"]) assert.throws(() => aiRequestTimezone(new Request("http://localhost", { headers: { "X-Formward-Timezone": invalid } })));
});

test("批量新录入每次自动采用系统时区，明确值优先；重试冻结默认且原始请求不变", async () => {
  const { userId, identity } = await owner(), request = batch([realItem()]);
  const first = await submitAiMeasurementOperation(db, identity, request, "+08:00");
  assert.equal(first.items[0].input.kind === "save_record" && first.items[0].input.timezone, "+08:00");
  assert.equal(first.items[0].preview.rows[0].after?.timezoneLabel, "GMT+8（东八区）");
  assert.equal(Object.hasOwn(first.items[0].originalInput, "timezone"), false); assert.equal(Object.hasOwn(request.items[0], "timezone"), false);
  assert.deepEqual(await listMeasurements(db, userId), []);
  const repeated = await submitAiMeasurementOperation(db, identity, request, "+07:00");
  assert.equal(repeated.id, first.id); assert.deepEqual(repeated.items, first.items);
  const fresh = await submitAiMeasurementOperation(db, identity, batch([realItem("2024-05-02"), realItem("2024-05-03", { timezone: "+05:45" }), realItem("2024-05-04", { timezone: null })]), "+07:00");
  assert.deepEqual(fresh.items.map(item => item.preview.rows[0].after?.timezone), ["+07:00", "+05:45", null]);
  await reviewAiMeasurementOperation(db, userId, fresh.id, { kind: "confirm", revision: 1 });
  assert.deepEqual((await listMeasurements(db, userId)).sort((a, b) => a.recordDate.localeCompare(b.recordDate)).map(row => row.timezone), ["+07:00", "+05:45", null]);
});

test("单日默认时区在逐行刷新和修改后保留，省略与显式 null 的重试内容不同", async () => {
  const { userId, identity } = await owner(), request = input();
  const first = await submitAiMeasurementOperation(db, identity, request, "+08:00");
  assert.equal(first.items[0].preview.rows[0].after?.timezone, "+08:00");
  await rejects(submitAiMeasurementOperation(db, identity, { ...request, timezone: null }, "+07:00"), "request_conflict");
  let review = await reviewAiMeasurementOperation(db, userId, first.id, { kind: "refresh", revision: 1 });
  review = await reviewAiMeasurementOperation(db, userId, first.id, { kind: "update", revision: review.revision, changes: [{ itemId: review.items[0].id, input: { ...review.items[0].input, timezone: "+07:00" } as ReviewInput }] });
  assert.equal((await submitAiMeasurementOperation(db, identity, request, "+05:30")).items[0].preview.rows[0].after?.timezone, "+07:00");
  await reviewAiMeasurementOperation(db, userId, first.id, { kind: "confirm", revision: review.revision });
  assert.equal((await listMeasurements(db, userId))[0].timezone, "+07:00");
  const explicitNull = await submitAiMeasurementOperation(db, identity, { ...input(undefined, "2024-04-05"), timezone: null }, "+08:00");
  assert.equal(explicitNull.items[0].preview.rows[0].after?.timezone, null);
});

test("新录入采用系统时区，已有记录补缺与来源修改保留原时区和未知值", async () => {
  const { userId, identity, actor } = await owner();
  for (const [date, timezone] of [["2024-05-01", "+07:00"], ["2024-05-02", null]] as const) await saveMeasurementDay(db, actor, { date, timezone, operationId: randomUUID(), periods: { evening: { weightKg: "70.20", deviceLabel: "虚构旧秤" } } });
  const records = await listMeasurements(db, userId), known = records.find(row => row.recordDate === "2024-05-01")!;
  const review = await submitAiMeasurementOperation(db, identity, batch([
    { kind: "save_record", date: known.recordDate, period: "evening", recordId: known.id, version: known.updatedAt.toISOString(), deviceLabel: "虚构新来源" },
    { kind: "save_record", date: "2024-05-02", period: "evening", bodyFatPercent: "20.10" },
    realItem("2024-05-03"),
  ]), "+08:00");
  assert.deepEqual(review.items.map(item => item.preview.rows[0].after?.timezone), ["+07:00", null, "+08:00"]);
  await reviewAiMeasurementOperation(db, userId, review.id, { kind: "confirm", revision: 1 });
  assert.deepEqual((await listMeasurements(db, userId)).sort((a, b) => a.recordDate.localeCompare(b.recordDate)).map(row => row.timezone), ["+07:00", null, "+08:00"]);
});

test("旧单日操作内容摘要仍可重试，已有预览不重新补系统时区", async () => {
  const { userId, identity } = await owner(), request = { ...input(), timezone: null };
  const first = await submitAiMeasurementOperation(db, identity, request);
  const preview = structuredClone(first.preview); delete preview.defaultTimezone;
  // 旧版预览的 after 不包含时区字段，但 resolved 保留写入时的时区。
  for (const row of preview.rows) if (row.after) { delete row.after.timezone; delete row.after.timezoneLabel; }
  await db.update(schema.measurementOperation).set({ preview, requestDigest: createHash("sha256").update(JSON.stringify(parseAiMeasurementInput(request))).digest("hex") }).where(eq(schema.measurementOperation.id, first.id));
  const repeated = await submitAiMeasurementOperation(db, identity, request, "+07:00");
  assert.equal(repeated.id, first.id); assert.equal(repeated.items[0].input.kind === "save_record" && repeated.items[0].input.timezone, null);
  const refreshed = await reviewAiMeasurementOperation(db, userId, first.id, { kind: "refresh", revision: first.revision });
  assert.equal(refreshed.items[0].preview.rows[0].after?.timezone, null);
  await reviewAiMeasurementOperation(db, userId, first.id, { kind: "confirm", revision: refreshed.revision });
  assert.equal((await listMeasurements(db, userId))[0].timezone, null);
});

test("跨日批量一个链接，草稿不写健康记录；逐条幂等保存、取消剩余保留已保存", async () => {
  const { userId, identity } = await owner(), request = batch([realItem(), realItem("2024-05-02"), realItem("2024-05-03")]);
  const initial = await submitAiMeasurementOperation(db, identity, request);
  assert.equal(initial.items.length, 3); assert.equal(initial.counts.pending, 3); assert.equal((await listMeasurements(db, userId)).length, 0);
  assert.deepEqual((await submitAiMeasurementOperation(db, identity, request)).items.map(item => item.id), initial.items.map(item => item.id));
  const action = { kind: "confirm" as const, revision: initial.revision, itemIds: [initial.items[0].id] };
  const results = await Promise.all([reviewAiMeasurementOperation(db, userId, initial.id, action), reviewAiMeasurementOperation(db, userId, initial.id, action)]);
  assert.ok(results.every(result => result.status === "partially_confirmed")); assert.equal((await listMeasurements(db, userId)).length, 1);
  const cancelled = await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "cancel", revision: results[0].revision });
  assert.equal(cancelled.status, "completed"); assert.equal(cancelled.counts.saved, 1); assert.equal(cancelled.counts.cancelled, 2);
  assert.equal((await listMeasurements(db, userId)).length, 1);
  assert.equal((await reviewAiMeasurementOperation(db, userId, initial.id, action)).counts.saved, 1);
  const [stored] = await db.select().from(schema.measurementOperation).where(eq(schema.measurementOperation.id, initial.id));
  assert.deepEqual(stored.payload, parseAiMeasurementInput(request));
});

test("旧单日双时段链接逐行确认只保存所选时段，余下可整体确认", async () => {
  const { userId, identity } = await owner(), initial = await submitAiMeasurementOperation(db, identity, input({ daytime: { weightKg: "70.20", fasting: true, deviceLabel: "虚构晨秤" }, evening: { bodyFatPercent: "20.20", deviceLabel: "虚构晚秤" } }));
  const part = await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: initial.revision, itemIds: [initial.items[1].id] });
  assert.equal(part.status, "partially_confirmed"); assert.deepEqual((await listMeasurements(db, userId)).map(row => row.period), ["evening"]);
  const done = await decideAiMeasurementOperation(db, userId, initial.id, "confirm");
  assert.equal(done.status, "confirmed"); assert.equal(done.counts.saved, 2); assert.equal((await listMeasurements(db, userId)).length, 2);
});

test("旧单日顶层默认时区只用于新记录，逐行保存和更新补缺草稿不改历史时区", async () => {
  const { userId, identity, actor } = await owner();
  await saveMeasurementDay(db, actor, { date: "2024-04-04", operationId: randomUUID(), timezone: "+07:00", periods: { daytime: { weightKg: "70.20", fasting: true, deviceLabel: "虚构历史秤" } } });
  const initial = await submitAiMeasurementOperation(db, identity, { ...input({ daytime: { bodyFatPercent: "20.10", fasting: true }, evening: { bodyFatPercent: "20.20", deviceLabel: "虚构新秤" } }), timezone: "+08:00" });
  assert.equal(Object.hasOwn(initial.items[0].input, "timezone"), false);
  let current = await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: 1, itemIds: [initial.items[1].id] });
  assert.equal(current.items[0].preview.canConfirm, true); assert.equal(current.items[0].preview.rows[0].after!.timezone, "+07:00");
  current = await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "update", revision: current.revision, changes: [{ itemId: initial.items[0].id, input: { ...initial.items[0].input, bodyFatPercent: "20.30" } as ReviewInput }] });
  await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: current.revision });
  const records = await listMeasurements(db, userId);
  assert.equal(records.find(row => row.period === "daytime")!.timezone, "+07:00"); assert.equal(records.find(row => row.period === "daytime")!.bodyFatPercent, "20.30");
  assert.equal(records.find(row => row.period === "evening")!.timezone, "+08:00");
});

test("批量业务错误留在行内，阻止整批但允许有效行保存；编辑与原始内容分别审计", async () => {
  const { userId, identity } = await owner(), initial = await submitAiMeasurementOperation(db, identity, batch([realItem(), realItem("2024-05-02", { weightKg: "-1", deviceLabel: null })]));
  assert.equal(initial.counts.issues, 1); assert.equal(initial.items[1].preview.rows[0].state, "invalid");
  await rejects(reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: initial.revision }), "no_changes");
  const part = await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: initial.revision, itemIds: [initial.items[0].id] });
  const fixed = realItem("2024-05-03", { period: "daytime", weightKg: "69.80", bodyFatPercent: "19.20", fasting: true, deviceLabel: "人工核对来源", timezone: "+08:00" });
  const updated = await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "update", revision: part.revision, changes: [{ itemId: initial.items[1].id, input: fixed }] });
  assert.equal(updated.counts.issues, 0); assert.equal((await listMeasurements(db, userId)).length, 1);
  assert.equal(updated.items[1].preview.rows[0].after?.timezoneLabel, "GMT+8（东八区）");
  const done = await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: updated.revision });
  assert.equal(done.status, "confirmed");
  const row = (await listMeasurements(db, userId)).find(row => row.recordDate === fixed.date)!;
  assert.equal(row.weightKg, "69.80"); assert.equal(row.timezone, "+08:00"); assert.equal(row.occurredAt, null); assert.equal(row.utcOffsetMinutes, null);
  const [event] = await db.select().from(schema.measurementEvent).where(eq(schema.measurementEvent.measurementId, row.id));
  const review = (event.snapshot.ai as { review: { originalInput: unknown; reviewedInput: unknown; editedBy: { userId: string } } }).review;
  assert.deepEqual(review.originalInput, initial.items[1].originalInput); assert.deepEqual(review.reviewedInput, fixed); assert.equal(review.editedBy.userId, userId);
});

test("审核版本、跨账号和行归属验证，取消／保存终态不能再编辑", async () => {
  const first = await owner(), other = await owner(), initial = await submitAiMeasurementOperation(db, first.identity, batch([realItem(), realItem("2024-05-02")]));
  await rejects(reviewAiMeasurementOperation(db, other.userId, initial.id, { kind: "refresh", revision: 1 }), "not_found");
  await rejects(reviewAiMeasurementOperation(db, first.userId, initial.id, { kind: "confirm", revision: 1, itemIds: [randomUUID()] }), "not_found");
  const action = { kind: "update" as const, revision: 1, changes: [{ itemId: initial.items[0].id, input: realItem("2024-05-01", { weightKg: "71.00" }) }] };
  const concurrent = await Promise.allSettled([reviewAiMeasurementOperation(db, first.userId, initial.id, action), reviewAiMeasurementOperation(db, first.userId, initial.id, action)]);
  assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
  const current = await getAiMeasurementOperation(db, first.userId, initial.id);
  await rejects(reviewAiMeasurementOperation(db, first.userId, initial.id, { kind: "confirm", revision: 1 }), "review_changed");
  const cancelled = await reviewAiMeasurementOperation(db, first.userId, initial.id, { kind: "cancel", revision: current.revision, itemIds: [initial.items[0].id] });
  await rejects(reviewAiMeasurementOperation(db, first.userId, initial.id, { ...action, revision: cancelled.revision }), "closed_item");
  assert.equal((await listMeasurements(db, first.userId)).length, 0);
  const wrong = await submitAiMeasurementOperation(db, other.identity, batch([realItem("2024-05-02", { recordId: initial.id, version: new Date().toISOString() })]));
  assert.equal(wrong.counts.issues, 1); assert.equal(wrong.items[0].preview.rows[0].before, null);
});

test("同批重复目标需处理，取消其中一行重新预览；重复实测和不足估算跳过", async () => {
  const { userId, identity } = await owner(), initial = await submitAiMeasurementOperation(db, identity, batch([realItem(), realItem()]));
  assert.equal(initial.counts.issues, 2);
  const unique = await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "cancel", revision: initial.revision, itemIds: [initial.items[1].id] });
  assert.equal(unique.items[0].preview.canConfirm, true);
  await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: unique.revision });
  const duplicate = await submitAiMeasurementOperation(db, identity, batch([realItem(), { kind: "estimate_cell", date: "2024-05-02", period: "evening", metric: "weightKg" }]));
  assert.equal(duplicate.status, "completed"); assert.equal(duplicate.counts.skipped, 2);
  assert.equal((await listMeasurements(db, userId)).length, 1);
  await rejects(submitAiMeasurementOperation(db, identity, batch([])), "invalid_input");
  await rejects(submitAiMeasurementOperation(db, identity, batch(Array.from({ length: 101 }, () => realItem()))), "invalid_input");
  await rejects(submitAiMeasurementOperation(db, identity, { kind: "batch", operationId: randomUUID(), items: [{ ...realItem(), userId: "other" }] }), "invalid_input");
});

test("过期和外部变化须刷新，自己逐行保存不使剩余预览失效；撤销令牌只允许取消", async () => {
  const { userId, identity, actor } = await owner(), initial = await submitAiMeasurementOperation(db, identity, batch([realItem(), realItem("2024-05-02")]));
  await db.update(schema.measurementOperation).set({ expiresAt: new Date(0) }).where(eq(schema.measurementOperation.id, initial.id));
  await rejects(reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: 1 }), "expired");
  let current = await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "refresh", revision: 1 });
  assert.ok(Date.parse(current.expiresAt) > Date.now());
  await saveMeasurementDay(db, actor, { date: "2024-06-01", timezone: null, operationId: randomUUID(), periods: { evening: { weightKg: "80.00", deviceLabel: "外部虚构秤" } } });
  await rejects(reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: current.revision }), "stale_preview");
  current = await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "refresh", revision: current.revision });
  current = await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: current.revision, itemIds: [initial.items[0].id] });
  assert.equal(current.counts.pending, 1);
  await revokeAiToken(db, userId, identity.tokenId);
  for (const kind of ["confirm", "refresh"] as const) await rejects(reviewAiMeasurementOperation(db, userId, initial.id, { kind, revision: current.revision }), "invalid_token");
  await rejects(reviewAiMeasurementOperation(db, userId, initial.id, { kind: "update", revision: current.revision, changes: [{ itemId: initial.items[1].id, input: realItem("2024-05-04") }] }), "invalid_token");
  current = await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "cancel", revision: current.revision });
  assert.equal(current.counts.saved, 1); assert.equal(current.counts.cancelled, 1);
});

test("整批第二条审计失败回滚前一条健康写入、来源、审计和状态", async () => {
  const { userId, identity } = await owner(), initial = await submitAiMeasurementOperation(db, identity, batch([realItem(), realItem("2024-05-02")]));
  await pg.exec("CREATE FUNCTION reject_second_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (NEW.snapshot->'after'->>'recordDate') = '2024-05-02' THEN RAISE EXCEPTION 'fictional review audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_second_review BEFORE INSERT ON measurement_events FOR EACH ROW EXECUTE FUNCTION reject_second_review();");
  try { await assert.rejects(reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: 1 })); }
  finally { await pg.exec("DROP TRIGGER reject_second_review ON measurement_events; DROP FUNCTION reject_second_review();"); }
  assert.equal((await listMeasurements(db, userId)).length, 0);
  assert.equal((await db.select().from(schema.measurementSource).where(eq(schema.measurementSource.userId, userId))).length, 0);
  assert.equal((await getAiMeasurementOperation(db, userId, initial.id)).revision, 1);
  assert.equal((await getAiMeasurementOperation(db, userId, initial.id)).counts.saved, 0);
  assert.equal((await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: 1 })).counts.saved, 2);
});

test("混合估算按审核时依据保存，不读取同批未确认实测；单项未知仍为空", async () => {
  const { userId, identity } = await owner("write", true);
  const initial = await submitAiMeasurementOperation(db, identity, batch([realItem("2024-04-04", { period: "daytime", weightKg: "80.00", fasting: true }), { kind: "estimate_cell", date: "2024-04-04", period: "evening", metric: "weightKg" }]));
  const predicted = initial.items[1].preview.rows[0].after!.weightKg;
  assert.equal(initial.counts.issues, 0);
  await reviewAiMeasurementOperation(db, userId, initial.id, { kind: "confirm", revision: 1 });
  const estimated = (await listMeasurements(db, userId)).find(row => row.recordDate === "2024-04-04" && row.recordKind === "estimated")!;
  assert.equal(estimated.weightKg, predicted); assert.equal(estimated.bodyFatPercent, null);
});

test("历史时区只能显式改，准确钟点保留并重算 UTC；日期时段不补钟点", async () => {
  const { userId, identity, actor } = await owner();
  await saveReportedMeasurements(db, { ...actor, requestKey: randomUUID().replaceAll("-", "").padEnd(64, "b"), entryChannel: "manual", deviceLabel: "虚构准确时间秤", records: [{ recordDate: "2024-04-04", period: "evening", weightKg: "70.20", bodyFatPercent: null, fasting: false, measuredAt: "2024-04-05 00:30:00", timezone: "Asia/Shanghai" }] });
  const before = (await listMeasurements(db, userId))[0];
  let preview = await submitAiMeasurementOperation(db, identity, batch([realItem("2024-04-04", { recordId: before.id, version: before.updatedAt.toISOString(), timezone: "+07:00" })]));
  assert.equal(preview.items[0].preview.rows[0].before?.timezoneLabel, "GMT+8（东八区）"); assert.equal(preview.items[0].preview.rows[0].after?.timezoneLabel, "GMT+7（东七区）");
  await reviewAiMeasurementOperation(db, userId, preview.id, { kind: "confirm", revision: 1 });
  const after = (await listMeasurements(db, userId))[0];
  assert.equal(after.sourceLocalTime, before.sourceLocalTime); assert.equal(after.recordDate, before.recordDate); assert.equal(after.occurredAt!.toISOString(), "2024-04-04T17:30:00.000Z"); assert.equal(after.utcOffsetMinutes, 420); assert.deepEqual(after.originalValues, before.originalValues); assert.equal(after.entryChannel, "manual");
  preview = await submitAiMeasurementOperation(db, identity, batch([realItem("2024-05-01", { timezone: null })])); await reviewAiMeasurementOperation(db, userId, preview.id, { kind: "confirm", revision: 1 });
  const unknown = (await listMeasurements(db, userId)).find(row => row.recordDate === "2024-05-01")!;
  assert.equal(unknown.timezone, null);
  preview = await submitAiMeasurementOperation(db, identity, batch([{ kind: "save_record", date: unknown.recordDate, period: "evening", recordId: unknown.id, version: unknown.updatedAt.toISOString(), timezone: "+08:00" }]));
  await reviewAiMeasurementOperation(db, userId, preview.id, { kind: "confirm", revision: 1 });
  const changed = (await listMeasurements(db, userId)).find(row => row.id === unknown.id)!;
  assert.equal(changed.timezone, "+08:00"); assert.equal(changed.sourceLocalTime, unknown.sourceLocalTime); assert.equal(changed.occurredAt, null); assert.equal(changed.utcOffsetMinutes, null);
  assert.equal(timezoneLabel(changed.timezone, changed.recordDate), "GMT+8（东八区）");
});

test("GMT 固定偏移支持半小时与一刻钟，地区历史偏移按测量日显示", () => {
  assert.equal(timezoneLabel("+05:30"), "GMT+5:30"); assert.equal(timezoneLabel("+05:45"), "GMT+5:45"); assert.equal(timezoneLabel("-03:30"), "GMT-3:30");
  assert.equal(timezoneLabel(null), "未指定"); assert.equal(timezoneLabel("America/New_York", "2025-01-01"), "GMT-5（西五区）"); assert.equal(timezoneLabel("America/New_York", "2025-07-01"), "GMT-4（西四区）"); assert.match(timezoneLabel("America/New_York", "2025-11-02"), /GMT-5.*GMT-4/);
  assert.equal(timezoneOptions.length, 27); assert.ok(timezoneOptions.every(option => option.value.endsWith(":00")));
  for (const option of timezoneOptions) validateMeasurementTimezone(option.value);
  for (const value of ["+15:00", "-13:00", "+08:05", "+08:99", "GMT+8", "invalid-zone"]) assert.throws(() => validateMeasurementTimezone(value));
});

test("令牌只存摘要，列表不泄漏原文；无效、过期、撤销、只读、跨账号拒绝", async () => {
  const first = await owner(), second = await owner(), read = await owner("read");
  const [stored] = await db.select().from(schema.aiToken).where(eq(schema.aiToken.id, first.token.token.id));
  assert.notEqual(stored.tokenHash, first.token.rawToken); assert.equal(stored.tokenHash.length, 64);
  assert.ok(!JSON.stringify(await listAiTokens(db, first.userId)).includes(first.token.rawToken));
  assert.ok(!Object.hasOwn((await listAiTokens(db, first.userId))[0], "tokenHash"));
  assert.ok(stored.lastUsedAt); assert.equal(Math.round((stored.expiresAt.getTime() - stored.createdAt.getTime()) / 86400000), 30);
  for (const value of [null, first.token.rawToken, "Bearer invalid", `Bearer fw_ai_${"a".repeat(43)}`]) await rejects(authenticateAi(db, value), "invalid_token");
  await rejects(submitAiMeasurementOperation(db, read.identity, input()), "read_only");
  await rejects(revokeAiToken(db, second.userId, first.token.token.id), "not_found");
  await revokeAiToken(db, first.userId, first.token.token.id); await revokeAiToken(db, first.userId, first.token.token.id);
  await rejects(authenticateAi(db, `Bearer ${first.token.rawToken}`), "invalid_token");
  await db.update(schema.aiToken).set({ expiresAt: new Date(0) }).where(eq(schema.aiToken.id, second.token.token.id));
  await rejects(authenticateAi(db, `Bearer ${second.token.rawToken}`), "invalid_token");
});

test("四项 15 种非空组合先预览无健康写入，确认一次并绑定 AI 审计", async () => {
  const { identity, userId } = await owner(), cells = entryPeriods.flatMap(period => entryMetrics.map(metric => ({ period, metric })));
  for (let mask = 1; mask < 16; mask++) {
    const periods: Record<string, Record<string, unknown>> = {};
    cells.forEach((cell, index) => { if (mask & (1 << index)) (periods[cell.period] ??= { fasting: cell.period === "daytime", deviceLabel: "虚构秤" })[cell.metric] = cell.metric === "weightKg" ? "70.2" : "20.1"; });
    const date = `2024-03-${String(mask).padStart(2, "0")}`, request = input(periods, date), preview = await submitAiMeasurementOperation(db, identity, request);
    assert.equal((await listMeasurements(db, userId)).some(row => row.recordDate === date), false);
    assert.equal(preview.preview.canConfirm, true); assert.equal((await submitAiMeasurementOperation(db, identity, request)).id, preview.id);
    const confirmations = await Promise.all([confirm(identity, preview.id), confirm(identity, preview.id)]);
    assert.ok(confirmations.every(row => row.status === "confirmed"));
    const rows = (await listMeasurements(db, userId)).filter(row => row.recordDate === date);
    assert.equal(rows.length, Object.keys(periods).length); assert.ok(rows.every(row => row.entryChannel === "api" && row.occurredAt === null && row.timePrecision === "day_period"));
    for (const row of rows) {
      const [event] = await db.select().from(schema.measurementEvent).where(eq(schema.measurementEvent.measurementId, row.id));
      assert.equal(event.actorType, "ai"); assert.deepEqual(event.snapshot.ai, { tokenId: identity.tokenId, operationId: preview.id, confirmedBy: userId, confirmedAt: confirmations[0].confirmedAt });
    }
  }
});

test("仅体脂、缺项补充、完全重复、冲突与带版本历史／来源修改", async () => {
  const { identity, userId } = await owner();
  const first = await submitAiMeasurementOperation(db, identity, input({ daytime: { bodyFatPercent: "20.10", fasting: true, deviceLabel: "虚构秤" } })); await confirm(identity, first.id);
  const before = (await listMeasurements(db, userId))[0]; assert.equal(before.weightKg, null);
  const duplicate = await submitAiMeasurementOperation(db, identity, input({ daytime: { bodyFatPercent: "20.1", fasting: true, deviceLabel: "虚构秤" } }));
  assert.equal(duplicate.preview.rows[0].state, "duplicate"); assert.equal(duplicate.preview.canConfirm, false); await rejects(confirm(identity, duplicate.id), "no_changes");
  const supplement = await submitAiMeasurementOperation(db, identity, input({ daytime: { weightKg: "70.20", fasting: true } }));
  assert.equal(supplement.preview.rows[0].state, "supplement"); await confirm(identity, supplement.id);
  const after = (await listMeasurements(db, userId))[0]; assert.equal(after.id, before.id); assert.equal(after.bodyFatPercent, "20.10"); assert.equal(after.weightKg, "70.20"); assert.deepEqual(after.originalValues, before.originalValues);
  const conflict = await submitAiMeasurementOperation(db, identity, input({ daytime: { weightKg: "71.00", fasting: true }, evening: { weightKg: "72.00", deviceLabel: "虚构秤" } }));
  assert.equal(conflict.preview.rows[0].state, "conflict"); assert.equal(conflict.preview.canConfirm, false); await rejects(confirm(identity, conflict.id), "no_changes"); assert.equal((await listMeasurements(db, userId)).length, 1);
  const edit = await submitAiMeasurementOperation(db, identity, input({ daytime: { recordId: after.id, version: after.updatedAt.toISOString(), weightKg: "71.00" } })); await confirm(identity, edit.id);
  const edited = (await listMeasurements(db, userId))[0];
  const source = await submitAiMeasurementOperation(db, identity, input({ daytime: { recordId: edited.id, version: edited.updatedAt.toISOString(), deviceLabel: "虚构新秤" } })); await confirm(identity, source.id);
  const sourced = (await listMeasurements(db, userId))[0]; assert.equal(sourced.deviceLabel, "虚构新秤"); assert.equal(sourced.sourceLocalTime, before.sourceLocalTime); assert.deepEqual(sourced.originalValues, before.originalValues);
  const clearing = await submitAiMeasurementOperation(db, identity, input({ daytime: { recordId: sourced.id, version: sourced.updatedAt.toISOString(), weightKg: null } })); await confirm(identity, clearing.id);
  assert.equal((await listMeasurements(db, userId))[0].weightKg, null);
});

test("输入不接受用户伪造、确认绕过、数字类型和无效／未知空腹，新来源必填", async () => {
  const { identity } = await owner();
  for (const request of [{ ...input(), confirmed: true }, { ...input(), userId: "other" }, { ...input(), date: "昨日" }, input({ daytime: { weightKg: 70, fasting: true, deviceLabel: "秤" } }), input({ daytime: { weightKg: "70", deviceLabel: "秤" } }), input({ daytime: { weightKg: "70", fasting: false, deviceLabel: "秤" } }), input({ daytime: { weightKg: "70", fasting: true } }), input({ evening: { weightKg: "0", deviceLabel: "秤" } }), input({ evening: { bodyFatPercent: "101", deviceLabel: "秤" } }), input({ daytime: null }), input({ daytime: { recordId: "missing", weightKg: "70" } })]) await assert.rejects(submitAiMeasurementOperation(db, identity, request));
  assert.deepEqual(await listMeasurements(db, identity.userId), []);
  assert.equal(parseAiMeasurementInput(input({ evening: { weightKg: "70", deviceLabel: " 秤 " } })).kind, "save_day");
});

test("跨账号记录、候选、操作和确认均隔离", async () => {
  const first = await owner(), second = await owner();
  const operation = await submitAiMeasurementOperation(db, first.identity, input()); await confirm(first.identity, operation.id);
  const row = (await listMeasurements(db, first.userId))[0];
  await rejects(getAiMeasurementOperation(db, second.userId, operation.id), "not_found"); await rejects(confirm(second.identity, operation.id), "not_found");
  await assert.rejects(submitAiMeasurementOperation(db, second.identity, input({ daytime: { recordId: row.id, version: row.updatedAt.toISOString(), deviceLabel: "秤" } })));
  await rejects(queryAiMeasurements(db, second.userId, new URLSearchParams({ choices: JSON.stringify({ "2024-04-04:daytime": row.id }) })), "invalid_input");
  assert.deepEqual((await queryAiMeasurements(db, second.userId, new URLSearchParams())).records, []);
});

test("同请求并发重试幂等，内容或令牌改变不能复用 operationId", async () => {
  const { identity, userId } = await owner(), request = input();
  const previews = await Promise.all([submitAiMeasurementOperation(db, identity, request), submitAiMeasurementOperation(db, identity, request)]);
  assert.equal(previews[0].id, previews[1].id);
  await rejects(submitAiMeasurementOperation(db, identity, { ...request, date: "2024-04-05" }), "request_conflict");
  const nextToken = await createAiToken(db, userId, "另一枚虚构令牌", "write"), nextIdentity = await authenticateAi(db, `Bearer ${nextToken.rawToken}`);
  await rejects(submitAiMeasurementOperation(db, nextIdentity, request), "request_conflict");
  await confirm(identity, previews[0].id); assert.equal((await submitAiMeasurementOperation(db, identity, request)).status, "confirmed");
});

test("网页修改使旧预览失效，取消、过期与令牌撤销不保存", async () => {
  for (const scenario of ["stale", "cancel", "expire", "revoke"] as const) {
    const { identity, userId, actor } = await owner(), preview = await submitAiMeasurementOperation(db, identity, input());
    if (scenario === "stale") { await saveMeasurementDay(db, actor, { date: "2024-04-05", operationId: randomUUID(), timezone: null, periods: { evening: { weightKg: "72.00", deviceLabel: "虚构秤" } } }); await rejects(confirm(identity, preview.id), "stale_preview"); }
    if (scenario === "cancel") { await decideAiMeasurementOperation(db, userId, preview.id, "cancel"); assert.equal((await confirm(identity, preview.id)).status, "cancelled"); }
    if (scenario === "expire") { await db.update(schema.measurementOperation).set({ expiresAt: new Date(0) }).where(eq(schema.measurementOperation.id, preview.id)); await rejects(confirm(identity, preview.id), "expired"); assert.equal((await getAiMeasurementOperation(db, userId, preview.id)).status, "expired"); }
    if (scenario === "revoke") { await revokeAiToken(db, userId, identity.tokenId); await rejects(confirm(identity, preview.id), "invalid_token"); }
    assert.equal((await listMeasurements(db, userId)).some(row => row.recordDate === "2024-04-04"), false);
  }
});

test("两个预览并发确认只应用一份，另一份因快照失效拒绝", async () => {
  const { identity, userId } = await owner();
  const a = await submitAiMeasurementOperation(db, identity, input()), b = await submitAiMeasurementOperation(db, identity, input());
  const results = await Promise.allSettled([confirm(identity, a.id), confirm(identity, b.id)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1); assert.equal((await listMeasurements(db, userId)).length, 1);
});

test("估算只保存单项与预览依据，样本不足不写入；实测替代审计有 AI 上下文", async () => {
  const seeded = await owner("write", true), unseeded = await owner();
  const request = { kind: "estimate_cell", operationId: randomUUID(), date: "2024-04-04", period: "evening", metric: "weightKg" };
  const insufficient = await submitAiMeasurementOperation(db, unseeded.identity, request); assert.equal(insufficient.preview.canConfirm, false); assert.equal(insufficient.preview.rows[0].after, null); await rejects(confirm(unseeded.identity, insufficient.id), "no_changes");
  const preview = await submitAiMeasurementOperation(db, seeded.identity, request); assert.ok(preview.preview.explanation?.references.length); await confirm(seeded.identity, preview.id);
  const estimate = (await listMeasurements(db, seeded.userId)).find(row => row.recordDate === "2024-04-04")!;
  assert.equal(estimate.weightKg, preview.preview.rows[0].after!.weightKg); assert.equal(estimate.bodyFatPercent, null); assert.equal(estimate.entryChannel, "api");
  const real = await submitAiMeasurementOperation(db, seeded.identity, input({ evening: { weightKg: "70.20", deviceLabel: "虚构秤" } })); assert.equal(real.preview.rows[0].replacedEstimates!.length, 1); await confirm(seeded.identity, real.id);
  const events = await db.select().from(schema.measurementEvent).where(and(eq(schema.measurementEvent.userId, seeded.userId), eq(schema.measurementEvent.measurementId, estimate.id)));
  assert.ok(events.every(event => event.actorType === "ai" && event.snapshot.ai));
});

test("冻结历史只允许实测，拒绝新增估算；查询与网页复用统计", async () => {
  const { identity, userId, actor } = await owner("write", true), request = { operationId: randomUUID(), range: { start: "2024-04-01", end: "2024-04-04" } };
  const preview = await previewHistoricalInitialization(db, userId, request); if (preview.alreadyApplied) throw new Error("预期新初始化");
  await applyHistoricalInitialization(db, { ...actor, request, digest: preview.digest });
  await assert.rejects(submitAiMeasurementOperation(db, identity, { kind: "estimate_cell", operationId: randomUUID(), date: "2024-04-04", period: "daytime", metric: "weightKg" }), /固定/);
  const real = await submitAiMeasurementOperation(db, identity, input()); await confirm(identity, real.id);
  const queried = await queryAiMeasurements(db, userId, new URLSearchParams({ from: "2024-04-04", to: "2024-04-04" })); assert.ok(queried.records.every(row => row.recordDate === "2024-04-04")); assert.equal(queried.analyses.weightKg.summary.coverage, 4);
});

test("审计写入失败回滚记录、批次、来源与确认状态", async () => {
  const { identity, userId } = await owner(), preview = await submitAiMeasurementOperation(db, identity, input());
  await pg.exec("CREATE FUNCTION reject_ai_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fictional audit failure'; END $$; CREATE TRIGGER reject_ai_audit BEFORE INSERT ON measurement_events FOR EACH ROW EXECUTE FUNCTION reject_ai_audit();");
  try { await assert.rejects(confirm(identity, preview.id)); } finally { await pg.exec("DROP TRIGGER reject_ai_audit ON measurement_events; DROP FUNCTION reject_ai_audit();"); }
  assert.deepEqual(await listMeasurements(db, userId), []); assert.equal((await getAiMeasurementOperation(db, userId, preview.id)).status, "pending");
  assert.equal((await db.select().from(schema.measurementImport).where(eq(schema.measurementImport.userId, userId))).length, 0);
  assert.equal((await db.select().from(schema.measurementSource).where(eq(schema.measurementSource.userId, userId))).length, 0);
  await confirm(identity, preview.id);
});

test("HTTP feature 仅 Bearer 鉴权，拒绝坏 JSON／过大内容，不返回数据库错误", async () => {
  const { identity, token } = await owner();
  const response = await aiApiResponse(new Request("http://localhost/api/v1/measurements", { headers: { Cookie: "fictional_session=abc" } }), db, false, async () => ({})); assert.equal(response.status, 401); assert.equal(response.headers.get("cache-control"), "no-store");
  const failure = await aiApiResponse(new Request("http://localhost/api/v1/measurements", { headers: { Authorization: `Bearer ${token.rawToken}` } }), db, false, async () => { throw Object.assign(new Error("SELECT private_data"), { query: "secret SQL" }); }); assert.equal(failure.status, 500); assert.ok(!(await failure.text()).includes("SELECT"));
  for (const body of ["{", "x".repeat(65537)]) await assert.rejects(readAiJson(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body })));
  await rejects(queryAiMeasurements(db, identity.userId, new URLSearchParams({ user_id: "other" })), "invalid_input");
  assert.equal(aiConfirmationUrl(new Request("http://localhost:3000/api/v1/measurement-operations", { headers: { Host: "127.0.0.1:4567" } }), "/dashboard/ai/operations/fictional"), "http://127.0.0.1:4567/dashboard/ai/operations/fictional");
});

test("预览后令牌过期拒绝确认；旧版本、旧晨间条件、软删除不被绕过", async () => {
  const { identity, userId, actor } = await owner();
  const operation = await submitAiMeasurementOperation(db, identity, input());
  await db.update(schema.aiToken).set({ expiresAt: new Date(0) }).where(eq(schema.aiToken.id, identity.tokenId));
  await rejects(confirm(identity, operation.id), "invalid_token");
  const next = await createAiToken(db, userId, "虚构新令牌", "write"), activeIdentity = await authenticateAi(db, `Bearer ${next.rawToken}`);
  await saveReportedMeasurements(db, { ...actor, requestKey: "e".repeat(64), entryChannel: "manual", deviceLabel: "虚构秤", records: [{ recordDate: "2024-04-04", period: "daytime", weightKg: "70.20", bodyFatPercent: null, fasting: null }] });
  const old = (await listMeasurements(db, userId))[0];
  await assert.rejects(submitAiMeasurementOperation(db, activeIdentity, input({ daytime: { recordId: old.id, version: old.updatedAt.toISOString(), fasting: true, bodyFatPercent: "20.10" } })), /只读/);
  await assert.rejects(submitAiMeasurementOperation(db, activeIdentity, input({ daytime: { recordId: old.id, version: new Date(0).toISOString(), weightKg: "71.00" } })), /变化/);
  await db.update(schema.measurement).set({ deletedAt: new Date() }).where(eq(schema.measurement.id, old.id));
  const deleted = await submitAiMeasurementOperation(db, activeIdentity, input()); assert.equal(deleted.preview.canConfirm, false); assert.equal(deleted.preview.rows[0].state, "duplicate");
  assert.deepEqual(await listMeasurements(db, userId), []);
});

test("来源修改保留准确跨午夜时间，查询候选只影响本次分析", async () => {
  const { identity, userId, actor } = await owner();
  await saveReportedMeasurements(db, { ...actor, requestKey: "f".repeat(64), entryChannel: "manual", deviceLabel: "虚构秤", records: [{ recordDate: "2024-04-04", period: "evening", weightKg: "70.20", bodyFatPercent: null, fasting: false, measuredAt: "2024-04-05 00:30:00", timezone: "Asia/Shanghai" }] });
  const row = (await listMeasurements(db, userId))[0];
  const change = await submitAiMeasurementOperation(db, identity, input({ evening: { recordId: row.id, version: row.updatedAt.toISOString(), deviceLabel: "虚构新来源" } })); await confirm(identity, change.id);
  const after = (await listMeasurements(db, userId))[0]; assert.equal(after.sourceLocalTime, row.sourceLocalTime); assert.equal(after.occurredAt!.toISOString(), row.occurredAt!.toISOString()); assert.equal(after.timezone, row.timezone); assert.equal(after.entryChannel, "manual"); assert.deepEqual(after.originalValues, row.originalValues);
  await db.insert(schema.measurement).values({ ...after, id: randomUUID(), weightKg: "70.30", deduplicationKey: "b".repeat(64) });
  const undecided = await queryAiMeasurements(db, userId, new URLSearchParams()); assert.equal(undecided.analyses.weightKg.days[0].needsSelection, true);
  const chosen = await queryAiMeasurements(db, userId, new URLSearchParams({ choices: JSON.stringify({ "2024-04-04:evening": row.id }) })); assert.equal(chosen.analyses.weightKg.days[0].evening!.id, row.id); assert.equal(chosen.analyses.weightKg.days[0].needsSelection, false);
  assert.equal((await queryAiMeasurements(db, userId, new URLSearchParams())).analyses.weightKg.days[0].needsSelection, true);
});
