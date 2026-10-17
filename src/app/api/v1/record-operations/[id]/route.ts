import { getDatabase } from "@/db/client";
import { aiApiResponse, aiConfirmationUrl } from "@/features/measurements/ai-api";
import { getRecordOperation } from "@/features/records/operations";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDatabase();
  return aiApiResponse(request, db, false, async identity => {
    const operation = await getRecordOperation(db, identity, (await params).id);
    return { ...operation, confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
  });
}
