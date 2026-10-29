import type { Metadata } from "next";
import { Suspense } from "react";
import { RouteLoading } from "@/components/page-loading";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { listAiTokens } from "@/features/auth/ai-tokens";
import { listOauthConnections } from "@/features/auth/oauth-connections";
import { listAiMeasurementOperations } from "@/features/measurements/ai-operations";
import { listMealOperations } from "@/features/meals/records";
import { listRecordOperations } from "@/features/records/operations";
import { AiAccess } from "@/features/auth/ai-access";
import { DashboardHeader } from "../header";
import { createTokenAction, revokeTokenAction, revokeConnectionAction } from "./actions";
export const metadata: Metadata = { title: "Formward · AI 接入", referrer: "no-referrer" };
export default async function AiAccessPage() {
  const user = await currentPageUser(); if (!user) redirect("/");
  return <Suspense fallback={<RouteLoading />}><AiAccessContent user={user} /></Suspense>;
}

async function AiAccessContent({ user }: { user: NonNullable<Awaited<ReturnType<typeof currentPageUser>>> }) {
  const db = getDatabase(), tokens = await listAiTokens(db, user.id), operations = await listAiMeasurementOperations(db, user.id), connections = await listOauthConnections(db, user.id);
  const recordOperations = await listRecordOperations(db, user.id);
  const mealOperations = (await listMealOperations(db, user.id)).filter(operation => !recordOperations.some(record => record.mealOperationId === operation.id));
  const standaloneBodies = operations.filter(operation => !recordOperations.some(record => record.measurementOperationId === operation.id));
  return <main className="dashboard-page"><DashboardHeader email={user.email} owner={user.role === "owner"} /><AiAccess recordOperations={recordOperations} mealOperations={mealOperations} tokens={tokens} operations={standaloneBodies} connections={connections} create={createTokenAction} revoke={revokeTokenAction} revokeConnection={revokeConnectionAction} /></main>;
}
