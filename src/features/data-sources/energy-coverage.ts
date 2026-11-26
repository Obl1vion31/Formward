import type { DailyFact, SourceMetric, SourcePolicy } from "./model";

type EnergyMetric = "total" | "resting" | "active";
type EnergyPolicy = Pick<SourcePolicy, "strategy" | "sources">;
export type EnergyConnectionStatus = {
  id: string;
  label: string;
  status: "active" | "paused";
  metrics: SourceMetric[];
  timezone: string;
  adoptedAt: Date | null;
  lastError: string | null;
  syncStartedAt: Date | null;
};
export type EnergyDeviceCoverage = {
  label: string;
  status: "waiting" | "syncing" | "failed";
};

export function energySourceMetrics(policy: EnergyPolicy): EnergyMetric[] {
  return policy.strategy === "total" ? ["total"] : ["resting", "active"];
}

export function energyDeviceCoverage(
  policy: EnergyPolicy,
  connections: EnergyConnectionStatus[],
  dailyFacts: { connectionId: string; date: string; payload: DailyFact }[],
  now: Date,
): EnergyDeviceCoverage | null {
  const metrics = energySourceMetrics(policy);
  const sources = metrics.flatMap(metric => {
    const connection = connections.find(item =>
      item.id === policy.sources[metric] && item.status === "active" &&
      item.adoptedAt && item.metrics.includes(metric),
    );
    return connection ? [{ metric, connection }] : [];
  });
  if (sources.length !== metrics.length ||
      new Set(sources.map(({ connection }) => connection.timezone)).size !== 1) return null;
  const recordsBySource = new Map<string, Map<string, DailyFact>>();
  for (const { connectionId, date, payload } of dailyFacts) {
    const records = recordsBySource.get(connectionId) ?? new Map<string, DailyFact>();
    records.set(date, payload);
    recordsBySource.set(connectionId, records);
  }
  const dates = recordsBySource.get(sources[0].connection.id)?.keys() ?? [];
  const hasCompleteSourceDay = Array.from(dates).some(date => sources.every(({ metric, connection }) => {
    const payload = recordsBySource.get(connection.id)?.get(date);
    return payload?.[metric] != null && (payload.metrics?.includes(metric) ?? true);
  }));
  if (!hasCompleteSourceDay) return null;
  const selected = sources.map(source => source.connection);
  const label = [...new Set(selected.map(connection => connection.label))].join("、");
  const syncing = selected.some(connection => connection.syncStartedAt && +now - +connection.syncStartedAt < 90000);
  return { label, status: syncing ? "syncing" : selected.some(item => item.lastError) ? "failed" : "waiting" };
}

export function hasDeviceEnergyForDate(device: EnergyDeviceCoverage | null, date: string, today: string) {
  return !!device && date === today;
}

export function energyDeviceStatusLabel(device: EnergyDeviceCoverage) {
  if (device.status === "syncing") return device.label + " 正在同步…";
  if (device.status === "failed") return device.label + " 同步未完成";
  return "等待 " + device.label + " 同步";
}
