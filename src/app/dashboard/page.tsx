import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { listMeasurements } from "@/features/measurements/records";
import { MeasurementsView } from "@/features/measurements/measurements-view";
import { LogoutButton } from "./logout-button";

export const metadata: Metadata = { title: "Formward · 身体记录" };

export default async function DashboardPage() {
  const user = await currentUser(await headers());
  if (!user) redirect("/");
  const records = await listMeasurements(getDatabase(), user.id);

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <a className="dashboard-logo" href="/dashboard" aria-label="Formward 主页">formward<span>.</span></a>
        <div className="dashboard-account"><span>{user.email}</span><LogoutButton /></div>
      </header>
      <MeasurementsView records={records.map((row) => ({
        id: row.id, analysisDate: row.analysisDate, localDate: row.localDate, period: row.period,
        weightKg: row.weightKg, bodyFatPercent: row.bodyFatPercent, bmi: row.bmi,
        fasting: row.fasting, sourceLocalTime: row.sourceLocalTime, timezone: row.timezone,
        sourceType: row.sourceType, sourceSystem: row.sourceSystem, sourceRecordId: row.sourceRecordId,
        recordKind: row.recordKind, entryChannel: row.entryChannel, deviceName: row.deviceName,
        companionApp: row.companionApp, estimation: row.estimation, timePrecision: row.timePrecision,
      }))} />
    </main>
  );
}
