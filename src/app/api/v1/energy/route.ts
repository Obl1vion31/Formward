import { getDatabase } from "@/db/client";
import { aiApiResponse, aiRequestTimezone } from "@/features/measurements/ai-api";
import { queryEnergy } from "@/features/activities/ai-api";
export async function GET(request: Request) {
  const db = getDatabase();
  return aiApiResponse(request, db, false, identity => { const params = new URL(request.url).searchParams; if (!params.has("timezone")) params.set("timezone", aiRequestTimezone(request)); return queryEnergy(db, identity.userId, params); });
}
