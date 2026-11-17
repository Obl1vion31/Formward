import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client";
import { assistantConnection, energyOperation, mealOperation, measurementOperation, recordOperation, trainingTemplate } from "../../db/schema";
import { mealTypeLabel } from "../meals/model";
import { chatProviders, providerId } from "../assistant/chat-config";
import { listAiMeasurementOperations } from "../measurements/ai-operations";
import { listMealOperations } from "../meals/records";
import { listRecordOperations } from "../records/operations";
import { category } from "../records/model";
import { isTraining } from "../training/ai-model";
import { listAiTokens } from "./ai-tokens";
import { listOauthConnections } from "./oauth-connections";
import type { AiAccessConnection, AiAccessOverview, AiSubmission, AiSubmissionSource } from "./ai-access-model";

type Grant = { tokenId?: string | null; oauthConnectionId?: string | null };
const unknownSource: AiSubmissionSource = { key: "unknown", label: "来源未知", kind: "unknown" };

/** 仅供已登录的 AI 设置页读取。归属来自原操作授权，不使用最近连接或 AI 自报名称。 */
export async function loadAiAccessConnections(db: Database, userId: string): Promise<AiAccessConnection[]> {
  return (await listOauthConnections(db, userId)).map(row => ({
    id: row.id, name: row.name || "MCP 客户端", provider: row.provider, state: row.state,
    scopes: row.effectiveScopes, grantedScopes: row.scopes, authorizedAt: row.authorizedAt!.toISOString(),
    expiresAt: row.expiresAt.toISOString(), lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }));
}
export async function loadAiAccessOverview(db: Database, userId: string, existingConnections?: AiAccessConnection[]): Promise<AiAccessOverview> {
  // PGlite socket 与正式 PostgreSQL 共用此入口，顺序读取避免抢占同一连接。
  const connections = existingConnections ?? await loadAiAccessConnections(db, userId);
  const tokens = await listAiTokens(db, userId);
  const embedded = await db.select({ tokenId: assistantConnection.tokenId, provider: assistantConnection.provider }).from(assistantConnection).where(eq(assistantConnection.userId, userId));
  const unified = await listRecordOperations(db, userId);
  const bodies = (await listAiMeasurementOperations(db, userId)).filter(row => !unified.some(parent => parent.measurementOperationId === row.id));
  const meals = (await listMealOperations(db, userId)).filter(row => row.origin === "ai" && !unified.some(parent => parent.mealOperationId === row.id));
  const bodyIds = [...bodies.map(row => row.id), ...unified.flatMap(row => row.measurementOperationId ?? [])];
  const mealIds = [...meals.map(row => row.id), ...unified.flatMap(row => row.mealOperationId ?? [])];
  const energyIds = unified.flatMap(row => row.energyOperationId ?? []);
  const bodyGrants = bodyIds.length ? await db.select({ id: measurementOperation.id, tokenId: measurementOperation.tokenId, oauthConnectionId: measurementOperation.oauthConnectionId }).from(measurementOperation).where(and(eq(measurementOperation.userId, userId), inArray(measurementOperation.id, bodyIds))) : [];
  const mealGrants = mealIds.length ? await db.select({ id: mealOperation.id, tokenId: mealOperation.tokenId, oauthConnectionId: mealOperation.oauthConnectionId }).from(mealOperation).where(and(eq(mealOperation.userId, userId), inArray(mealOperation.id, mealIds))) : [];
  const energyGrants = energyIds.length ? await db.select({ id: energyOperation.id, tokenId: energyOperation.tokenId, oauthConnectionId: energyOperation.oauthConnectionId }).from(energyOperation).where(and(eq(energyOperation.userId, userId), inArray(energyOperation.id, energyIds))) : [];
  const parents = unified.length ? await db.select({ id: recordOperation.id, draft: recordOperation.draft }).from(recordOperation).where(and(eq(recordOperation.userId, userId), inArray(recordOperation.id, unified.map(row => row.id)))) : [];
  const templateIds = [...new Set(parents.flatMap(row => row.draft.flatMap(item => item.action.kind === "schedule_training" && item.action.templateId ? [item.action.templateId] : [])))];
  const templates = templateIds.length ? await db.select({ id: trainingTemplate.id, content: trainingTemplate.content }).from(trainingTemplate).where(and(eq(trainingTemplate.userId, userId), inArray(trainingTemplate.id, templateIds))) : [];

  function source(grants: (Grant | undefined)[]): AiSubmissionSource {
    if (!grants.length || grants.some(grant => !grant || Boolean(grant.tokenId) === Boolean(grant.oauthConnectionId))) return unknownSource;
    const keys = [...new Set(grants.map(grant => grant!.oauthConnectionId ? "oauth:" + grant!.oauthConnectionId : "token:" + grant!.tokenId))];
    if (keys.length !== 1) return unknownSource;
    const grant = grants[0]!;
    if (grant.oauthConnectionId) {
      const connection = connections.find(row => row.id === grant.oauthConnectionId);
      if (!connection) return unknownSource;
      return { key: connection.provider === "other" ? "oauth:" + connection.id : connection.provider, label: connection.name || "MCP 客户端", compactLabel: connection.provider === "doubao" ? "豆包" : connection.name || "MCP 客户端", kind: "oauth" };
    }
    const internal = embedded.find(row => row.tokenId === grant.tokenId);
    if (internal) { const label = chatProviders[providerId(internal.provider)].label; return { key: "embedded:" + internal.provider, label: label + " · 站内助手", compactLabel: label, kind: "embedded" }; }
    const token = tokens.find(row => row.id === grant.tokenId);
    return token ? { key: "token:" + token.id, label: "手动接入 · " + token.name, kind: "token" } : unknownSource;
  }

  const displayKind=(value:string)=>value.replaceAll("摄入","饮食");
  const submissions: AiSubmission[] = unified.map(row => {
    const parent = parents.find(item => item.id === row.id);
    const grants: (Grant | undefined)[] = [
      ...(row.measurementOperationId ? [bodyGrants.find(item => item.id === row.measurementOperationId)] : []),
      ...(row.mealOperationId ? [mealGrants.find(item => item.id === row.mealOperationId)] : []),
      ...(row.energyOperationId ? [energyGrants.find(item => item.id === row.energyOperationId)] : []),
      ...(parent?.draft.filter(item => isTraining(item.action)).map(item => item.trainingGrant) ?? []),
    ];
    const dates = row.dates.map(date => date.slice(5)), date = dates.length > 1 ? `${dates[0]}—${dates.at(-1)}` : dates[0];
    const selected=parent?.draft.filter(item=>row.status==="confirmed"?item.persisted:row.status==="pending"?!item.excluded&&!item.persisted:true)??[];
    const details=selected.flatMap(item=>{
      const action=item.action;
      if(action.kind==="save_meal")return [mealTypeLabel(action.mealType)+" "+action.items.map(food=>food.name).filter(Boolean).join("、")];
      if(action.kind==="save_record")return [(action.period==="evening"?"晚间测量":"晨间测量")+(action.weightKg?" "+Number(action.weightKg)+"kg":"")];
      if(action.kind==="save_training_template")return [action.template.name];
      if(action.kind==="schedule_training"){
        const saved=item.trainingSaved?.after,reference=parent?.draft.find(candidate=>candidate.key===action.templateRef)?.action;
        const name=saved?("content" in saved?saved.content.name:saved.name):reference?.kind==="save_training_template"?reference.template.name:templates.find(template=>template.id===action.templateId)?.content.name;
        return [name??"训练排期"];
      }
      return [{body:"身体",meals:"饮食",foods:"食材库",energy:"消耗",training:"训练"}[category(action)]];
    });
    const distinctDetails=[...new Set(details)];
    const description=distinctDetails.length?distinctDetails.join("；"):displayKind(row.types.join("、")||"记录")+"·"+(row.status==="pending"?row.pendingCount:row.count)+"项";
    const ended=row.status==="pending"&&!row.pendingCount;
    return { id: row.id, source: source(grants), summary: displayKind(row.summary)+(distinctDetails.length?" · "+distinctDetails.join("；"):""), compactSummary: `${date ? date + " " : ""}${ended?"没有待保存内容":description}`, status: row.expired ? "expired" : ended?"completed":row.status, createdAt: row.createdAt, expiresAt: row.expiresAt, confirmationPath: row.confirmationPath };
  });
  submissions.push(...bodies.map(row => ({ id: row.id, source: source([bodyGrants.find(item => item.id === row.id)]), summary: `${row.preview.date} · 身体记录 · ${row.counts.total} 条${row.counts.saved && row.status !== "confirmed" ? ` · 已保存 ${row.counts.saved} 条` : ""}`, compactSummary: `${row.preview.date.slice(5)} 身体·${row.counts.total}条${row.counts.saved && row.status !== "confirmed" ? `·已存${row.counts.saved}条` : ""}`, status: row.status, createdAt: row.createdAt, expiresAt: row.expiresAt, confirmationPath: row.confirmationPath })));
  submissions.push(...meals.map(row => {
    const dates = [...new Set(row.rows.flatMap(item => item.meal?.date ?? (item.before && "date" in item.before ? item.before.date : [])))].sort();
    const date = dates.length > 1 ? `${dates[0]}—${dates.at(-1)}` : dates[0];
    const shortDates = dates.map(value => value.slice(5)), shortDate = shortDates.length > 1 ? `${shortDates[0]}—${shortDates.at(-1)}` : shortDates[0];
    return { id: row.id, source: source([mealGrants.find(item => item.id === row.id)]), summary: `${date ? date + " · " : ""}饮食与食材 · ${row.rows.length} 项`, compactSummary: `${shortDate ? shortDate + " " : ""}饮食·${row.rows.length}项`, status: row.status, createdAt: row.createdAt, expiresAt: row.expiresAt, confirmationPath: row.confirmationPath };
  }));
  submissions.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
  return { tokens: tokens.filter(token => !embedded.some(row => row.tokenId === token.id)), submissions, connections };
}
