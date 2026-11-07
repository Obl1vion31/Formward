import { z } from "zod";

export const sourceMetrics = ["total", "resting", "active", "steps", "activities"] as const;
export type SourceMetric = typeof sourceMetrics[number];
export type SourceRecordChange = { key: string; version: string };
export const metricLabels: Record<SourceMetric, string> = { total: "总消耗", resting: "静息消耗", active: "活动消耗", steps: "步数", activities: "运动记录" };
export type MetricSources = Record<SourceMetric, string | null>;
export const emptySources = (): MetricSources => ({ total: null, resting: null, active: null, steps: null, activities: null });
export type SourcePolicy = { strategy: "total" | "components"; sources: MetricSources; effectiveFrom: string; version: number };
export type DailyFact = { kind: "day"; metrics?: SourceMetric[]; total: string | null; resting: string | null; active: string | null; steps: number | null; coverageUntil: string | null };
export type ActivityFact = { kind: "activity"; name: string; type: string | null; durationMinutes: string | null; caloriesKcal: string | null; bmrKcal: string | null; distanceMeters: number | null; averageHR: number | null; localTime: string | null; parentId: string | null; isParent: boolean };
export type SourceFact = DailyFact | ActivityFact;
export type AdoptionMetadata = { strategy: SourcePolicy["strategy"]; sources: MetricSources; facts: { connectionId: string; factId: string; version: number }[]; restingKcal: string | null; activeKcal: string | null; compositionKnown: boolean; coverageUntil: string | null; syncedAt: string; label: string };
export type EnergyAdoption = { mode: "source" | "manual"; metadata: AdoptionMetadata | null; protectedAt: string | null };
export const metricsSchema = z.array(z.enum(sourceMetrics)).max(5).refine(values => new Set(values).size === values.length, "同步内容不能重复。");
const sourceId = z.string().uuid().nullable();
export const policyInputSchema = z.object({ version: z.number().int().nonnegative(), strategy: z.enum(["total", "components"]), sources: z.object({ total: sourceId, resting: sourceId, active: sourceId, steps: sourceId, activities: sourceId }).strict() }).strict();
export const connectionInputSchema = z.object({ version: z.number().int().positive(), metrics: metricsSchema, active: z.boolean() }).strict();

export type ConnectionView = { id: string; label: string; provider: string; status: "active" | "paused"; metrics: SourceMetric[]; timezone: string; version: number; adopted: boolean; syncing: boolean; lastAttemptAt: string | null; lastSuccessAt: string | null; error: string | null };
export type ComparisonDay = { date: string; digest: string; current: { total: string | null; resting: string | null; active: string | null; steps: number | null }; proposed: { total: string | null; resting: string | null; active: string | null; steps: number | null }; mode: "source" | "manual" | "unadopted"; canAdopt: boolean; reason: string | null; activityCount: number; manualActivities: { id: string; name: string; version: number }[]; coverageUntil: string | null };
export type ConflictView = { id: string; version: number; date: string; name: string; sourceId: string; candidates: { id: string; version: number; name: string; durationMinutes: string | null; caloriesKcal: string | null }[] };
export type SourcesView = { enabled: boolean; connections: ConnectionView[]; policy: SourcePolicy; comparison: ComparisonDay[]; conflicts: ConflictView[]; today: string };

/** 只检查服务器固定账号，不把 owner 角色当作试运行资格。 */
export function sourcePilotEnabled(userId: string, configured = process.env.FORMWARD_DATA_SOURCE_USER_ID) {
  return !!configured?.trim() && userId === configured.trim();
}
