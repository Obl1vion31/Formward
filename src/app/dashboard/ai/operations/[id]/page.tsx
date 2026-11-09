import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { ApiError } from "@/features/auth/ai-tokens";
import { loadRecordReview } from "@/features/records/operations";
import { RecordReview } from "@/features/records/record-review";
import { loadRecordReviewAction, reviewRecordAction } from "../../actions";
import { listEnergySources } from "@/features/activities/sources";
import { removeEnergySourceAction } from "../../../energy/actions";
import { listMeasurementSources } from "@/features/measurements/sources";
import { removeSourceAction } from "../../../actions";
export const metadata: Metadata = { title: "Formward · 确认记录", referrer: "no-referrer" };
export default async function OperationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const id = (await params).id;
  const operation = await loadRecordReview(getDatabase(), user.id, id).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); if (error instanceof ApiError && error.code === "feature_removed") return null; throw error; });
  if (!operation) return <main className="dashboard-page"><h1>身体估算功能已移除</h1><p>本次任务不能继续执行，原草稿保留。请仅使用实测记录重新提交。</p><a href="/dashboard/measurements">查看身体记录</a></main>;
  const sources = await listMeasurementSources(getDatabase(), user.id);
  return <main className="dashboard-page"><RecordReview operation={operation} review={reviewRecordAction.bind(null, id, undefined)} load={loadRecordReviewAction.bind(null, id, undefined)} sources={sources} removeSource={removeSourceAction} energySources={await listEnergySources(getDatabase(), user.id)} removeEnergySource={removeEnergySourceAction} /></main>;
}
