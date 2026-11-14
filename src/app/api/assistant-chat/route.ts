import { loadAssistantPreview } from "@/features/assistant/chat-preview";
import { followupSubmissionSchema } from "@/features/assistant/followup";
import {readChatJson} from "@/features/assistant/chat-request";
import { z } from "zod";
import { withCurrentSession } from "@/features/auth/server";
import { isAccountRequestOrigin } from "@/features/auth/site-url";
import { safeAiError } from "@/features/measurements/ai-api";
import { getDatabase } from "@/db/client";
import { assertChatAllowed } from "@/features/assistant/chat-config";
import { chatProviderIds } from "@/features/assistant/chat-model";
import { assistantTimezone } from "@/features/assistant/model";
import { chatSnapshot, startChatRun } from "@/features/assistant/chat-store";
import { chatRunStream } from "@/features/assistant/chat-stream";
export const runtime = "nodejs";
export const maxDuration = 600;
const headers = { "Cache-Control": "private, no-store" };
const inputSchema = z.object({ action: z.enum(["send", "retry", "continue"]), requestId: z.string().uuid(), provider: z.enum(chatProviderIds), conversationId: z.string().uuid(), text: z.string().max(16000).optional(), replyToId: z.string().uuid().optional(), imageIds: z.array(z.string().uuid()).max(8).refine(ids => new Set(ids).size === ids.length).optional(), messageId: z.string().uuid().optional(), timezone: z.string().max(100), followup:followupSubmissionSchema.optional() }).strict();
export async function GET(request: Request) {
  try { return await withCurrentSession(request.headers, async owner => {
    assertChatAllowed(owner);
    const previewId=new URL(request.url).searchParams.get("previewId");
    if(previewId){if(!z.string().uuid().safeParse(previewId).success)return Response.json({error:"提交编号无效。"},{status:400,headers});return Response.json(await loadAssistantPreview(getDatabase(),owner.id,previewId),{headers});}
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
    return new Response(chatRunStream(db,owner.id,input,request,started),{headers:{...headers,"Content-Type":"text/event-stream; charset=utf-8","X-Accel-Buffering":"no"}});
  }); } catch (error) { const failure = safeAiError(error); return Response.json({ error: failure.error.message, code: failure.error.code }, { status: failure.status, headers }); }
}
