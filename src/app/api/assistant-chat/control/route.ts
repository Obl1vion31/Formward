import {readChatJson} from "@/features/assistant/chat-request";
import { z } from "zod";
import { withCurrentSession } from "@/features/auth/server";
import { isAccountRequestOrigin } from "@/features/auth/site-url";
import { getDatabase } from "@/db/client";
import { safeAiError } from "@/features/measurements/ai-api";
import { assertChatAllowed } from "@/features/assistant/chat-config";
import { chatProviderIds } from "@/features/assistant/chat-model";
import { chatSnapshot, controlChat } from "@/features/assistant/chat-store";
import { abortChatRun } from "@/features/assistant/chat-runtime";
const schema = z.object({ action: z.enum(["select_model", "new", "stop", "enable", "revoke", "clear_followup"]), provider: z.enum(chatProviderIds).optional(), runId: z.string().uuid().optional() }).strict();
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (!isAccountRequestOrigin(request.headers)) return Response.json({ error: "请求来源无效。" }, { status: 403, headers });
  try { return await withCurrentSession(request.headers, async owner => {
    assertChatAllowed(owner);
    if (Number(request.headers.get("content-length")) > 4096) return Response.json({ error: "请求过大。" }, { status: 413, headers });
    const parsed = schema.safeParse(await readChatJson(request,4096));
    if (!parsed.success) return Response.json({ error: "操作格式无效。" }, { status: 400, headers });
    const db = getDatabase(), stoppedRunId = await controlChat(db, owner.id, parsed.data);
    if (stoppedRunId) abortChatRun(stoppedRunId);
    return Response.json(await chatSnapshot(db, owner.id), { headers });
  }); } catch (error) { const failure = safeAiError(error); return Response.json({ error: failure.error.message, code: failure.error.code }, { status: failure.status, headers }); }
}
