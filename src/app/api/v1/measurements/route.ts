import { getDatabase } from "@/db/client";
import { aiApiResponse, aiRequestTimezone, queryAiMeasurements } from "@/features/measurements/ai-api";
export async function GET(request: Request) {
  const db = getDatabase();
  return aiApiResponse(request, db, false, identity => queryAiMeasurements(db, identity.userId, new URL(request.url).searchParams, aiRequestTimezone(request)));
}
