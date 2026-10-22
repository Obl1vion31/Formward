import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { energyActionSchema, energyModes, type EnergyAction, type EnergySnapshot } from "./model";

/** 明确范围的一次性预览构造，不写事实、不建立默认规则；数值仅从私有请求传入。 */
export function energyHistoryActions(snapshot: EnergySnapshot, input: { from: string; to: string; restingKcal: string; restingSourceSystem?: string | null }): EnergyAction[] {
  const length = calendarOrdinal(input.to) - calendarOrdinal(input.from) + 1;
  if (length < 1 || length > 100) throw new Error("历史范围须为1–100日。");
  const actions: EnergyAction[] = [];
  for (let i = 0; i < length; i++) {
    const date = addCalendarDays(input.from, i), current = snapshot.days.find(row => row.date === date && !row.deletedAt);
    const modes = energyModes(current);
    if (modes.entryMode === "total") continue;
    const activities = snapshot.activities.filter(row => row.date === date && !row.deletedAt);
    const fillResting = current?.restingKcal == null;
    const fillZero = current?.activeKcal == null && !activities.length && current?.activityMode !== "activities";
    if (!fillResting && !fillZero) continue;
    actions.push(energyActionSchema.parse({ kind: "save_energy_day", ...(current ? { id: current.id, version: current.version } : {}), date, entryMode: "components", activityMode: fillZero ? "total" : modes.activityMode,
      ...(fillResting ? { restingKcal: input.restingKcal, restingEstimated: true, ...(input.restingSourceSystem === undefined ? {} : { restingSourceSystem: input.restingSourceSystem }) } : {}),
      ...(fillZero ? { activeKcal: "0", activeEstimated: true, activeSourceSystem: null } : {}) }));
  }
  return actions;
}
