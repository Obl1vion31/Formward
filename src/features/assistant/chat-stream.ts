import {and,eq} from "drizzle-orm";
import type {Database} from "../../db/client";
import {currentSessionIdentity} from "../auth/request-identity";
import {assistantRun} from "../../db/schema";
import type {ChatEvent} from "./chat-model";
import {chatSnapshot,type ChatSend,type StoredRun} from "./chat-store";
export function chatRunStream(db:Database,userId:string,input:ChatSend,request:Request,started:{started:boolean;row:StoredRun},options:{skipSessionCheck?:boolean}={}){
 const encoder=new TextEncoder();let closed=false,timer:ReturnType<typeof setTimeout>|undefined,cleanup=()=>{};
 return new ReadableStream<Uint8Array>({start(output){
  const emit=(event:ChatEvent)=>{if(closed)return;try{output.enqueue(encoder.encode("data: "+JSON.stringify(event)+"\n\n"));}catch{cleanup();}};
  cleanup=()=>{closed=true;if(timer)clearTimeout(timer);request.signal.removeEventListener("abort",cleanup);};
  request.signal.addEventListener("abort",cleanup,{once:true});if(request.signal.aborted){cleanup();output.close();return;}
  const poll=async()=>{
   try{
    if(!options.skipSessionCheck){const identity=await currentSessionIdentity(request.headers);if(identity.user.id!==userId)throw Error("session changed");}
    const snapshot=await chatSnapshot(db,userId,undefined,input.mealTask?input.conversationId:undefined);if(closed)return;
    emit({type:"snapshot",snapshot});
    const [row]=await db.select({state:assistantRun.state}).from(assistantRun).where(and(eq(assistantRun.id,started.row.id),eq(assistantRun.userId,userId)));
    if(!row||row.state!=="running"){emit({type:"done"});cleanup();try{output.close();}catch{};return;}
    if(!closed)timer=setTimeout(()=>void poll(),800);
   }catch{if(!closed){cleanup();try{output.close();}catch{}}}
  };
  void poll();
 },cancel(){cleanup();}});
}
