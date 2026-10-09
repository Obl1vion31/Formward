import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { ApiError } from "@/features/auth/ai-tokens";
import { getAiMeasurementOperation } from "@/features/measurements/ai-operations";
import { AiConfirmation } from "@/features/measurements/ai-confirmation";
import { DashboardHeader } from "../../../header";
import { loadOperationAction, reviewOperationAction } from "../../actions";
export const metadata: Metadata = { title: "Formward · 确认身体记录", referrer: "no-referrer" };
export default async function OperationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentPageUser(); if (!user) redirect("/");
  const operation = await getAiMeasurementOperation(getDatabase(), user.id, (await params).id).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  return <main className="dashboard-page"><DashboardHeader email={user.email} /><AiConfirmation operation={operation} review={reviewOperationAction} load={loadOperationAction} /></main>;
}
