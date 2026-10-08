import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { authenticateAi, createAiToken, listAiTokens, revokeAiToken, type AiIdentity } from "../auth/ai-tokens";
import { decideAiMeasurementOperation, getAiMeasurementOperation, parseAiMeasurementInput, submitAiMeasurementOperation } from "./ai-operations";
import { aiApiResponse, aiConfirmationUrl, queryAiMeasurements, readAiJson } from "./ai-api";
import { listMeasurements, saveReportedMeasurements } from "./records";
import { entryMetrics, entryPeriods } from "./entry-state";
import { saveMeasurementDay } from "./editing";
import { applyHistoricalInitialization, previewHistoricalInitialization } from "./initialization";

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
  for (const body of ["{", "x".repeat(16385)]) await assert.rejects(readAiJson(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body })));
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
