import {and,asc,eq,isNull,isNotNull} from "drizzle-orm";
import {randomUUID} from "node:crypto";
import {regionConfig} from "../auth/regions";
import type {Database} from "../../db/client";
import {assistantMessage,assistantRun,assistantUsageRequest} from "../../db/schema";
import {executeChatRun} from "./chat-runtime";
import {reapChatRuns,type StoredRun} from "./chat-store";
import {refundUnfinishedRecognition} from "./recognition-quota";
export async function claimChatJob(db:Database,workerId:string){
 return db.transaction(async tx=>{
  const [row]=await tx.select().from(assistantRun).where(and(eq(assistantRun.state,"running"),isNull(assistantRun.claimedAt),isNotNull(assistantRun.executionInput))).orderBy(asc(assistantRun.createdAt)).limit(1).for("update",{skipLocked:true});
  if(!row)return null;
  if(!row.executionInput){return null;} // 发布前的旧任务不猜测或自动重跑。
  const [claimed]=await tx.update(assistantRun).set({claimedAt:new Date(),workerId,heartbeatAt:new Date()}).where(and(eq(assistantRun.id,row.id),eq(assistantRun.state,"running"),isNull(assistantRun.claimedAt))).returning();
  return claimed??null;
 });
}
export async function interruptChatJob(db:Database,row:StoredRun){
 await db.transaction(async tx=>{
  const [updated]=await tx.update(assistantRun).set({state:"error"}).where(and(eq(assistantRun.id,row.id),eq(assistantRun.userId,row.userId),eq(assistantRun.state,"running"))).returning({id:assistantRun.id});
  if(!updated)return;
  await tx.update(assistantMessage).set({state:"error",error:"后台任务中断，已有内容已保留。请核对原结果后手动继续或重试。"}).where(and(eq(assistantMessage.id,row.assistantMessageId),eq(assistantMessage.userId,row.userId)));
  await tx.update(assistantUsageRequest).set({state:"unknown"}).where(and(eq(assistantUsageRequest.runId,row.id),eq(assistantUsageRequest.userId,row.userId),eq(assistantUsageRequest.state,"reserved")));
  await refundUnfinishedRecognition(tx as unknown as Database,row.userId,row);
 });
}
export async function executeChatJob(db:Database,row:StoredRun,signal:AbortSignal,options:Parameters<typeof executeChatRun>[6]={}){
 const input=row.executionInput;
 if(!input||input.requestId!==row.requestId||input.provider!==row.provider||input.conversationId!==row.conversationId){await interruptChatJob(db,row);return;}
 const controller=new AbortController(),stop=()=>controller.abort();signal.addEventListener("abort",stop,{once:true});if(signal.aborted)stop();
 let checking=false;
 const timer=setInterval(()=>{if(checking)return;checking=true;void db.update(assistantRun).set({heartbeatAt:new Date()}).where(and(eq(assistantRun.id,row.id),eq(assistantRun.state,"running"),eq(assistantRun.workerId,row.workerId!))).returning({id:assistantRun.id}).then(rows=>{if(!rows.length)stop();}).catch(stop).finally(()=>{checking=false;});},1000);
 try{const config=regionConfig(),origin=config.enabled?config.cn:process.env.BETTER_AUTH_URL??"http://localhost:3000";
  // 内部任务只采用管理员配置的来源；不接受浏览器伪造的代理头或Cookie。
  const request=new Request(new URL("/api/assistant-chat",origin),{headers:config.enabled?{"x-formward-public-origin":origin,"x-formward-region":"cn"}:{}});
  await executeChatRun(db,row,input,request,()=>{},controller.signal,{...options,skipSessionCheck:true});}
 catch{await interruptChatJob(db,row);}
 finally{clearInterval(timer);signal.removeEventListener("abort",stop);}
}
export async function runChatWorker(db:Database,signal:AbortSignal,options:Parameters<typeof executeChatRun>[6]={}){
 const workerId=randomUUID(),active=new Set<Promise<void>>();let lastReap=0,fatal:unknown;
 try{while(!signal.aborted&&!fatal){
  if(Date.now()-lastReap>10000){const stale=await db.selectDistinct({userId:assistantRun.userId}).from(assistantRun).where(eq(assistantRun.state,"running"));for(const row of stale)await reapChatRuns(db,row.userId);lastReap=Date.now();}
  if(active.size<2){const row=await claimChatJob(db,workerId);if(row){const task=executeChatJob(db,row,signal,options).catch(error=>{fatal=error;}).finally(()=>active.delete(task));active.add(task);continue;}}
  await new Promise<void>(resolve=>{const finish=()=>{clearTimeout(timer);signal.removeEventListener("abort",finish);resolve();},timer=setTimeout(finish,500);signal.addEventListener("abort",finish,{once:true});});
 }if(fatal)throw fatal;}finally{await Promise.allSettled(active);}
}
