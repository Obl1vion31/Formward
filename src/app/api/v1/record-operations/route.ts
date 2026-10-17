import { getDatabase } from "@/db/client";
import { aiApiResponse, aiConfirmationUrl, aiRequestTimezone, readAiJson } from "@/features/measurements/ai-api";
import { submitRecordOperation } from "@/features/records/operations";
export const maxDuration = 60;
export async function POST(request: Request) {
  const db = getDatabase();
  return aiApiResponse(request, db, true, async identity => {
    const operation = await submitRecordOperation(db, identity, await readAiJson(request), aiRequestTimezone(request));
    return { ...operation, confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
  });
}
