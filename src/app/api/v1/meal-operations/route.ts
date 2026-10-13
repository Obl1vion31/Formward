import { getDatabase } from "@/db/client";
import { aiApiResponse, readAiJson, aiConfirmationUrl } from "@/features/measurements/ai-api";
import { submitMealOperation } from "@/features/meals/records";
export const maxDuration = 60;
export async function POST(request: Request) { return aiApiResponse(request, getDatabase(), true, async identity => { const op = await submitMealOperation(getDatabase(), { userId: identity.userId, origin: "ai", identity }, await readAiJson(request)); return { ...op, confirmationUrl: aiConfirmationUrl(request, op.confirmationPath) }; }); }
