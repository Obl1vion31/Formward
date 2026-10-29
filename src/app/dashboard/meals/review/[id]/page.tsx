import { notFound, redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { loadRecordReview } from "@/features/records/operations";
import { RecordReview } from "@/features/records/record-review";
import { listEnergySources } from "@/features/activities/sources";
import { removeEnergySourceAction } from "../../../energy/actions";
import { listMeasurementSources } from "@/features/measurements/sources";
import { ApiError } from "@/features/auth/ai-identity";
import { DashboardHeader } from "../../../header";
import { removeSourceAction } from "../../../actions";
import { reviewRecordAction, loadRecordReviewAction } from "../../../ai/actions";
export const metadata = { title: "Formward · 确认记录", referrer: "no-referrer" as const };
export const maxDuration = 60;
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentPageUser(); if (!user) redirect("/");
  const db = getDatabase(), id = (await params).id;
  const operation = await loadRecordReview(db, user.id, id, "meal").catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  const sources = await listMeasurementSources(db, user.id);
  return <main className="dashboard-page"><DashboardHeader email={user.email} owner={user.role === "owner"} /><RecordReview operation={operation} review={reviewRecordAction.bind(null, id, "meal")} load={loadRecordReviewAction.bind(null, id, "meal")} sources={sources} removeSource={removeSourceAction} energySources={await listEnergySources(getDatabase(), user.id)} removeEnergySource={removeEnergySourceAction} /></main>;
}
