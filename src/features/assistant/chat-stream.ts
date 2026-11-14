import type { Database } from "../../db/client";
import type { ChatEvent } from "./chat-model";
import { chatSnapshot, type ChatSend, type StoredRun } from "./chat-store";
import { executeChatRun } from "./chat-runtime";

export function chatRunStream(db:Database,userId:string,input:ChatSend,request:Request,started:{started:boolean;row:StoredRun}){
 const encoder=new TextEncoder(),cancellation=new AbortController();
 return new ReadableStream<Uint8Array>({start(output){
  let closed=false;
  const emit=(event:ChatEvent)=>{if(!closed)try{output.enqueue(encoder.encode("data: "+JSON.stringify(event)+"\n\n"));}catch{closed=true;cancellation.abort();}};
  const heartbeat=setInterval(()=>{if(!closed)try{output.enqueue(encoder.encode(": keep-alive\n\n"));}catch{cancellation.abort();}},15000);
  void(async()=>{try{
   emit({type:"snapshot",snapshot:await chatSnapshot(db,userId,undefined,input.mealTask?input.conversationId:undefined)});
   if(started.started)await executeChatRun(db,started.row,input,request,emit,AbortSignal.any([request.signal,cancellation.signal]));else emit({type:"done"});
  }finally{clearInterval(heartbeat);closed=true;try{output.close();}catch{}}})().catch(()=>cancellation.abort());
 },cancel(){cancellation.abort();}});
}
