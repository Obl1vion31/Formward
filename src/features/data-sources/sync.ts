import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { dataConnection, dataSourceFact, dataSourcePolicy, user } from "../../db/schema";
import { ApiError } from "../auth/ai-identity";
import { requireActiveAccount } from "../auth/account-security";
import { lockOwner } from "../auth/owner-lock";
import { capturePersonal, GarminError, sevenDays, type Capture } from "../garmin/client";
import { addCalendarDays } from "../measurements/calendar";
import { credentialRegion, decryptCredential } from "./credentials";
import { normalizeGarmin } from "./garmin-adapter";
import { adoptDate, recordActivityConflicts } from "./adoption";
import { requireSourceAccess, sourceEvent } from "./mutations";
import { fingerprint, readSourceState } from "./state";
import { sourceAccessEnabled, type SourceRecordChange } from "./model";
import { validDate } from "../garmin/model";

export type SyncResult = { status: "synced" | "fresh" | "busy" | "paused" | "discarded" | "failed"; changed: boolean; adoptedDates: string[]; changes?: SourceRecordChange[]; error?: string; loaded?: { from: string; to: string; days: number; activities: number } };
type Options = { manual?: boolean; background?: boolean; activate?: boolean; from?: string; now?: Date; signal?: AbortSignal; capture?: (input: Parameters<typeof capturePersonal>[0]) => Promise<Capture> };
const quiet = (status: SyncResult["status"]): SyncResult => ({ status, changed: false, adoptedDates: [] });
function syncMessage(error: unknown) { return error instanceof GarminError ? error.message : error instanceof ApiError && ["source_credential", "source_config"].includes(error.code) ? error.message : "同步未完成，已保留上次成功数据，请稍后重试。"; }

