import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../src/db/client";
import * as schema from "../src/db/schema";
import { provisionAccount } from "../src/features/auth/provision";
import { createAiToken } from "../src/features/auth/ai-tokens";
import { OAUTH_SCOPES, revokeOauthConnection } from "../src/features/auth/oauth-connections";
import { submitRecordOperation, reviewRecordOperation } from "../src/features/records/operations";
import { submitAiMeasurementOperation } from "../src/features/measurements/ai-operations";
import { submitMealOperation } from "../src/features/meals/records";

export async function fixtureAiConnection(db: Database, userId: string, name: string, options: { scopes?: string[]; consentScopes?: string[]; disabled?: boolean; noConsent?: boolean; provider?: string; expired?: boolean } = {}) {
  const id = randomUUID(), clientId = randomUUID(), now = new Date();
  const scopes = options.scopes ?? OAUTH_SCOPES;
  await db.insert(schema.oauthClient).values({ id: randomUUID(), clientId, name, redirectUris: ["https://fictional.example.test/callback"], requirePKCE: true, disabled: options.disabled ?? false, metadata: options.provider ? { provider: options.provider } : null });
  await db.insert(schema.oauthConnection).values({ id, userId, clientId, scopes, authorizedAt: new Date(now.getTime() - 3600000), createdAt: new Date(now.getTime() - 3600000), expiresAt: new Date(now.getTime() + (options.expired ? -60000 : 30 * 86400000)) });
  if (!options.noConsent) await db.insert(schema.oauthConsent).values({ id: randomUUID(), userId, clientId, referenceId: id, scopes: options.consentScopes ?? scopes, createdAt: now, updatedAt: now });
  return { id, clientId, identity: { userId, oauthConnectionId: id, permission: "write" as const } };
}

