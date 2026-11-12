import {readChatJson} from "@/features/assistant/chat-request";
import { z } from "zod";
import { withCurrentSession } from "@/features/auth/server";
import { isAccountRequestOrigin } from "@/features/auth/site-url";
import { safeAiError } from "@/features/measurements/ai-api";
import { getDatabase } from "@/db/client";
import { assertChatAllowed } from "@/features/assistant/chat-config";
import { chatProviderIds, type ChatEvent } from "@/features/assistant/chat-model";
import { assistantTimezone } from "@/features/assistant/model";
import { chatSnapshot, startChatRun } from "@/features/assistant/chat-store";
import { executeChatRun } from "@/features/assistant/chat-runtime";
export const runtime = "nodejs";
export const maxDuration = 600;
const headers = { "Cache-Control": "private, no-store" };
const inputSchema = z.object({ action: z.enum(["send", "retry", "continue"]), requestId: z.string().uuid(), provider: z.enum(chatProviderIds), conversationId: z.string().uuid(), text: z.string().max(16000).optional(), replyToId: z.string().uuid().optional(), imageIds: z.array(z.string().uuid()).max(8).refine(ids => new Set(ids).size === ids.length).optional(), messageId: z.string().uuid().optional(), timezone: z.string().max(100) }).strict();
export async function GET(request: Request) {
  try { return await withCurrentSession(request.headers, async owner => {
    assertChatAllowed(owner);
    const value = new URL(request.url).searchParams.get("before");
    if (value !== null && (!/^\d{1,10}$/.test(value) || Number(value) < 1)) return Response.json({ error: "历史游标无效。" }, { status: 400, headers });
    return Response.json(await chatSnapshot(getDatabase(), owner.id, value === null ? undefined : Number(value)), { headers });
  }); } catch (error) { const failure = safeAiError(error); return Response.json({ error: failure.error.message, code: failure.error.code }, { status: failure.status, headers }); }
}
export async function POST(request: Request) {
  if (!isAccountRequestOrigin(request.headers)) return Response.json({ error: "请求来源无效。" }, { status: 403, headers });
  try { return await withCurrentSession(request.headers, async owner => {
    assertChatAllowed(owner);
    if (Number(request.headers.get("content-length")) > 80000) return Response.json({ error: "消息过长。" }, { status: 413, headers });
    const parsed = inputSchema.safeParse(await readChatJson(request,80000));
    if (!parsed.success) return Response.json({ error: "消息格式无效，请重新发送。" }, { status: 400, headers });
    const input = { ...parsed.data, timezone: assistantTimezone(parsed.data.timezone) }, db = getDatabase(), started = await startChatRun(db, owner.id, input);
    const encoder = new TextEncoder(), cancellation = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(output) {
        let closed = false;
        const emit = (event: ChatEvent) => { if (!closed) { try { output.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n")); } catch { closed = true; cancellation.abort(); } } };
        const heartbeat = setInterval(() => { if (!closed) { try { output.enqueue(encoder.encode(": keep-alive\n\n")); } catch { cancellation.abort(); } } }, 15000);
        void (async () => {
          try {
            emit({ type: "snapshot", snapshot: await chatSnapshot(db, owner.id) });
            if (started.started) await executeChatRun(db, started.row, input, request, emit, AbortSignal.any([request.signal, cancellation.signal]));
            else emit({ type: "done" });
          } finally { clearInterval(heartbeat); closed = true; try { output.close(); } catch {} }
        })().catch(() => { cancellation.abort(); });
      },
      cancel() { cancellation.abort(); },
    });
    return new Response(body, { headers: { ...headers, "Content-Type": "text/event-stream; charset=utf-8", "X-Accel-Buffering": "no" } });
  }); } catch (error) { const failure = safeAiError(error); return Response.json({ error: failure.error.message, code: failure.error.code }, { status: failure.status, headers }); }
}