/** 连接行租约防止多个实例并发；网络请求不持有数据库锁。 */
export async function synchronizeSource(db: Database, userId: string, options: Options = {}): Promise<SyncResult> {
  requireSourceAccess(userId); const now = options.now ?? new Date();
  if (options.from && (!validDate(options.from) || options.from > sevenDays(now).to || (Date.parse(sevenDays(now).to) - Date.parse(options.from)) / 86400000 > 3660)) throw new ApiError(400, "invalid_range", "请选择有效的历史起始日期，范围最长十年。");
  const claim = await db.transaction(async tx => {
    await lockOwner(tx, userId); requireSourceAccess(userId);
    const owner = await requireActiveAccount(tx, userId);
    const [connection] = await tx.select().from(dataConnection).where(and(eq(dataConnection.userId, userId), eq(dataConnection.provider, "garmin-personal")));
    if (!connection || connection.status !== "active" || !connection.metrics.length || connection.accessVersion !== owner.accessVersion) return { skip: "paused" as const };
    if (connection.syncToken && connection.syncStartedAt && +now - +connection.syncStartedAt < 90000) return { skip: "busy" as const };
    if (connection.lastAttemptAt && +now - +connection.lastAttemptAt < (options.manual ? 15000 : 300000)) return { skip: "fresh" as const };
    const [policy] = await tx.select().from(dataSourcePolicy).where(eq(dataSourcePolicy.userId, userId));
    const token = randomUUID();
    await tx.update(dataConnection).set({ syncToken: token, syncStartedAt: now, lastAttemptAt: now }).where(and(eq(dataConnection.userId, userId), eq(dataConnection.id, connection.id)));
    return { connection, token, policyVersion: policy?.version ?? 0 };
  });
  if ("skip" in claim) return quiet(claim.skip!);
  const { connection, token, policyVersion } = claim;
  let capture: Capture | null = null, errorMessage: string | null = null;
  try {
    const key = decryptCredential(connection.credential, userId, connection.id), window = sevenDays(now, connection.timezone);
    const previous = connection.lastSuccessAt ? addCalendarDays(sevenDays(connection.lastSuccessAt, connection.timezone).to, -6) : window.from;
    const timeout = AbortSignal.timeout(50000);
    capture = await (options.capture ?? capturePersonal)({ apiKey: key, region: credentialRegion(connection.credential), timeZone: connection.timezone, now, from: options.from ?? (previous < window.from ? previous : window.from), daily: connection.metrics.some(m => m !== "activities"), activities: connection.metrics.includes("activities"), signal: options.signal ? AbortSignal.any([timeout, options.signal]) : timeout });
  } catch (error) { errorMessage = syncMessage(error); }
  const normalized = capture ? normalizeGarmin(capture, connection.metrics) : null;
  if (normalized?.issues.length) errorMessage = normalized.issues.join(" ").slice(0, 1200);
  const complete = !!normalized && normalized.dailyComplete && normalized.activitiesComplete;
  return db.transaction(async tx => {
    await lockOwner(tx, userId); requireSourceAccess(userId);
    const owner = await requireActiveAccount(tx, userId);
    const [current] = await tx.select().from(dataConnection).where(and(eq(dataConnection.userId, userId), eq(dataConnection.id, connection.id)));
    const [policy] = await tx.select().from(dataSourcePolicy).where(eq(dataSourcePolicy.userId, userId));
    if (!current || current.syncToken !== token || current.version !== connection.version || current.status !== "active" || current.accessVersion !== owner.accessVersion || (policy?.version ?? 0) !== policyVersion) {
      if (current?.syncToken === token) await tx.update(dataConnection).set({ syncToken: null, syncStartedAt: null }).where(and(eq(dataConnection.userId, userId), eq(dataConnection.id, connection.id)));
      return quiet("discarded");
    }
    let changed = false;
    const newActivityIds = new Set<string>(), readActivityIds = new Set(normalized?.facts.filter(f => f.kind === "activity").map(f => f.sourceRecordId) ?? []);
    const existing = await tx.select().from(dataSourceFact).where(and(eq(dataSourceFact.userId, userId), eq(dataSourceFact.connectionId, connection.id)));
    for (const fact of normalized?.facts ?? []) {
      const prior = existing.find(f => f.kind === fact.kind && f.sourceRecordId === fact.sourceRecordId);
      if (!prior && fact.kind === "activity") newActivityIds.add(fact.sourceRecordId);
      const digest = fingerprint({ credentialBinding:fingerprint(connection.credential), date: fact.date, occurredAt: fact.occurredAt, timezone: connection.timezone, payload: fact.payload });
      if (prior?.digest === digest) continue;
      const values = { date: fact.date, occurredAt: fact.occurredAt, timezone: connection.timezone, payload: fact.payload, digest, version: (prior?.version ?? 0) + 1, observedAt: now };
      if (prior) await tx.update(dataSourceFact).set(values).where(and(eq(dataSourceFact.userId, userId), eq(dataSourceFact.id, prior.id)));
      else await tx.insert(dataSourceFact).values({ id: randomUUID(), userId, connectionId: connection.id, kind: fact.kind, sourceRecordId: fact.sourceRecordId, ...values });
      changed = true;
    }
    await tx.update(dataConnection).set({lastError:errorMessage,...(complete?{lastSuccessAt:now}:{}),...(options.activate && normalized?.facts.length ? {adoptedAt:current.adoptedAt??now}:{})}).where(and(eq(dataConnection.userId,userId),eq(dataConnection.id,connection.id)));
    let state = await readSourceState(tx, userId, now);
    await recordActivityConflicts(tx, userId, state);
    state = await readSourceState(tx, userId, now);
    const adoptedDates: string[] = [], changes:SourceRecordChange[]=[], applicationIssues:string[]=[];
    const affectedDates = [...new Set(normalized?.facts.map(f => f.date) ?? [])].sort();
    for (const date of affectedDates) if (await adoptDate(tx, userId, state, date, { force: false, independent:true, historical:!!options.from, newActivityIds, readActivityIds, issues:applicationIssues, actor: options.background ? "scheduled-sync" : "foreground-sync", changes })) adoptedDates.push(date);
    if(applicationIssues.length)errorMessage=[errorMessage,...new Set(applicationIssues)].filter(Boolean).join(" ").slice(0,1200);
    await tx.update(dataConnection).set({ syncToken: null, syncStartedAt: null, lastError: errorMessage, ...(complete ? { lastSuccessAt: now } : {}), updatedAt: now }).where(and(eq(dataConnection.userId, userId), eq(dataConnection.id, connection.id)));
    const loaded = capture ? {from:capture.window.from,to:capture.window.to,days:normalized?.facts.filter(f=>f.kind==="day").length??0,activities:readActivityIds.size} : undefined;
    await sourceEvent(tx, userId, connection.id, complete ? "sync" : "sync_partial", options.background ? "scheduler" : userId, { facts: normalized?.facts.length ?? 0, adoptedDates, complete, loaded, error: errorMessage });
    return { status: complete && !applicationIssues.length ? "synced" : "failed", changed: changed || adoptedDates.length > 0, adoptedDates, changes, ...(loaded?{loaded}:{}), ...(errorMessage ? { error: errorMessage } : {}) };
  });
}

/** 定时任务只枚举有效的本人连接；单个账号失败不阻断其他账号。 */
export async function synchronizeConnectedSources(db: Database, options: Pick<Options, "now" | "capture" | "signal"> = {}) {
  const connections = await db.select({ userId: dataConnection.userId, metrics: dataConnection.metrics }).from(dataConnection)
    .innerJoin(user, eq(dataConnection.userId, user.id))
    .where(and(eq(dataConnection.provider, "garmin-personal"), eq(dataConnection.status, "active"), eq(user.banned, false), eq(dataConnection.accessVersion, user.accessVersion)))
    .orderBy(sql`${dataConnection.lastAttemptAt} ASC NULLS FIRST`);
  const owners = connections.filter(connection => connection.metrics.length && sourceAccessEnabled(connection.userId));
  const deadline = AbortSignal.timeout(50000), signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline;
  let next = 0, processed = 0, failed = 0;
  await Promise.all(Array.from({ length: Math.min(3, owners.length) }, async () => {
    while (next < owners.length && !signal.aborted) {
      const owner = owners[next++];
      try { const result = await synchronizeSource(db, owner.userId, { ...options, signal, background: true }); if (result.status === "failed") failed++; }
      catch { failed++; }
      processed++;
    }
  }));
  const deferred = owners.length - processed;
  return { status: failed ? "failed" as const : deferred ? "partial" as const : "synced" as const, processed, failed, deferred };
}
