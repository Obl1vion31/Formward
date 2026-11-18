import { revalidatePath } from "next/cache";
import { recordReviewActionSchema } from "@/features/records/model";
import { reviewWebRecord } from "@/features/records/web-review";
import { requireAssistantPreview } from "@/features/assistant/chat-preview";
import { removeMeasurementSource } from "@/features/measurements/sources";
import { removeEnergySource } from "@/features/activities/sources";
import {readChatJson} from "@/features/assistant/chat-request";
import { z } from "zod";
import { withWriteSession } from "@/features/auth/server";
import { isAccountRequestOrigin } from "@/features/auth/site-url";
import { getDatabase } from "@/db/client";
import { safeAiError } from "@/features/measurements/ai-api";
import { assertChatAllowed } from "@/features/assistant/chat-config";
import { chatProviderIds } from "@/features/assistant/chat-model";
import { chatSnapshot, controlChat } from "@/features/assistant/chat-store";
import { abortChatRun } from "@/features/assistant/chat-runtime";
const controlSchema = z.object({ action: z.enum(["select_model", "new", "stop", "enable", "revoke", "clear_followup", "select_conversation"]), conversationId:z.string().uuid().optional(), provider: z.enum(chatProviderIds).optional(), runId: z.string().uuid().optional() }).strict();
const schema=z.union([controlSchema,z.object({action:z.literal("review_preview"),previewId:z.string().uuid(),review:recordReviewActionSchema}).strict(),z.object({action:z.literal("remove_preview_source"),previewId:z.string().uuid(),domain:z.enum(["body","energy"]),label:z.string().trim().min(1).max(200)}).strict()]);
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (!isAccountRequestOrigin(request.headers)) return Response.json({ error: "请求来源无效。" }, { status: 403, headers });
  try { return await withWriteSession(request.headers, async owner => {
    if (Number(request.headers.get("content-length")) > 200000) return Response.json({ error: "请求过大。" }, { status: 413, headers });
    const parsed = schema.safeParse(await readChatJson(request,200000));
    if (!parsed.success) return Response.json({ error: "操作格式无效。" }, { status: 400, headers });
    const db=getDatabase(),input=parsed.data;
    if(input.action==="review_preview"||input.action==="remove_preview_source"){
      await requireAssistantPreview(db,owner.id,input.previewId);
      const result=input.action==="review_preview"?await reviewWebRecord(db,owner.id,input.previewId,input.review):input.domain==="body"?await removeMeasurementSource(db,{userId:owner.id,actorId:owner.id},input.label):await removeEnergySource(db,{userId:owner.id,actorId:owner.id},input.label);
      revalidatePath("/dashboard","layout");return Response.json(result,{headers});
    }
    if(input.action!=="stop")assertChatAllowed(owner);
    const stoppedRunId = await controlChat(db, owner.id, input);
    if (stoppedRunId) abortChatRun(stoppedRunId);
    return Response.json(await chatSnapshot(db, owner.id), { headers });
  }); } catch (error) { const failure = safeAiError(error); return Response.json({ error: failure.error.message, code: failure.error.code }, { status: failure.status, headers }); }
}
