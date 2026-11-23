import {and,eq} from "drizzle-orm";
import type {Database} from "../../db/client";
import {currentSessionIdentity} from "../auth/request-identity";
import {assistantMessage,assistantRun} from "../../db/schema";
import {chatPhotoProgress,type ChatEvent,type ChatMessage} from "./chat-model";
import {chatRunTiming,chatSnapshot,requireChatAccount,type ChatSend,type StoredRun} from "./chat-store";

export function chatRunStream(
  db:Database,userId:string,input:Pick<ChatSend,"conversationId"|"mealTask">,request:Request,
  started:{row:Pick<StoredRun,"id"|"assistantMessageId">;started?:boolean},options:{skipSessionCheck?:boolean; acceptedRequestId?:string}={},
) {
  const negotiated = request.headers.get("formward-chat-stream") === "delta-1";
  const incremental = negotiated || request.headers.get("x-formward-chat-stream") === "delta-1";
  const encoder = new TextEncoder();
  let closed = false, timer: ReturnType<typeof setTimeout> | undefined;
  let cleanup = () => {};
  return new ReadableStream<Uint8Array>({start(output) {
    let lastFrameAt = Date.now();
    const write = (frame: string) => {
      if (closed) return;
      try {
        output.enqueue(encoder.encode(frame));
        lastFrameAt = Date.now();
      } catch { cleanup(); }
    };
    const emit = (event:ChatEvent) => write("data: "+JSON.stringify(event)+"\n\n");
    const finish = () => {
      cleanup();
      try { output.close(); } catch { /* 客户端可能已取消。 */ }
    };
    cleanup = () => {
      closed = true;
      clearTimeout(timer);
      request.signal.removeEventListener("abort",finish);
    };
    request.signal.addEventListener("abort",finish,{once:true});
    if (request.signal.aborted) { finish(); return; }
    if (negotiated && options.acceptedRequestId) emit({type:"accepted",conversationId:input.conversationId,
      requestId:options.acceptedRequestId,runId:started.row.id});

    let last: Pick<ChatMessage,"text"|"steps"|"references"|"photoProgress"> | undefined;
    let startedAt: string | null | undefined, lastAuth = 0, initial = true;
    const snapshot = () => chatSnapshot(db,userId,undefined,
      input.mealTask ? input.conversationId : undefined,input.mealTask ? undefined : input.conversationId);
    async function poll() {
      try {
        if (Date.now() - lastAuth >= 800) {
          if (!options.skipSessionCheck && (await currentSessionIdentity(request.headers)).user.id !== userId) throw Error("session changed");
          await requireChatAccount(db,userId,input.mealTask ? "meal_entry" : "chat");
          lastAuth = Date.now();
        }
        if (closed) return;
        if (initial || !incremental) {
          const data = await snapshot();
          emit({type:"snapshot",snapshot:data});
          last = [...data.messages, ...(data.photoUpdates ?? [])].find(message => message.id === started.row.assistantMessageId);
          startedAt = data.runTiming?.runId === started.row.id ? data.runTiming.startedAt : undefined;
          initial = false;
          if (data.activeRunId !== started.row.id) { emit({type:"done"}); finish(); return; }
        } else {
          const [row] = await db.select({
            id:assistantRun.id,claimedAt:assistantRun.claimedAt,assistantMessageId:assistantRun.assistantMessageId,state:assistantRun.state,
            text:assistantMessage.text,steps:assistantMessage.steps,references:assistantMessage.references,executionInput:assistantRun.executionInput,
          }).from(assistantRun).innerJoin(assistantMessage,and(eq(assistantMessage.id,assistantRun.assistantMessageId),
            eq(assistantMessage.userId,userId),eq(assistantMessage.conversationId,input.conversationId)))
            .where(and(eq(assistantRun.id,started.row.id),eq(assistantRun.userId,userId),eq(assistantRun.conversationId,input.conversationId)));
          if (!row || row.state !== "running") {
            emit({type:"snapshot",snapshot:await snapshot()});
            emit({type:"done"});
            finish();
            return;
          }
          const claimedAt = row.claimedAt?.toISOString() ?? null;
          if (claimedAt !== startedAt) { startedAt = claimedAt; emit({type:"timing",timing:chatRunTiming(row)}); }
          const photoProgress = chatPhotoProgress(row.executionInput);
          if (!last || !row.text.startsWith(last.text)) {
            emit({type:"snapshot",snapshot:await snapshot()});
          } else {
            const key = {runId:row.id,messageId:row.assistantMessageId};
            if (row.text !== last.text) emit({type:"text_delta",...key,offset:last.text.length,text:row.text.slice(last.text.length)});
            if (JSON.stringify([last.steps,last.references,last.photoProgress]) !== JSON.stringify([row.steps,row.references,photoProgress]))
              emit({type:"progress",...key,steps:row.steps,references:row.references,photoProgress});
          }
          last = {...row,photoProgress};
        }
        if (Date.now() - lastFrameAt >= 15000) write(": heartbeat\n\n");
        if (!closed) timer = setTimeout(() => void poll(),incremental ? 160 : 800);
      } catch {
        if (!closed) finish();
      }
    }
    void poll();
  },cancel() { cleanup(); }});
}
