import { getDatabase } from "@/db/client";
import { aiApiResponse, aiConfirmationUrl } from "@/features/measurements/ai-api";
import { getMealOperation, displayMealOperation } from "@/features/meals/records";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return aiApiResponse(request, getDatabase(), false, async identity => { const op = displayMealOperation(await getMealOperation(getDatabase(), identity.userId, (await params).id)); return { ...op, confirmationUrl: aiConfirmationUrl(request, op.confirmationPath) }; }); }
