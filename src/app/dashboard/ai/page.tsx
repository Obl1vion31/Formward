import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/features/auth/server";
import { getDatabase } from "@/db/client";
import { listAiTokens } from "@/features/auth/ai-tokens";
import { listAiMeasurementOperations } from "@/features/measurements/ai-operations";
import { AiAccess } from "@/features/auth/ai-access";
import { DashboardHeader } from "../header";
import { createTokenAction, revokeTokenAction } from "./actions";
export const metadata: Metadata = { title: "Formward · AI 接入", referrer: "no-referrer" };
export default async function AiAccessPage() {
  const user = await currentUser(await headers()); if (!user) redirect("/");
  const db = getDatabase(), tokens = await listAiTokens(db, user.id), operations = await listAiMeasurementOperations(db, user.id);
  return <main className="dashboard-page"><DashboardHeader email={user.email} /><AiAccess tokens={tokens} operations={operations} create={createTokenAction} revoke={revokeTokenAction} /></main>;
}
