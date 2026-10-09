import { getDatabase } from "@/db/client";
import { aiApiResponse, aiConfirmationUrl, aiRequestTimezone, readAiJson } from "@/features/measurements/ai-api";
import { submitAiMeasurementOperation } from "@/features/measurements/ai-operations";
export async function POST(request: Request) {
  const db = getDatabase();
  return aiApiResponse(request, db, true, async identity => {
    const result = await submitAiMeasurementOperation(db, identity, await readAiJson(request), aiRequestTimezone(request));
    return { ...result, confirmationUrl: aiConfirmationUrl(request, result.confirmationPath) };
  });
}
