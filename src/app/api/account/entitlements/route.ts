import { getDatabase } from "@/db/client";
import { withCurrentSession } from "@/features/auth/server";
import { loadAssistantEntitlements } from "@/features/assistant/account-access";
import { safeAiError } from "@/features/measurements/ai-api";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try { return await withCurrentSession(request.headers, async owner => Response.json(await loadAssistantEntitlements(getDatabase(), owner.id), { headers })); }
  catch (error) { const failure = safeAiError(error); return Response.json({ error: failure.error.message, code: failure.error.code }, { status: failure.status, headers }); }
}
