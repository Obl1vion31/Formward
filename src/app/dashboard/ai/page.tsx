import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePageUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { loadAiAccessConnections, loadAiAccessOverview } from "@/features/auth/ai-access-overview";
import { regionConfig } from "@/features/auth/regions";
import { AiAccess, AiAccessReading } from "@/features/auth/ai-access";
import { createTokenAction, revokeTokenAction, revokeConnectionAction } from "./actions";
export const metadata: Metadata = { title: "Formward · AI 接入", referrer: "no-referrer" };
export default async function AiAccessPage() {
  const user = await requirePageUser();
  return <main className="dashboard-page"><Suspense fallback={<AiAccessReading />}><AiAccessContent userId={user.id} /></Suspense></main>;
}

async function AiAccessContent({ userId }: { userId: string }) {
  const connections = await loadAiAccessConnections(getDatabase(), userId);
  const overviewPromise = loadAiAccessOverview(getDatabase(), userId, connections);
  return <AiAccess key={userId} canonicalOrigin={regionConfig().canonical} overview={{ connections, tokens: [], submissions: [] }} overviewPromise={overviewPromise} create={createTokenAction} revoke={revokeTokenAction} revokeConnection={revokeConnectionAction} />;
}
