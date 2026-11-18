import { eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Database } from "../../db/client";
import { securityEvent, user, membershipPlan } from "../../db/schema";
import { requireSessionProof, ADMIN_VERIFICATION_MS, type SessionProof } from "../auth/account-security";
import { accountEntitlements } from "../auth/entitlements";
import { globalBudget } from "../assistant/global-budget";
import { securityDay } from "../auth/security-usage";
import { emptyCost, normalizeAdminFilter, shiftDate, type AdminFilter, type CostMetrics, type RecordCount } from "./model";
import { ApiError } from "../auth/ai-identity";
import { membershipSnapshot } from "./memberships";
import { accountMembershipId } from "../auth/membership-policy";
import { z } from "zod";

export async function adminRows<T extends Record<string, unknown>>(db: Database, query: SQL): Promise<T[]> {
  const result = await db.execute<T>(query);
  return Array.isArray(result) ? result : (result as unknown as { rows: T[] }).rows;
}
function costSql() {
  return sql`coalesce(sum(CASE WHEN a.state='settled' THEN a.cost_cny ELSE 0 END),0)::text AS spent,
    coalesce(sum(CASE WHEN a.state='reserved' THEN a.reserved_cny ELSE 0 END),0)::text AS reserved,
    coalesce(sum(CASE WHEN a.state='unknown' OR (a.state='settled' AND a.cost_cny IS NULL) THEN a.reserved_cny ELSE 0 END),0)::text AS uncertain,
    count(*)::int AS requests,
    sum(CASE WHEN (a.usage->>'prompt_tokens') ~ '^[0-9]+$' THEN (a.usage->>'prompt_tokens')::numeric END)::text AS input,
    sum(CASE WHEN coalesce(a.usage->'prompt_tokens_details'->>'cached_tokens',a.usage->>'prompt_cache_hit_tokens') ~ '^[0-9]+$' THEN coalesce(a.usage->'prompt_tokens_details'->>'cached_tokens',a.usage->>'prompt_cache_hit_tokens')::numeric END)::text AS cached,
    sum(CASE WHEN (a.usage->>'completion_tokens') ~ '^[0-9]+$' THEN (a.usage->>'completion_tokens')::numeric END)::text AS output,
    count(*) FILTER (WHERE a.usage IS NULL OR NOT coalesce((a.usage->>'prompt_tokens') ~ '^[0-9]+$' AND (a.usage->>'completion_tokens') ~ '^[0-9]+$',false))::int AS "unknownUsage"`;
}
const joins = sql`FROM assistant_usage_requests a JOIN assistant_runs r ON r.id=a.run_id AND r.user_id=a.user_id JOIN assistant_conversations c ON c.id=r.conversation_id AND c.user_id=r.user_id`;
function feeWhere(filter: ReturnType<typeof normalizeAdminFilter>) {
  return sql`a.date BETWEEN ${filter.from}::date AND ${filter.to}::date ${filter.userId ? sql`AND a.user_id=${filter.userId}` : sql``} ${filter.provider ? sql`AND a.provider=${filter.provider}` : sql``} ${filter.purpose ? sql`AND c.purpose=${filter.purpose}` : sql``} ${filter.model ? sql`AND r.model=${filter.model}` : sql``}`;
}
export type DayGroup = CostMetrics & { date:string; key:string; label:string; provider:string|null; groups:number };
/** 每日仅预取前三位，悬停不发请求；完整明细另按50行读取。 */
async function dailyHighlights(db:Database,filter:ReturnType<typeof normalizeAdminFilter>) {
  const models=await adminRows<DayGroup>(db,sql`WITH grouped AS (
    SELECT a.date::text AS date,a.provider||':'||r.model AS key,r.model AS label,a.provider,${costSql()} ${joins} WHERE ${feeWhere(filter)} GROUP BY a.date,a.provider,r.model
  ), ranked AS (SELECT *,count(*)OVER(PARTITION BY date)::int AS groups,row_number()OVER(PARTITION BY date ORDER BY spent::numeric DESC,requests DESC,key) AS rank FROM grouped) SELECT * FROM ranked WHERE rank<=3 ORDER BY date,rank`);
  const users=filter.userId?[]:await adminRows<DayGroup>(db,sql`WITH grouped AS (
    SELECT a.date::text AS date,a.user_id AS key,max(u.email) AS label,NULL::text AS provider,${costSql()} ${joins} JOIN users u ON u.id=a.user_id WHERE ${feeWhere(filter)} GROUP BY a.date,a.user_id
  ), ranked AS (SELECT *,count(*)OVER(PARTITION BY date)::int AS groups,row_number()OVER(PARTITION BY date ORDER BY spent::numeric DESC,requests DESC,key) AS rank FROM grouped) SELECT * FROM ranked WHERE rank<=3 ORDER BY date,rank`);
  return {models,users};
}
const dayOptions=z.object({dimension:z.enum(["users","models"]),page:z.number().int().min(1).max(200)}).strict();
export async function loadAdminDay(db:Database,proof:SessionProof,input:AdminFilter,options:{dimension:"users"|"models";page:number}) {
  const parsed=dayOptions.safeParse(options);if(!parsed.success)throw new ApiError(400,"invalid_filter","明细条件无效。");
  const filter=normalizeAdminFilter(input);if(filter.from!==filter.to)throw new ApiError(400,"invalid_filter","请选择一天查看明细。");
  await requireSessionProof(db,proof,true);
  const result=await db.transaction(async tx=>{
    const connection=tx as unknown as Database,where=feeWhere(filter),dimension=parsed.data.dimension;
    const [total]=await adminRows<CostMetrics>(connection,sql`SELECT ${costSql()} ${joins} WHERE ${where}`);
    const columns=dimension==="users"?sql`a.user_id AS key,max(u.email) AS label,NULL::text AS provider`:sql`a.provider||':'||r.model AS key,r.model AS label,a.provider`;
    const group=dimension==="users"?sql`a.user_id`:sql`a.provider,r.model`;
    const rows=await adminRows<DayGroup>(connection,sql`SELECT ${filter.from}::text AS date,${columns},count(*)OVER()::int AS groups,${costSql()} ${joins} JOIN users u ON u.id=a.user_id WHERE ${where} GROUP BY ${group} ORDER BY sum(CASE WHEN a.state='settled' THEN a.cost_cny ELSE 0 END) DESC NULLS LAST,count(*) DESC,key LIMIT 50 OFFSET ${(parsed.data.page-1)*50}`);
    return {date:filter.from,dimension,page:parsed.data.page,rows,total:total??emptyCost(),count:rows[0]?.groups??0};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
  await requireSessionProof(db,proof,true);return result;
}
export type AdminDayData=Awaited<ReturnType<typeof loadAdminDay>>;
const facts = sql`SELECT user_id,id,created_at,'餐次'::text AS kind,0::bigint AS bytes FROM meals WHERE deleted_at IS NULL
  UNION ALL SELECT user_id,id,created_at,'实测身体记录',0 FROM (SELECT DISTINCT ON (user_id,record_date,period) user_id,id,created_at FROM measurements WHERE deleted_at IS NULL AND record_kind='observed' ORDER BY user_id,record_date,period,updated_at DESC,id DESC) observed
  UNION ALL SELECT user_id,id,created_at,'消耗记录日',0 FROM energy_days WHERE deleted_at IS NULL
  UNION ALL SELECT user_id,id,created_at,'运动记录',0 FROM activities WHERE deleted_at IS NULL
  UNION ALL SELECT user_id,id,created_at,'已完成训练',0 FROM training_sessions WHERE status='completed'
  UNION ALL SELECT user_id,id,created_at,'食材',0 FROM foods WHERE deleted_at IS NULL
  UNION ALL SELECT user_id,id,created_at,'训练计划',0 FROM training_plans
  UNION ALL SELECT user_id,id,created_at,'训练模板',0 FROM training_templates
  UNION ALL SELECT user_id,id,created_at,'已登记图片',byte_size FROM meal_images`;
async function readAdminSecurity(db: Database) {
  const failures=await adminRows<{userId:string|null;count:number}>(db,sql`SELECT user_id AS "userId",count(*)::int AS count FROM security_events WHERE category IN ('authentication_failed','verification_failed') AND created_at>now()-interval '10 minutes' GROUP BY user_id,source_hash HAVING count(*)>=3 ORDER BY count(*) DESC LIMIT 20`);
  const events = await db.select({ id: securityEvent.id, category: securityEvent.category, userId: securityEvent.userId, details: securityEvent.details, createdAt: securityEvent.createdAt }).from(securityEvent).orderBy(sql`${securityEvent.createdAt} DESC`).limit(50);
  return { failures, events: events.map(event => ({ ...event, createdAt: event.createdAt.toISOString() })) };
}

async function queryAdminSnapshot(db: Database, proof: SessionProof, input: AdminFilter = {}) {
  const verified = await requireSessionProof(db, proof, true), filter = normalizeAdminFilter(input), today = securityDay();
  if (filter.userId && !(await db.select({ id: user.id }).from(user).where(eq(user.id, filter.userId))).length) throw new ApiError(404, "not_found", "用户不存在。");
  const where = feeWhere(filter);
  const [totals] = await adminRows<CostMetrics>(db, sql`SELECT ${costSql()} ${joins} WHERE ${where}`);
  const dayRows = await adminRows<CostMetrics & { date: string }>(db, sql`SELECT a.date::text AS date,${costSql()} ${joins} WHERE ${where} GROUP BY a.date ORDER BY a.date`);
  const userCosts = await adminRows<CostMetrics & { userId: string }>(db, sql`SELECT a.user_id AS "userId",${costSql()} ${joins} WHERE ${where} GROUP BY a.user_id`);
  const [coverage] = await adminRows<{ from: string | null }>(db, sql`SELECT min(date)::text AS "from" FROM assistant_usage_requests`);
  const records = await adminRows<RecordCount & { userId: string }>(db, sql`SELECT user_id AS "userId",kind,count(*)::int AS total,
    count(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Shanghai')::date BETWEEN ${filter.from}::date AND ${filter.to}::date)::int AS added,
    coalesce(sum(bytes),0)::text AS bytes FROM (${facts}) facts WHERE true ${filter.userId ? sql`AND user_id=${filter.userId}` : sql``} GROUP BY user_id,kind`);
  const memberships=await membershipSnapshot(db),policies=await db.select().from(membershipPlan);
  const people = await db.select({ id: user.id, email: user.email, name: user.name, role: user.role, banned: user.banned, banReason:user.banReason, membershipTier: user.membershipTier, membershipTierId:user.membershipTierId, entitlementVersion: user.entitlementVersion, aiPaused: user.aiPaused, aiDailyBudgetCents: user.aiDailyBudgetCents, aiDailyRecognitionLimit: user.aiDailyRecognitionLimit, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt }).from(user).limit(10001);
  if (people.length > 10000) throw new ApiError(400, "narrow_filter", "用户较多，请先选择具体用户。");
  const currentCosts = await adminRows<{ userId: string; used: string }>(db, sql`SELECT user_id AS "userId",coalesce(sum(CASE WHEN state='settled' AND cost_cny IS NOT NULL THEN cost_cny ELSE reserved_cny END),0)::text AS used FROM assistant_usage_requests WHERE date=${today}::date GROUP BY user_id`);
  const summaryRecords = [...new Set(records.map(row => row.kind))].map(kind => ({ kind, total: records.filter(r => r.kind === kind).reduce((n,r) => n + r.total,0), added: records.filter(r => r.kind === kind).reduce((n,r) => n + r.added,0), bytes: records.filter(r => r.kind === kind).reduce((n,r) => n + BigInt(r.bytes),BigInt(0)).toString() }));
  let users = people.filter(person => (!filter.userId || person.id === filter.userId) && (!filter.search || `${person.email} ${person.name}`.toLowerCase().includes(filter.search.toLowerCase()))).map(person => {
    const membershipId=accountMembershipId(person),policy=policies.find(plan=>plan.id===membershipId);
    const entitled={...person,membershipPolicy:policy};
    const entitlement = accountEntitlements(entitled), defaults = accountEntitlements({...entitled, aiDailyBudgetCents:null, aiDailyRecognitionLimit:null}), cost = userCosts.find(row => row.userId === person.id) ?? emptyCost();
    const personalRecords = records.filter(row => row.userId === person.id);
    return { ...person, createdAt: person.createdAt.toISOString(), lastLoginAt: person.lastLoginAt?.toISOString() ?? null,
      membershipId,membershipName:entitlement.label,membershipActive:!!policy?.active&&!policy.archivedAt,
      cost, records: personalRecords, recordCount: personalRecords.filter(row => !["食材","训练计划","训练模板","已登记图片"].includes(row.kind)).reduce((sum,row) => sum + row.total,0),
      dailyBudget: entitlement.amountLimited ? entitlement.dailyBudgetCny : null, dailyRecognitionLimit: entitlement.dailyRecognitionLimit,
      defaultDailyBudget: defaults.amountLimited ? defaults.dailyBudgetCny : null, defaultDailyRecognitionLimit: defaults.dailyRecognitionLimit,
      todayUsed: currentCosts.find(row => row.userId === person.id)?.used ?? "0" };
  });
  users = users.sort((a,b) => (filter.sort === "email" ? a.email.localeCompare(b.email) : filter.sort === "records" ? b.recordCount - a.recordCount : filter.sort === "requests" ? b.cost.requests - a.cost.requests : Number(b.cost.spent) - Number(a.cost.spent)) || a.id.localeCompare(b.id));
  const count = users.length; users = users.slice((filter.page-1)*50,filter.page*50);
  const days = Array.from({ length: Math.round((Date.parse(filter.to)-Date.parse(filter.from))/86400000)+1 },(_,i) => { const date=shiftDate(filter.from,i); return { date, ...(dayRows.find(row => row.date === date) ?? emptyCost()), covered: coverage.from !== null && date >= coverage.from }; });
  const [tasks] = await adminRows<{ count: number; users: number }>(db, sql`SELECT count(DISTINCT (r.user_id,CASE WHEN c.purpose='meal_entry' THEN coalesce(r.recognition_id,r.user_message_id) ELSE r.user_message_id END))::int AS count,count(DISTINCT r.user_id)::int AS users FROM assistant_runs r JOIN assistant_conversations c ON c.id=r.conversation_id AND c.user_id=r.user_id JOIN assistant_messages m ON m.id=r.user_message_id AND m.user_id=r.user_id LEFT JOIN assistant_recognitions x ON x.id=r.recognition_id AND x.user_id=r.user_id WHERE (coalesce(x.created_at,m.created_at) AT TIME ZONE 'Asia/Shanghai')::date BETWEEN ${filter.from}::date AND ${filter.to}::date ${filter.userId ? sql`AND r.user_id=${filter.userId}`:sql``} ${filter.provider ? sql`AND r.provider=${filter.provider}`:sql``} ${filter.purpose ? sql`AND c.purpose=${filter.purpose}`:sql``} ${filter.model?sql`AND r.model=${filter.model}`:sql``}`);
  tasks.users=userCosts.length;
  const recognition = await adminRows<{ state: string; count: number }>(db, sql`SELECT state,count(*)::int AS count FROM assistant_recognitions x WHERE date BETWEEN ${filter.from}::date AND ${filter.to}::date ${filter.userId ? sql`AND user_id=${filter.userId}`:sql``} ${filter.provider||filter.model ? sql`AND EXISTS (SELECT 1 FROM assistant_runs r WHERE r.recognition_id=x.id ${filter.provider?sql`AND r.provider=${filter.provider}`:sql``} ${filter.model?sql`AND r.model=${filter.model}`:sql``})`:sql``} ${filter.purpose === "chat" ? sql`AND false`:sql``} GROUP BY state`);
  const [api] = await adminRows<{ requests: number; failures: number }>(db, sql`SELECT coalesce(sum(requests),0)::int AS requests,coalesce(sum(failures),0)::int AS failures FROM api_daily_usage WHERE date BETWEEN ${filter.from}::date AND ${filter.to}::date ${filter.userId ? sql`AND user_id=${filter.userId}`:sql``}`);
  const apiChannels=await adminRows<{channel:string;requests:number;failures:number}>(db,sql`SELECT channel,sum(requests)::int AS requests,sum(failures)::int AS failures FROM api_daily_usage WHERE date BETWEEN ${filter.from}::date AND ${filter.to}::date ${filter.userId?sql`AND user_id=${filter.userId}`:sql``} GROUP BY channel ORDER BY channel`);
  const breakdown=await adminRows<CostMetrics&{provider:string;model:string;purpose:string;state:string}>(db,sql`SELECT a.provider,r.model,c.purpose,a.state,${costSql()} ${joins} WHERE ${where} GROUP BY a.provider,r.model,c.purpose,a.state ORDER BY a.provider,r.model,c.purpose,a.state`);
  const modelOptions=await adminRows<{provider:string;model:string}>(db,sql`SELECT DISTINCT a.provider,r.model ${joins} WHERE a.date BETWEEN ${filter.from}::date AND ${filter.to}::date ${filter.userId?sql`AND a.user_id=${filter.userId}`:sql``} ORDER BY a.provider,r.model LIMIT 200`);
  const highlights=await dailyHighlights(db,filter);
  const {failures,events}=await readAdminSecurity(db);
  // 查询结束再次检查撤销与管理验证，迟到响应不能返回已锁定的管理数据。
  await requireSessionProof(db, proof, true);
  return { filter, verifiedUntil: new Date(verified.session.adminVerifiedAt!.getTime()+ADMIN_VERIFICATION_MS).toISOString(), totals: totals ?? emptyCost(), days, users, memberships, modelOptions, highlights, userCount: count,
    userOptions: people.map(person => ({ id: person.id, email: person.email })), records: summaryRecords, tasks, recognition, api: filter.provider || filter.model || filter.purpose ? null : api, global: await globalBudget(db), coverageStart: coverage.from,
    apiChannels:filter.provider||filter.model||filter.purpose?null:apiChannels,breakdown,failures,events, generatedAt: new Date().toISOString() };
}
export async function loadAdminConsole(db:Database,proof:SessionProof,input:AdminFilter={}):Promise<Awaited<ReturnType<typeof queryAdminSnapshot>>>{
  await requireSessionProof(db,proof,true);
  const result=await db.transaction(tx=>queryAdminSnapshot(tx as unknown as Database,proof,input),{isolationLevel:"repeatable read",accessMode:"read only"});
  // 快照内金额与明细一致；快照外重查撤销，不能使用旧快照证明当前权限。
  await requireSessionProof(db,proof,true);return result as Awaited<ReturnType<typeof queryAdminSnapshot>>;
}
export type AdminConsoleData = Awaited<ReturnType<typeof loadAdminConsole>>;

type SectionSnapshot = {verifiedUntil:string} & (
  { memberships: Awaited<ReturnType<typeof membershipSnapshot>> } |
  (Awaited<ReturnType<typeof readAdminSecurity>> & { userOptions: {id:string;email:string}[] })
);
export async function loadAdminSection(db:Database,proof:SessionProof,section:"rules"|"security"):Promise<SectionSnapshot>{
  if(section!=="rules"&&section!=="security")throw new ApiError(400,"invalid_filter","管理栏目无效。");
  await requireSessionProof(db,proof,true);
  const result=await db.transaction(async tx=>{
    const connection=tx as unknown as Database;
    const {session}=await requireSessionProof(connection,proof,true);
    const verifiedUntil=new Date(session.adminVerifiedAt!.getTime()+ADMIN_VERIFICATION_MS).toISOString();
    if(section==="rules")return {verifiedUntil,memberships:await membershipSnapshot(connection)};
    const {events,failures}=await readAdminSecurity(connection);
    const ids=[...new Set(events.flatMap(event=>event.userId?[event.userId]:[]))];
    const userOptions=ids.length?await connection.select({id:user.id,email:user.email}).from(user).where(inArray(user.id,ids)):[];
    return {verifiedUntil,events,failures,userOptions};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
  await requireSessionProof(db,proof,true);
  return result;
}
