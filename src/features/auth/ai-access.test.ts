import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "../../db/client";
import * as schema from "../../db/schema";
import { seedAiAccessFixture } from "../../../tests/ai-access-fixture";
import { loadAiAccessOverview } from "./ai-access-overview";
import { aiAccessSummary, aiConnectionState, aiSubmissionState } from "./ai-access-model";
import { requireOauthConnection, revokeOauthConnection } from "./oauth-connections";
import { submitAiMeasurementOperation, reviewAiMeasurementOperation } from "../measurements/ai-operations";
import { randomUUID } from "node:crypto";

const pg = new PGlite(), db = drizzle(pg, { schema }) as unknown as Database;
let fixture: Awaited<ReturnType<typeof seedAiAccessFixture>>;
before(async () => { await migrate(db as never, { migrationsFolder: "./drizzle" }); fixture = await seedAiAccessFixture(db); });
after(async () => { await pg.close(); });

test("AI 设置按当前同意显示四类有效权限，旧 scope 不自动扩权，只读正常", async () => {
  const data = await loadAiAccessOverview(db, fixture.userId);
  const partial = data.connections.find(row => row.id === fixture.gpt.id)!;
  assert.equal(partial.provider, "chatgpt"); assert.equal(partial.state, "connected");
  assert.ok(partial.grantedScopes.includes("meals:write")); assert.ok(!partial.scopes.includes("meals:write"));
  await assert.rejects(requireOauthConnection(db, fixture.userId, fixture.gpt.id, true, "meals"), /不包含/);
  assert.equal(aiAccessSummary(data.connections.find(row => row.id === fixture.readonly.id)!.scopes), "只读");
  for (const [id, state] of [[fixture.expired.id, "expired"], [fixture.disabled.id, "disabled"], [fixture.noConsent.id, "unauthorized"], [fixture.retired.id, "revoked"]]) {
    const connection = data.connections.find(row => row.id === id)!;
    assert.equal(connection.state, state); assert.deepEqual(connection.scopes, []);
  }
  assert.equal(data.connections.find(row => row.id === fixture.doubao.id)!.provider, "doubao");
  assert.ok(!JSON.stringify(data).includes(fixture.token.rawToken));
});
test("统一、混合、纯训练和旧提交从原授权追溯来源，按时间混排并排除初始化", async () => {
  const { submissions } = await loadAiAccessOverview(db, fixture.userId);
  const get = (id: string) => submissions.find(row => row.id === id)!;
  assert.equal(get(fixture.unified.id).source.label, "ChatGPT");
  assert.equal(get(fixture.mixed.id).source.label, "豆包 · Formward");
  assert.equal(get(fixture.training.id).source.key, "chatgpt");
  assert.ok(Date.parse(get(fixture.training.id).expiresAt!) - Date.parse(get(fixture.training.id).createdAt) > 23 * 3600000);
  assert.equal(get(fixture.saved.id).status, "confirmed");
  assert.equal(get(fixture.legacy.id).source.label, "豆包 · Formward", "撤销后仍保留发起来源");
  assert.equal(get(fixture.legacyMeal.id).source.label, "手动接入 · 虚构本地助手");
  assert.equal(get(fixture.unknown.id).source.label, "来源未知");
  assert.ok(!submissions.some(row => row.id === fixture.initialization.id));
  assert.equal(submissions.length, 7, "统一批次的业务子操作不重复展示");
  assert.ok(submissions.every((row, i) => !i || Date.parse(submissions[i - 1].createdAt) >= Date.parse(row.createdAt)));
});
test("AI 设置空账号与跨账号读取隔离，其他账号凭据名称不泄露", async () => {
  assert.deepEqual(await loadAiAccessOverview(db, fixture.emptyId), { connections: [], submissions: [], tokens: [] });
  const data = await loadAiAccessOverview(db, fixture.userId);
  assert.ok(!JSON.stringify(data).includes("不能泄露的其他账号"));
  await assert.rejects(requireOauthConnection(db, fixture.otherId, fixture.gpt.id), /无效/);
  await assert.rejects(revokeOauthConnection(db, fixture.otherId, fixture.gpt.id), /不存在/);
});
test("旧批次部分保存和混合结束保留已保存数量，不误称全部保存或无需保存", async () => {
  const preview = await submitAiMeasurementOperation(db, fixture.gpt.identity, { kind: "batch", operationId: randomUUID(), items: ["2026-10-24", "2026-10-25"].map(date => ({ kind: "save_record", date, period: "evening", weightKg: "70.00", deviceLabel: "虚构秤", timezone: "+08:00" })) });
  const partial = await reviewAiMeasurementOperation(db, fixture.userId, preview.id, { kind: "confirm", revision: preview.revision, itemIds: [preview.items[0].id] });
  let submission = (await loadAiAccessOverview(db, fixture.userId)).submissions.find(row => row.id === preview.id)!;
  assert.equal(submission.status, "partially_confirmed"); assert.match(submission.summary, /已保存 1 条/); assert.equal(aiSubmissionState(submission, Date.now()), "pending");
  await reviewAiMeasurementOperation(db, fixture.userId, preview.id, { kind: "cancel", revision: partial.revision, itemIds: [preview.items[1].id] });
  submission = (await loadAiAccessOverview(db, fixture.userId)).submissions.find(row => row.id === preview.id)!;
  assert.equal(submission.status, "completed"); assert.match(submission.summary, /已保存 1 条/);
});
test("连接和不同有效期的预览随时钟失效，已保存不被到期覆盖；撤销立即生效", async () => {
  const data = await loadAiAccessOverview(db, fixture.userId), connection = data.connections.find(row => row.id === fixture.doubao.id)!;
  assert.equal(aiConnectionState(connection, Date.parse(connection.expiresAt) + 1), "expired");
  const training = data.submissions.find(row => row.id === fixture.training.id)!;
  assert.equal(aiSubmissionState(training, Date.parse(training.createdAt) + 3600000), "pending");
  assert.equal(aiSubmissionState(training, Date.parse(training.expiresAt!) + 1), "expired");
  assert.equal(aiSubmissionState(data.submissions.find(row => row.id === fixture.saved.id)!, Date.now() + 86400000), "confirmed");
  await revokeOauthConnection(db, fixture.userId, fixture.doubao.id);
  await revokeOauthConnection(db, fixture.userId, fixture.doubao.id);
  await assert.rejects(requireOauthConnection(db, fixture.userId, fixture.doubao.id), /撤销/);
  const revoked = (await loadAiAccessOverview(db, fixture.userId)).connections.find(row => row.id === fixture.doubao.id)!;
  assert.equal(revoked.state, "revoked"); assert.deepEqual(revoked.scopes, []);
});
