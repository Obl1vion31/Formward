import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { ApiError } from "@/features/auth/ai-tokens";
import { loadRecordReview } from "@/features/records/operations";
import { RecordReview } from "@/features/records/record-review";
import { DashboardHeader } from "../../../header";
import { loadRecordReviewAction, reviewRecordAction } from "../../actions";
import { listEnergySources } from "@/features/activities/sources";
import { removeEnergySourceAction } from "../../../energy/actions";
import { listMeasurementSources } from "@/features/measurements/sources";
import { removeSourceAction } from "../../../actions";
export const metadata: Metadata = { title: "Formward · 确认记录", referrer: "no-referrer" };
export default async function OperationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentPageUser(); if (!user) redirect("/");
  const id = (await params).id;
  const operation = await loadRecordReview(getDatabase(), user.id, id).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  const sources = await listMeasurementSources(getDatabase(), user.id);
  return <main className="dashboard-page"><DashboardHeader email={user.email} /><RecordReview operation={operation} review={reviewRecordAction.bind(null, id, undefined)} load={loadRecordReviewAction.bind(null, id, undefined)} sources={sources} removeSource={removeSourceAction} energySources={await listEnergySources(getDatabase(), user.id)} removeEnergySource={removeEnergySourceAction} /></main>;
}
