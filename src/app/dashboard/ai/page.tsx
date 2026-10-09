import type { Metadata } from "next";
import { Suspense } from "react";
import { RouteLoading } from "@/components/page-loading";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { listAiTokens } from "@/features/auth/ai-tokens";
import { listAiMeasurementOperations } from "@/features/measurements/ai-operations";
import { AiAccess } from "@/features/auth/ai-access";
import { DashboardHeader } from "../header";
import { createTokenAction, revokeTokenAction } from "./actions";
export const metadata: Metadata = { title: "Formward · AI 接入", referrer: "no-referrer" };
export default async function AiAccessPage() {
  const user = await currentPageUser(); if (!user) redirect("/");
  return <Suspense fallback={<RouteLoading />}><AiAccessContent user={user} /></Suspense>;
}

async function AiAccessContent({ user }: { user: NonNullable<Awaited<ReturnType<typeof currentPageUser>>> }) {
  const db = getDatabase(), tokens = await listAiTokens(db, user.id), operations = await listAiMeasurementOperations(db, user.id);
  return <main className="dashboard-page"><DashboardHeader email={user.email} /><AiAccess tokens={tokens} operations={operations} create={createTokenAction} revoke={revokeTokenAction} /></main>;
}
