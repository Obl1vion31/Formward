import { getDatabase } from "@/db/client";
import { aiApiResponse, aiConfirmationUrl } from "@/features/measurements/ai-api";
import { getAiMeasurementOperation } from "@/features/measurements/ai-operations";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const db = getDatabase();
  return aiApiResponse(request, db, false, async identity => {
    const result = await getAiMeasurementOperation(db, identity.userId, (await context.params).id);
    return { ...result, confirmationUrl: aiConfirmationUrl(request, result.confirmationPath) };
  });
}
