import { Suspense } from "react";
import { LocalLoading } from "@/components/local-loading";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { loadRecordReview } from "@/features/records/operations";
import { RecordReview } from "@/features/records/record-review";
import { listEnergySources } from "@/features/activities/sources";
import { removeEnergySourceAction } from "../../../energy/actions";
import { listMeasurementSources } from "@/features/measurements/sources";
import { ApiError } from "@/features/auth/ai-identity";
import { removeSourceAction } from "../../../actions";
import { reviewRecordAction, loadRecordReviewAction } from "../../../ai/actions";
export const metadata = { title: "Formward · 确认记录", referrer: "no-referrer" as const };
export const maxDuration = 60;
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const db = getDatabase(), id = (await params).id;
  const operation = await loadRecordReview(db, user.id, id, "meal").catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  return <main className="dashboard-page"><Suspense fallback={<section className="account-reading-page"><h1>确认记录</h1><LocalLoading/></section>}>{reviewContent(operation)}</Suspense></main>;

  async function reviewContent(operation: NonNullable<Awaited<ReturnType<typeof loadRecordReview>>>){
  const sources = await listMeasurementSources(db, user.id);
  return <RecordReview operation={operation} review={reviewRecordAction.bind(null, id, "meal")} load={loadRecordReviewAction.bind(null, id, "meal")} sources={sources} removeSource={removeSourceAction} energySources={await listEnergySources(getDatabase(), user.id)} removeEnergySource={removeEnergySourceAction} />;
  }
}
