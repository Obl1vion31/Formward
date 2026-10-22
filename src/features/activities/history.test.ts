import assert from "node:assert/strict";
import { test } from "node:test";
import { energyHistoryActions } from "./history";
import { emptyEnergy, type EnergyDayRecord, type EnergySnapshot } from "./model";
import { planEnergyActions } from "./records";
const record = (patch: Partial<EnergyDayRecord>): EnergyDayRecord => ({ id: "00000000-0000-4000-8000-000000000001", version: 2, deletedAt: null, date: "2024-08-02", restingKcal: null, activeKcal: "300", totalKcal: null, timezone: "Asia/Shanghai", sourceSystem: "虚构活动设备", sourceRecordId: null, sourceOccurredAt: null, sourceUnit: "kcal", syncStatus: "confirmed", ...patch });
test("历史只补明确范围缺项，保留活动、总数、来源与原始快照", () => {
  const snapshot: EnergySnapshot = { ...emptyEnergy(), days: [record({}), record({ id: "00000000-0000-4000-8000-000000000002", date: "2024-08-03", totalKcal: "2500", restingKcal: "1800" })] };
  const original = structuredClone(snapshot);
  const actions = energyHistoryActions(snapshot,{from:"2024-08-01",to:"2024-08-03",restingKcal:"1900",restingSourceSystem:"虚构静息设备"});
  assert.equal(actions.length,2); assert.equal(actions[0].kind,"save_energy_day");
  const preview=planEnergyActions(actions,snapshot);
  assert.ok(preview.every(row=>!row.error));
  const second=preview[1].after!; assert.ok("activeKcal" in second); if("activeKcal" in second) { assert.equal(second.activeKcal,"300"); assert.equal(second.activeSourceSystem,"虚构活动设备"); assert.equal(second.restingSourceSystem,"虚构静息设备"); }
  assert.deepEqual(snapshot,original);
  const applied={...snapshot,days:[preview[0].after as EnergyDayRecord,preview[1].after as EnergyDayRecord,snapshot.days[1]]};
  assert.deepEqual(energyHistoryActions(applied,{from:"2024-08-01",to:"2024-08-03",restingKcal:"1900"}),[]);
});
test("已有未知热量运动不被初始化零掩盖，范围外不生成记录",()=>{
  const snapshot: EnergySnapshot={...emptyEnergy(),activities:[{...record({}),name:"虚构未知运动",durationMinutes:null,caloriesKcal:null,completed:true}]};
  const actions=energyHistoryActions(snapshot,{from:"2024-08-02",to:"2024-08-02",restingKcal:"1900"});
  const action=actions[0];assert.equal(actions.length,1);assert.ok(action.kind==="save_energy_day");if(action.kind==="save_energy_day"){assert.equal(action.activeKcal,undefined);assert.equal(action.activityMode,"activities");assert.equal(action.date,"2024-08-02");}
  assert.throws(()=>energyHistoryActions(snapshot,{from:"2024-08-02",to:"2024-08-01",restingKcal:"1900"}));
});