/** 只在隔离测试数据库调用；不读取环境配置，不接触正式账号。 */
export async function seedAiAccessFixture(db: Database) {
  const account = { email: "ai-settings@example.test", password: "fictional-ai-settings-password" };
  const empty = { email: "ai-empty@example.test", password: "fictional-ai-empty-password" };
  const other = { email: "ai-other@example.test", password: "fictional-ai-other-password" };
  const typical = { email: "ai-typical@example.test", password: "fictional-ai-typical-password" };
  const userId = (await provisionAccount(db, { ...account, name: "虚构 AI 设置用户" })).id;
  const emptyId = (await provisionAccount(db, empty)).id, otherId = (await provisionAccount(db, other)).id;
  for (const id of [userId, emptyId, otherId]) await db.delete(schema.personalProfile).where(eq(schema.personalProfile.userId, id));
  const typicalId = (await provisionAccount(db, typical)).id;
  await db.delete(schema.personalProfile).where(eq(schema.personalProfile.userId, typicalId));
  const typicalDoubao = await fixtureAiConnection(db, typicalId, "豆包 · Formward", { provider: "doubao" });
  await fixtureAiConnection(db, typicalId, "ChatGPT", { expired: true });
  const gpt = await fixtureAiConnection(db, userId, "ChatGPT", { consentScopes: ["measurements:read", "measurements:write", "training:read", "training:write"] });
  const readonly = await fixtureAiConnection(db, userId, "ChatGPT", { scopes: ["measurements:read", "meals:read", "energy:read", "training:read"] });
  const doubao = await fixtureAiConnection(db, userId, "豆包 · Formward", { provider: "doubao" });
  const expired = await fixtureAiConnection(db, userId, "ChatGPT", { expired: true });
  const disabled = await fixtureAiConnection(db, userId, "已停用的虚构客户端", { disabled: true });
  const noConsent = await fixtureAiConnection(db, userId, "授权缺失的虚构客户端", { noConsent: true });
  const retired = await fixtureAiConnection(db, userId, "豆包 · Formward", { provider: "doubao" });
  const token = await createAiToken(db, userId, "虚构本地助手", "write");
  const otherToken = await createAiToken(db, otherId, "不能泄露的其他账号令牌名称", "write");
  const identity = { userId, tokenId: token.token.id, permission: "write" as const };
  const body = (date: string) => ({ kind: "save_record" as const, date, period: "evening" as const, weightKg: "70.20", deviceLabel: "虚构秤", timezone: "+08:00" });
  const meal = (date: string) => ({ kind: "save_meal" as const, date, mealType: "lunch" as const, timezone: "+08:00", items: [{ kind: "food" as const, name: "虚构午餐", quantity: "1", unit: "份", nutrition: { caloriesKcal: "520", proteinG: "0", carbsG: null, fatG: null }, sourceKind: "unknown" as const }] });
  for (let index = 0; index < 5; index++) {
    const preview = await submitRecordOperation(db, typicalDoubao.identity, { operationId: randomUUID(), items: [{ key: "body", ...body(`2026-11-${String(10 - index).padStart(2, "0")}`) }] });
    if (index === 1 || index === 2) await reviewRecordOperation(db, typicalId, preview.id, { kind: "confirm", revision: preview.revision });
    if (index === 3) await reviewRecordOperation(db, typicalId, preview.id, { kind: "cancel", revision: preview.revision });
    if (index === 4) { const [parent] = await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.id, preview.id)); await db.update(schema.measurementOperation).set({ expiresAt: new Date(Date.now() - 60000) }).where(eq(schema.measurementOperation.id, parent.measurementOperationId!)); }
  }
  const unified = await submitRecordOperation(db, gpt.identity, { operationId: randomUUID(), items: [{ key: "body", ...body("2026-11-01") }] });
  const mixed = await submitRecordOperation(db, doubao.identity, { operationId: randomUUID(), items: [{ key: "body", ...body("2026-11-02") }, { key: "meal", ...meal("2026-11-02") }, { key: "energy", kind: "save_energy_day", date: "2026-11-02", timezone: "+08:00", entryMode: "total", totalKcal: "2100" }] });
  const training = await submitRecordOperation(db, gpt.identity, { operationId: randomUUID(), items: [{ key: "training", kind: "save_training_template", template: { name: "虚构训练模板", exercises: [{ name: "平板支撑", sets: 1, reps: null, recordingType: "duration", durationSeconds: 30 }] } }] });
  const saved = await submitRecordOperation(db, identity, { operationId: randomUUID(), items: [{ key: "body", ...body("2026-10-30") }] });
  await reviewRecordOperation(db, userId, saved.id, { kind: "confirm", revision: saved.revision });
  const legacy = await submitAiMeasurementOperation(db, retired.identity, { kind: "batch", operationId: randomUUID(), items: [body("2026-10-29")] });
  await revokeOauthConnection(db, userId, retired.id);
  const legacyMeal = await submitMealOperation(db, { userId, origin: "ai", identity }, { operationId: randomUUID(), actions: [meal("2026-10-28")] });
  const unknown = await submitAiMeasurementOperation(db, identity, { kind: "batch", operationId: randomUUID(), items: [body("2026-10-27")] });
  // 仅用于损坏历史归属回归：绝不能据其他账号凭据显示名称。
  await db.update(schema.measurementOperation).set({ tokenId: otherToken.token.id }).where(eq(schema.measurementOperation.id, unknown.id));
  const importId = randomUUID();
  await db.insert(schema.mealImport).values({ id: importId, userId, fileDigest: randomUUID(), sourceLabel: "虚构饮食初始化", originalRows: [], decisions: {}, createdBy: userId });
  const initialization = await submitMealOperation(db, { userId, origin: "initialization", importId }, { operationId: randomUUID(), actions: [meal("2026-10-26")] });
  return { account, empty, other, typical, userId, emptyId, otherId, typicalId, gpt, readonly, doubao, expired, disabled, noConsent, retired, token, unified, mixed, training, saved, legacy, legacyMeal, unknown, initialization };
}
