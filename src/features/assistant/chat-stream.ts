import {and,eq} from "drizzle-orm";
import type {Database} from "../../db/client";
import {currentSessionIdentity} from "../auth/request-identity";
import {assistantMessage,assistantRun} from "../../db/schema";
import type {ChatEvent,ChatMessage} from "./chat-model";
import {chatRunTiming,chatSnapshot,requireChatAccount,type ChatSend,type StoredRun} from "./chat-store";

export function chatRunStream(
  db:Database,userId:string,input:Pick<ChatSend,"conversationId"|"mealTask">,request:Request,
  started:{row:Pick<StoredRun,"id"|"assistantMessageId">;started?:boolean},options:{skipSessionCheck?:boolean}={},
) {
  const incremental = request.headers.get("x-formward-chat-stream") === "delta-1";
  const encoder = new TextEncoder();
  let closed = false, timer: ReturnType<typeof setTimeout> | undefined;
  let cleanup = () => {};
  return new ReadableStream<Uint8Array>({start(output) {
    const emit = (event:ChatEvent) => {
      if (closed) return;
      try { output.enqueue(encoder.encode("data: "+JSON.stringify(event)+"\n\n")); } catch { cleanup(); }
    };
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

    let last: Pick<ChatMessage,"text"|"steps"|"references"> | undefined;
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
          last = data.messages.find(message => message.id === started.row.assistantMessageId);
          startedAt = data.runTiming?.runId === started.row.id ? data.runTiming.startedAt : undefined;
          initial = false;
          if (data.activeRunId !== started.row.id) { emit({type:"done"}); finish(); return; }
        } else {
          const [row] = await db.select({
            id:assistantRun.id,claimedAt:assistantRun.claimedAt,assistantMessageId:assistantRun.assistantMessageId,state:assistantRun.state,
            text:assistantMessage.text,steps:assistantMessage.steps,references:assistantMessage.references,
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
          if (!last || !row.text.startsWith(last.text)) {
            emit({type:"snapshot",snapshot:await snapshot()});
          } else {
            const key = {runId:row.id,messageId:row.assistantMessageId};
            if (row.text !== last.text) emit({type:"text_delta",...key,offset:last.text.length,text:row.text.slice(last.text.length)});
            if (JSON.stringify([last.steps,last.references]) !== JSON.stringify([row.steps,row.references]))
              emit({type:"progress",...key,steps:row.steps,references:row.references});
          }
          last = row;
        }
        if (!closed) timer = setTimeout(() => void poll(),incremental ? 160 : 800);
      } catch {
        if (!closed) finish();
      }
    }
    void poll();
  },cancel() { cleanup(); }});
}
